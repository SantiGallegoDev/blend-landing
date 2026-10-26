// Reglas del catálogo: validación y guardado de productos, combos y zonas desde el panel.
import { z } from 'astro/zod';
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import { imageRoles } from '../db/schema';
import { moveStock } from './inventory';
import { deleteFile } from './storage';

const lines = (max = 40) =>
  z
    .array(z.string().trim().max(300))
    .max(max)
    .transform((list) => list.filter(Boolean));

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional();

const hex = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Color en formato #RRGGBB')
  .nullable()
  .optional()
  .or(z.literal('').transform(() => null));

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, 'El slug debe tener al menos 2 caracteres')
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Solo minúsculas, números y guiones (ej. pink-cloud)');

export const variantInput = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, 'Cada variante necesita un nombre').max(80),
  sku: optionalText(40),
  price: z.coerce.number().int('El precio va en pesos, sin decimales').positive('El precio debe ser mayor a 0').max(100_000_000),
  trackStock: z.boolean(),
  // Stock que el usuario vio al abrir el formulario y el que quiere dejar: se aplica la diferencia,
  // así no se pisan las ventas que entren mientras edita.
  stockSeen: z.coerce.number().int().min(0).default(0),
  stock: z.coerce.number().int().min(0, 'El stock no puede ser negativo').max(1_000_000),
  lowStock: z.coerce.number().int().min(0).max(100_000),
  active: z.boolean(),
});

export const imageInput = z.object({
  id: z.uuid(),
  role: z.enum(imageRoles),
  alt: z.string().trim().max(240),
  focus: z.string().regex(/^\d{1,3}% \d{1,3}%$/),
  fit: z.enum(['cover', 'contain']),
});

export const productInput = z.object({
  id: z.uuid(),
  slug: slugSchema,
  status: z.enum(['draft', 'active', 'archived']),
  name: z.string().trim().min(1, 'Escribe el nombre').max(80),
  sortOrder: z.coerce.number().int().min(0).max(9999),
  headline: z.string().trim().max(160),
  description: z.string().trim().max(2000),
  seoDescription: z.string().trim().max(320),
  // Bebida
  // La web conoce estas dos líneas (src/data/site.ts); otra rompería su build.
  line: z.enum(['flow', 'cold-coffee']).nullable().optional(),
  volume: optionalText(40),
  flavorColor: hex,
  ingredients: lines(),
  extras: lines(),
  badges: lines(),
  provisionalImages: z.boolean(),
  // E-book
  subtitle: optionalText(200),
  pages: z.coerce.number().int().positive().max(5000).nullable().optional(),
  format: optionalText(40),
  summary: optionalText(2000),
  includes: lines(60),
  toc: lines(120),
  faq: z.array(z.object({ q: z.string().trim().max(200), a: z.string().trim().max(1500) })).max(30).transform((l) => l.filter((f) => f.q && f.a)),
  coverColor: hex,
  coverInk: hex,
  variants: z.array(variantInput).min(1, 'El producto necesita al menos una variante con precio').max(20),
  images: z.array(imageInput).max(40),
});

export type ProductInput = z.infer<typeof productInput>;

export class CatalogError extends Error {}

export async function markCatalogChanged() {
  await db
    .insert(schema.setting)
    .values({ key: 'catalog_changed_at', value: new Date().toISOString() })
    .onConflictDoUpdate({ target: schema.setting.key, set: { value: new Date().toISOString(), updatedAt: new Date() } });
}

