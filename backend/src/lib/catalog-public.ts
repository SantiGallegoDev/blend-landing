// Catálogo publicado, tal como lo consume la web en su build. Nunca incluye borradores ni archivos privados.
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '../db';
import { env } from '../env';
import { getDelivery } from './delivery';

export async function publicCatalog() {
  const products = await db.query.product.findMany({
    where: eq(schema.product.status, 'active'),
    orderBy: [asc(schema.product.sortOrder), asc(schema.product.name)],
  });
  const ids = products.map((p) => p.id);
  const variants = ids.length
    ? await db.query.variant.findMany({ where: and(inArray(schema.variant.productId, ids), eq(schema.variant.active, true)), orderBy: [asc(schema.variant.sortOrder)] })
    : [];
  const images = ids.length
    ? await db.query.productImage.findMany({ where: inArray(schema.productImage.productId, ids), orderBy: [asc(schema.productImage.sortOrder)] })
    : [];
  const bundles = await db.query.bundle.findMany({ where: eq(schema.bundle.active, true), orderBy: [asc(schema.bundle.sortOrder)] });
  const bundleVariants = bundles.length
    ? await db.select().from(schema.bundleVariant).where(inArray(schema.bundleVariant.bundleId, bundles.map((b) => b.id)))
    : [];
  const delivery = await getDelivery();
  const activeVariantIds = new Set(variants.map((v) => v.id));

  const photo = (i: (typeof images)[number]) => ({
    src: `${env.API_ORIGIN}/${i.key}`,
    width: i.width,
    height: i.height,
    alt: i.alt,
    focus: i.focus,
    fit: i.fit as 'cover' | 'contain',
  });

  return {
    generatedAt: new Date().toISOString(),
    products: products.map((p) => {
      const imgs = images.filter((i) => i.productId === p.id);
      const byRole = (role: string) => imgs.filter((i) => i.role === role).map(photo);
      const common = {
        id: p.id,
        slug: p.slug,
        type: p.type,
        name: p.name,
        order: p.sortOrder,
        headline: p.headline,
        description: p.description,
        seoDescription: p.seoDescription,
        variants: variants
          .filter((v) => v.productId === p.id)
          .map((v) => ({ id: v.id, name: v.name, price: v.price, trackStock: v.trackStock })),
      };
      if (p.type === 'drink') {
        return {
          ...common,
          line: p.line,
          volume: p.volume,
          flavor: p.flavorColor,
          ingredients: p.ingredients,
          extras: p.extras,
          badges: p.badges,
          provisionalImages: p.provisionalImages,
          card: byRole('card')[0] ?? null,
          hero: byRole('hero')[0] ?? byRole('card')[0] ?? null,
          cutout: byRole('cutout')[0] ?? null,
          gallery: byRole('gallery'),
        };
      }
      return {
        ...common,
        subtitle: p.subtitle,
        pages: p.pages,
        format: p.format,
        summary: p.summary,
        includes: p.includes,
        toc: p.toc,
        faq: p.faq,
        coverColor: p.coverColor,
        coverInk: p.coverInk,
        cover: byRole('cover')[0] ?? null,
        samples: byRole('sample'),
        gallery: byRole('gallery'),
      };
    }),
    bundles: bundles.map((b) => ({
      id: b.id,
      slug: b.slug,
      name: b.name,
      description: b.description,
      size: b.size,
      price: b.price,
      variantIds: bundleVariants.filter((bv) => bv.bundleId === b.id && activeVariantIds.has(bv.variantId)).map((bv) => bv.variantId),
      // fixed: price es el de la caja. per_item: cada sabor tiene su precio en el combo (prices) y price es el "desde".
      pricing: b.pricing,
      featured: b.featured,
      order: b.sortOrder,
      image: b.imageKey
        ? { src: `${env.API_ORIGIN}/${b.imageKey}`, width: b.imageWidth!, height: b.imageHeight!, alt: b.imageAlt, focus: b.imageFocus, fit: 'cover' as const }
        : null,
      prices:
        b.pricing === 'per_item'
          ? Object.fromEntries(
              bundleVariants.filter((bv) => bv.bundleId === b.id && activeVariantIds.has(bv.variantId) && bv.unitPrice).map((bv) => [bv.variantId, bv.unitPrice!]),
            )
          : {},
    })),
    // Domicilio: tarifa fija y municipios del Quindío donde se entrega (fee null = aún sin configurar).
    delivery,
  };
}

// Stock en vivo: la web lo consulta al cargar, así el "Agotado" no espera a un build.
// Se publica con tope (20): alcanza para limitar cantidades sin revelar el inventario real.
const STOCK_CAP = 20;
export async function publicStock() {
  const rows = await db
    .select({ id: schema.variant.id, stock: schema.variant.stock, trackStock: schema.variant.trackStock })
    .from(schema.variant)
    .innerJoin(schema.product, eq(schema.variant.productId, schema.product.id))
    .where(and(eq(schema.product.status, 'active'), eq(schema.variant.active, true)));
  return Object.fromEntries(rows.map((r) => [r.id, r.trackStock ? Math.min(r.stock, STOCK_CAP) : null]));
}
