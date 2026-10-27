// Catálogo desde el panel (Railway). Se usa en el build cuando existe BLEND_API_URL;
// si no, la web sigue leyendo los Markdown de src/content.
// Las fotos se descargan a .blend-cache/media y se procesan como cualquier imagen local
// (AVIF/WebP, srcset), así los componentes no cambian.
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Loader } from 'astro/loaders';

export const API_URL = process.env.BLEND_API_URL?.replace(/\/$/, '');
// Enciende el carrito y el pago en línea desde Vercel (además de site.checkoutEnabled).
export const CHECKOUT_ON = process.env.BLEND_CHECKOUT === 'on';
const CACHE = '.blend-cache';
// Ruta de referencia de las entradas: las fotos se resuelven relativas a ella (./media/…).
const ENTRY_FILE = `${CACHE}/catalog.json`;

type Photo = { src: string; width: number; height: number; alt: string; focus: string; fit: 'cover' | 'contain' };
type Variant = { id: string; name: string; price: number; trackStock: boolean };
type ApiProduct = {
  id: string;
  slug: string;
  type: 'drink' | 'ebook';
  name: string;
  order: number;
  headline: string;
  description: string;
  seoDescription: string;
  variants: Variant[];
  [k: string]: unknown;
};
export type ApiCatalog = {
  products: ApiProduct[];
  bundles: {
    id: string;
    slug: string;
    name: string;
    description: string;
    size: number;
    // fixed: price es el de la caja. per_item: cada sabor vale prices[variantId] y price es el "desde".
    pricing: 'fixed' | 'per_item';
    price: number;
    prices: Record<string, number>;
    featured: boolean;
    order: number;
    image: Photo | null;
    variantIds: string[];
  }[];
  delivery: { fee: number | null; cities: string[]; note: string };
};

let pending: Promise<ApiCatalog> | null = null;
export function fetchCatalog(): Promise<ApiCatalog> {
  pending ??= (async () => {
    const res = await fetch(`${API_URL}/api/catalog`);
    if (!res.ok) throw new Error(`El catálogo respondió ${res.status} (${API_URL})`);
    const catalog = (await res.json()) as ApiCatalog;
    await mkdir(join(CACHE, 'media'), { recursive: true });
    await writeFile(ENTRY_FILE, JSON.stringify(catalog));
    return catalog;
  })();
  return pending;
}

// Descarga la foto (si no está ya: las claves son inmutables) y devuelve la ruta para image().
async function local(photo: Photo | null | undefined) {
  if (!photo) return undefined;
  const name = photo.src.split('/').pop()!;
  const path = join(CACHE, 'media', name);
  if (!existsSync(path)) {
    const res = await fetch(photo.src);
    if (!res.ok) throw new Error(`No se pudo descargar ${photo.src} (${res.status})`);
    await writeFile(path, new Uint8Array(await res.arrayBuffer()));
  }
  return { src: `./media/${name}`, alt: photo.alt, focus: photo.focus, fit: photo.fit };
}

async function drinkData(p: ApiProduct) {
  const photos = p as unknown as { card: Photo; hero: Photo; cutout: Photo | null; gallery: Photo[] };
  return {
    productId: p.id,
    name: p.name,
    line: p.line,
    order: p.order,
    headline: p.headline,
    description: p.description,
    ingredients: p.ingredients,
    extras: p.extras,
    volume: p.volume,
    badges: p.badges,
    flavor: p.flavor,
    // La lata es la primera variante: es el precio que muestran las tarjetas.
    price: p.variants[0]?.price,
    variants: p.variants,
    provisionalImages: p.provisionalImages,
    card: await local(photos.card),
    hero: await local(photos.hero),
    cutout: await local(photos.cutout),
    gallery: await Promise.all(photos.gallery.map(local)),
    seoDescription: p.seoDescription,
  };
}

async function ebookData(p: ApiProduct) {
  const photos = p as unknown as { cover: Photo | null; samples: Photo[] };
  const cover = await local(photos.cover);
  return {
    productId: p.id,
    title: p.name,
    subtitle: p.subtitle ?? undefined,
    order: p.order,
    cover: cover && { src: cover.src, alt: cover.alt },
    coverColor: p.coverColor ?? undefined,
    coverInk: p.coverInk ?? undefined,
    pages: p.pages ?? undefined,
    format: p.format ?? undefined,
    price: p.variants[0]?.price,
    variants: p.variants,
    summary: p.summary ?? p.description,
    includes: p.includes,
    toc: p.toc,
    samples: (await Promise.all(photos.samples.map(local))).map((s) => ({ src: s!.src, alt: s!.alt })),
    faq: p.faq,
  };
}

export function catalogLoader(type: 'drink' | 'ebook'): Loader {
  return {
    name: `blend-api-${type}`,
    load: async ({ store, parseData, logger }) => {
      const catalog = await fetchCatalog();
      store.clear();
      for (const p of catalog.products.filter((x) => x.type === type)) {
        const raw = type === 'drink' ? await drinkData(p) : await ebookData(p);
        const data = await parseData({ id: p.slug, data: JSON.parse(JSON.stringify(raw)), filePath: ENTRY_FILE });
        store.set({ id: p.slug, data, filePath: ENTRY_FILE });
      }
      logger.info(`${type === 'drink' ? 'Bebidas' : 'E-books'} desde ${API_URL}`);
    },
  };
}

export function bundlesLoader(): Loader {
  return {
    name: 'blend-api-bundles',
    load: async ({ store, parseData }) => {
      store.clear();
      if (!API_URL) return;
      const catalog = await fetchCatalog();
      for (const item of catalog.bundles) {
        const data = { ...item, image: (await local(item.image)) ?? undefined };
        store.set({
          id: item.id,
          data: await parseData({ id: item.id, data: JSON.parse(JSON.stringify(data)), filePath: ENTRY_FILE }),
          filePath: ENTRY_FILE,
        });
      }
    },
  };
}

// Domicilio: una sola entrada ("config") con la tarifa y los municipios del Quindío.
export function deliveryLoader(): Loader {
  return {
    name: 'blend-api-delivery',
    load: async ({ store, parseData }) => {
      store.clear();
      if (!API_URL) return;
      const { delivery } = await fetchCatalog();
      store.set({ id: 'config', data: await parseData({ id: 'config', data: delivery }) });
    },
  };
}

// ── Precio de los combos ───────────────────────────────────────────────────
// La web solo los muestra: el total que se cobra lo recalcula siempre el servidor.

type BundlePricing = { pricing: 'fixed' | 'per_item'; price: number; prices: Record<string, number> };

// Precio de una unidad de ese sabor dentro del combo (en "fixed": la caja dividida por igual).
export function bundleUnitPrice(bundle: BundlePricing & { size: number }, variantId: string): number {
  return bundle.pricing === 'per_item' ? bundle.prices[variantId] ?? 0 : Math.round(bundle.price / bundle.size);
}

// Total de una caja según lo elegido.
export function bundleTotal(bundle: BundlePricing, picks: { variantId: string; qty: number }[]): number {
  return bundle.pricing === 'per_item' ? picks.reduce((s, p) => s + p.qty * (bundle.prices[p.variantId] ?? 0), 0) : bundle.price;
}
