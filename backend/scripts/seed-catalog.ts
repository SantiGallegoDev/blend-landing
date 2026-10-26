// Pasa el catálogo que hoy vive en la web (src/content + src/assets) a la base de datos.
// Se puede correr varias veces: salta los productos cuyo slug ya existe.
//   npm run seed:catalog
// Precios: los del catálogo de agosto 2026 que ya estaban en la web. El stock arranca en 0:
// se carga desde el panel (Inventario).
import { readdir, readFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { parse } from 'yaml';
import { db, schema } from '../src/db';
import type { ImageRole } from '../src/db/schema';
import { markCatalogChanged } from '../src/lib/catalog';
import { storeImage } from '../src/lib/uploads';

const WEB = resolve('..');
const FLOW_LITER_PRICE = 25000;
const SIX_PACK = { slug: 'six-pack-flow', name: 'Six pack Flow', size: 6, price: 42000, description: 'Ármalo con los sabores de Flow que quieras.' };

type Photo = { src: string; alt: string; focus?: string; fit?: 'cover' | 'contain' };

async function frontmatter(path: string) {
  const text = await readFile(path, 'utf8');
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) throw new Error(`Sin frontmatter: ${path}`);
  return parse(match[1]);
}

async function uploadPhoto(productId: string, mdPath: string, photo: Photo, role: ImageRole, sortOrder: number) {
  const file = resolve(dirname(mdPath), photo.src);
  const stored = await storeImage(await readFile(file));
  await db.insert(schema.productImage).values({
    productId,
    role,
    key: stored.key,
    alt: photo.alt,
    focus: photo.focus ?? '50% 50%',
    fit: photo.fit ?? 'cover',
    width: stored.width,
    height: stored.height,
    sortOrder,
  });
  console.log(`   foto ${role.padEnd(7)} ${basename(file)}`);
}

async function seedDrinks() {
  const dir = join(WEB, 'src/content/bebidas');
  const flowLatas: string[] = [];
  for (const file of (await readdir(dir)).filter((f) => f.endsWith('.md')).sort()) {
    const path = join(dir, file);
    const slug = basename(file, '.md');
    const d = await frontmatter(path);
    const exists = await db.query.product.findFirst({ where: eq(schema.product.slug, slug) });
    if (exists) {
      console.log(`= ${slug} ya existe`);
      if (d.line === 'flow') {
        const lata = await db.query.variant.findFirst({ where: eq(schema.variant.productId, exists.id) });
        if (lata) flowLatas.push(lata.id);
      }
      continue;
    }
    console.log(`+ ${d.name}`);
    const [p] = await db
      .insert(schema.product)
      .values({
        slug,
        type: 'drink',
        status: 'active',
        name: d.name,
        sortOrder: d.order ?? 0,
        headline: d.headline ?? '',
        description: d.description ?? '',
        seoDescription: d.seoDescription ?? '',
        line: d.line,
        volume: d.volume,
        flavorColor: d.flavor,
        ingredients: d.ingredients ?? [],
        extras: d.extras ?? [],
        badges: d.badges ?? [],
        provisionalImages: d.provisionalImages ?? false,
      })
      .returning({ id: schema.product.id });

    const [lata] = await db
      .insert(schema.variant)
      .values({ productId: p.id, name: `Lata ${d.volume}`, sku: `${slug}-lata`, price: d.price, trackStock: true, sortOrder: 0 })
      .returning({ id: schema.variant.id });
    if (d.line === 'flow') {
      flowLatas.push(lata.id);
      await db.insert(schema.variant).values({ productId: p.id, name: '1 litro', sku: `${slug}-litro`, price: FLOW_LITER_PRICE, trackStock: true, sortOrder: 1 });
    }

    let order = 0;
    await uploadPhoto(p.id, path, d.card, 'card', order++);
    await uploadPhoto(p.id, path, d.hero, 'hero', order++);
    if (d.cutout) await uploadPhoto(p.id, path, d.cutout, 'cutout', order++);
    for (const g of d.gallery ?? []) await uploadPhoto(p.id, path, g, 'gallery', order++);
  }
  return flowLatas;
}

async function seedEbooks() {
  const dir = join(WEB, 'src/content/ebooks');
  for (const file of (await readdir(dir)).filter((f) => f.endsWith('.md')).sort()) {
    const slug = basename(file, '.md');
    if (await db.query.product.findFirst({ where: eq(schema.product.slug, slug) })) {
      console.log(`= ${slug} ya existe`);
      continue;
    }
    const e = await frontmatter(join(dir, file));
    console.log(`+ ${e.title} (borrador)`);
    const [p] = await db
      .insert(schema.product)
      .values({
        slug,
        type: 'ebook',
        // Los e-books de la web son borradores de diseño: quedan en borrador hasta tener el PDF real.
        status: 'draft',
        name: e.title,
        sortOrder: e.order ?? 0,
        description: e.summary ?? '',
        subtitle: e.subtitle ?? null,
        pages: e.pages ?? null,
        format: e.format ?? 'PDF',
        summary: e.summary ?? null,
        includes: e.includes ?? [],
        toc: e.toc ?? [],
        faq: e.faq ?? [],
        coverColor: e.coverColor ?? null,
        coverInk: e.coverInk ?? null,
      })
      .returning({ id: schema.product.id });
    // Sin precio en el borrador: se pone uno provisional que hay que editar antes de publicar.
    await db.insert(schema.variant).values({ productId: p.id, name: 'PDF', price: e.price ?? 1000, trackStock: false });
  }
}

async function seedSixPack(flowLatas: string[]) {
  if (await db.query.bundle.findFirst({ where: eq(schema.bundle.slug, SIX_PACK.slug) })) {
    console.log(`= ${SIX_PACK.slug} ya existe`);
    return;
  }
  console.log(`+ ${SIX_PACK.name}`);
  const [b] = await db.insert(schema.bundle).values(SIX_PACK).returning({ id: schema.bundle.id });
  if (flowLatas.length) await db.insert(schema.bundleVariant).values(flowLatas.map((variantId) => ({ bundleId: b.id, variantId })));
}

const flowLatas = await seedDrinks();
await seedEbooks();
await seedSixPack(flowLatas);
await markCatalogChanged();
console.log('Catálogo listo. Carga el stock inicial en el panel (Inventario).');
process.exit(0);
