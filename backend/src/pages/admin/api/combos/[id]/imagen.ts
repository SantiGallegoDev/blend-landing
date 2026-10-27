import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db, schema } from '../../../../../db';
import { audit } from '../../../../../lib/audit';
import { markCatalogChanged } from '../../../../../lib/catalog';
import { can } from '../../../../../lib/guard';
import { clientIp } from '../../../../../lib/ip';
import { adminMediaUrl } from '../../../../../lib/media';
import { deleteFile } from '../../../../../lib/storage';
import { MAX_IMAGE_BYTES, storeImage } from '../../../../../lib/uploads';

async function load(id?: string) {
  return db.query.bundle.findFirst({ where: eq(schema.bundle.id, id ?? '') });
}

// Sube (o reemplaza) la foto del combo.
export const POST: APIRoute = async ({ params, request, locals }) => {
  const user = locals.user;
  if (!user || !can(user.role, 'productos')) return Response.json({ error: 'Sin permiso.' }, { status: 403 });
  const b = await load(params.id);
  if (!b) return Response.json({ error: 'El combo no existe.' }, { status: 404 });
  const file = (await request.formData()).get('file');
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: 'No llegó la foto.' }, { status: 400 });
  if (file.size > MAX_IMAGE_BYTES) return Response.json({ error: 'La foto pesa más de 20 MB.' }, { status: 413 });
  try {
    const stored = await storeImage(new Uint8Array(await file.arrayBuffer()));
    await db
      .update(schema.bundle)
      .set({ imageKey: stored.key, imageWidth: stored.width, imageHeight: stored.height, updatedAt: new Date() })
      .where(eq(schema.bundle.id, b.id));
    if (b.imageKey) await deleteFile(b.imageKey).catch(() => {});
    await markCatalogChanged();
    await audit({ userId: user.id, action: 'bundle.image_upload', entity: 'bundle', entityId: b.id, ip: clientIp(request) });
    return Response.json({ url: adminMediaUrl(stored.key), width: stored.width, height: stored.height });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'No se pudo procesar la foto.' }, { status: 400 });
  }
};

// Quita la foto: la web vuelve a la portada armada con los sabores.
export const DELETE: APIRoute = async ({ params, request, locals }) => {
  const user = locals.user;
  if (!user || !can(user.role, 'productos')) return Response.json({ error: 'Sin permiso.' }, { status: 403 });
  const b = await load(params.id);
  if (!b) return Response.json({ error: 'El combo no existe.' }, { status: 404 });
  if (request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ error: 'Origen no permitido.' }, { status: 403 });
  await db.update(schema.bundle).set({ imageKey: null, imageWidth: null, imageHeight: null, updatedAt: new Date() }).where(eq(schema.bundle.id, b.id));
  if (b.imageKey) await deleteFile(b.imageKey).catch(() => {});
  await markCatalogChanged();
  await audit({ userId: user.id, action: 'bundle.image_delete', entity: 'bundle', entityId: b.id, ip: clientIp(request) });
  return new Response(null, { status: 204 });
};
