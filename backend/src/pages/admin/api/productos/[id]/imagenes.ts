import type { APIRoute } from 'astro';
import { eq, max } from 'drizzle-orm';
import { db, schema } from '../../../../../db';
import type { ImageRole } from '../../../../../db/schema';
import { audit } from '../../../../../lib/audit';
import { markCatalogChanged } from '../../../../../lib/catalog';
import { can } from '../../../../../lib/guard';
import { clientIp } from '../../../../../lib/ip';
import { adminMediaUrl } from '../../../../../lib/media';
import { MAX_IMAGE_BYTES, storeImage } from '../../../../../lib/uploads';

// Sube una o más fotos a un producto. Quedan con rol "galería" (o "tarjeta" si es la primera).
export const POST: APIRoute = async ({ params, request, locals }) => {
  const user = locals.user;
  if (!user || !can(user.role, 'productos')) return Response.json({ error: 'Sin permiso.' }, { status: 403 });
  const product = await db.query.product.findFirst({ where: eq(schema.product.id, params.id ?? '') });
  if (!product) return Response.json({ error: 'El producto no existe.' }, { status: 404 });

  const form = await request.formData();
  const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return Response.json({ error: 'No llegó ninguna foto.' }, { status: 400 });

  const [{ value: last }] = await db.select({ value: max(schema.productImage.sortOrder) }).from(schema.productImage).where(eq(schema.productImage.productId, product.id));
  const hasImages = last !== null;
  let order = (last ?? -1) + 1;
  const created: (typeof schema.productImage.$inferSelect & { url: string })[] = [];
  for (const file of files) {
    if (file.size > MAX_IMAGE_BYTES) return Response.json({ error: `${file.name} pesa más de 20 MB.` }, { status: 413 });
    try {
      const stored = await storeImage(new Uint8Array(await file.arrayBuffer()));
      const role: ImageRole = !hasImages && created.length === 0 ? (product.type === 'ebook' ? 'cover' : 'card') : 'gallery';
      const [row] = await db
        .insert(schema.productImage)
        .values({ productId: product.id, key: stored.key, width: stored.width, height: stored.height, role, fit: stored.hasAlpha ? 'contain' : 'cover', sortOrder: order++ })
        .returning();
      created.push({ ...row, url: adminMediaUrl(row.key) });
    } catch (err) {
      return Response.json({ error: `${file.name}: ${err instanceof Error ? err.message : 'no se pudo procesar'}` }, { status: 400 });
    }
  }
  await markCatalogChanged();
  await audit({ userId: user.id, action: 'product.images_upload', entity: 'product', entityId: product.id, after: { count: created.length }, ip: clientIp(request) });
  return Response.json({ images: created });
};