export async function saveProduct(input: ProductInput, userId: string) {
  const current = await db.query.product.findFirst({ where: eq(schema.product.id, input.id) });
  if (!current) throw new CatalogError('El producto no existe.');

  const clash = await db.query.product.findFirst({
    where: and(eq(schema.product.slug, input.slug), sql`${schema.product.id} <> ${input.id}`),
  });
  if (clash) throw new CatalogError(`El slug "${input.slug}" ya lo usa ${clash.name}.`);

  if (input.status === 'active') {
    const hasActiveVariant = input.variants.some((v) => v.active);
    if (!hasActiveVariant) throw new CatalogError('Para publicarlo necesita al menos una variante activa.');
    if (current.type === 'ebook' && !current.fileKey) throw new CatalogError('Sube el PDF del e-book antes de publicarlo.');
    if (current.type === 'drink' && !input.images.some((i) => i.role === 'card')) {
      throw new CatalogError('Para publicar la bebida marca una foto con el rol "Tarjeta".');
    }
  }

  const isEbook = current.type === 'ebook';
  const before = { ...current };
  const removedKeys: string[] = [];

  await db.transaction(async (tx) => {
    await tx
      .update(schema.product)
      .set({
        slug: input.slug,
        status: input.status,
        name: input.name,
        sortOrder: input.sortOrder,
        headline: input.headline,
        description: input.description,
        seoDescription: input.seoDescription,
        line: isEbook ? null : input.line ?? 'flow',
        volume: isEbook ? null : input.volume,
        flavorColor: isEbook ? null : input.flavorColor,
        ingredients: isEbook ? [] : input.ingredients,
        extras: isEbook ? [] : input.extras,
        badges: isEbook ? [] : input.badges,
        provisionalImages: input.provisionalImages,
        subtitle: isEbook ? input.subtitle : null,
        pages: isEbook ? input.pages ?? null : null,
        format: isEbook ? input.format : null,
        summary: isEbook ? input.summary : null,
        includes: isEbook ? input.includes : [],
        toc: isEbook ? input.toc : [],
        faq: isEbook ? input.faq : [],
        coverColor: isEbook ? input.coverColor : null,
        coverInk: isEbook ? input.coverInk : null,
        updatedAt: new Date(),
      })
      .where(eq(schema.product.id, input.id));

    // Variantes: se actualizan, se crean las nuevas y se borran las que quitaron (si nunca se vendieron).
    const existing = await tx.query.variant.findMany({ where: eq(schema.variant.productId, input.id) });
    const keepIds = input.variants.flatMap((v) => (v.id ? [v.id] : []));
    const removed = existing.filter((v) => !keepIds.includes(v.id));
    if (removed.length) {
      const sold = await tx
        .select({ variantId: schema.orderItem.variantId })
        .from(schema.orderItem)
        .where(inArray(schema.orderItem.variantId, removed.map((v) => v.id)))
        .limit(1);
      if (sold.length) throw new CatalogError('Una variante que quitaste ya tiene pedidos. Desactívala en lugar de borrarla.');
      await tx.delete(schema.variant).where(inArray(schema.variant.id, removed.map((v) => v.id)));
    }

    for (const [i, v] of input.variants.entries()) {
      // Los e-books no llevan inventario.
      const trackStock = isEbook ? false : v.trackStock;
      const fields = { name: v.name, sku: v.sku ?? null, price: v.price, trackStock, lowStock: v.lowStock, active: v.active, sortOrder: i, updatedAt: new Date() };
      if (v.id && existing.some((e) => e.id === v.id)) {
        await tx.update(schema.variant).set(fields).where(eq(schema.variant.id, v.id));
        const delta = trackStock ? v.stock - v.stockSeen : 0;
        if (delta !== 0) await moveStock(tx, { variantId: v.id, delta, reason: 'adjust', note: 'Editado desde el producto', userId });
      } else {
        const [created] = await tx.insert(schema.variant).values({ ...fields, productId: input.id, stock: 0 }).returning({ id: schema.variant.id });
        if (trackStock && v.stock > 0) await moveStock(tx, { variantId: created.id, delta: v.stock, reason: 'restock', note: 'Stock inicial', userId });
      }
    }

    // Fotos: metadatos y orden. Las nuevas ya se crearon al subirlas; las que no vienen se borran.
    const imageIds = input.images.map((i) => i.id);
    const dropped = await tx
      .delete(schema.productImage)
      .where(and(eq(schema.productImage.productId, input.id), imageIds.length ? notInArray(schema.productImage.id, imageIds) : undefined))
      .returning({ key: schema.productImage.key });
    removedKeys.push(...dropped.map((d) => d.key));
    for (const [i, img] of input.images.entries()) {
      await tx
        .update(schema.productImage)
        .set({ role: img.role, alt: img.alt, focus: img.focus, fit: img.fit, sortOrder: i })
        .where(and(eq(schema.productImage.id, img.id), eq(schema.productImage.productId, input.id)));
    }
  });

  // Los archivos se borran solo después de confirmar la transacción.
  await Promise.all(removedKeys.map((key) => deleteFile(key).catch(() => {})));
  await markCatalogChanged();
  return { before };
}

export async function createProduct(type: 'drink' | 'ebook', name: string) {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50) || type;
  let slug = base;
  for (let n = 2; await db.query.product.findFirst({ where: eq(schema.product.slug, slug) }); n++) slug = `${base}-${n}`;
  const [row] = await db
    .insert(schema.product)
    .values({
      type,
      name,
      slug,
      status: 'draft',
      format: type === 'ebook' ? 'PDF' : null,
      volume: type === 'drink' ? '330 ml' : null,
      line: type === 'drink' ? 'flow' : null,
    })
    .returning({ id: schema.product.id });
  await db.insert(schema.variant).values({
    productId: row.id,
    name: type === 'ebook' ? 'PDF' : 'Lata 330 ml',
    price: type === 'ebook' ? 30000 : 10000,
    trackStock: type === 'drink',
  });
  await markCatalogChanged();
  return row.id;
}
