import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db, schema } from '../../../../../db';
import { audit } from '../../../../../lib/audit';
import { markCatalogChanged } from '../../../../../lib/catalog';
import { can } from '../../../../../lib/guard';
import { clientIp } from '../../../../../lib/ip';
import { deleteFile, signedDownloadUrl } from '../../../../../lib/storage';
import { MAX_PDF_BYTES, storePdf } from '../../../../../lib/uploads';

async function load(id: string | undefined) {
  return db.query.product.findFirst({ where: eq(schema.product.id, id ?? '') });
}

// Sube (o reemplaza) el PDF privado de un e-book.
export const POST: APIRoute = async ({ params, request, locals }) => {
  const user = locals.user;
  if (!user || !can(user.role, 'productos')) return Response.json({ error: 'Sin permiso.' }, { status: 403 });
  const product = await load(params.id);
  if (!product || product.type !== 'ebook') return Response.json({ error: 'El e-book no existe.' }, { status: 404 });

  const file = (await request.formData()).get('file');
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: 'No llegó el archivo.' }, { status: 400 });
  if (file.size > MAX_PDF_BYTES) return Response.json({ error: 'El PDF pesa más de 150 MB.' }, { status: 413 });
  try {
    const stored = await storePdf(new Uint8Array(await file.arrayBuffer()));
    await db
      .update(schema.product)
      .set({ fileKey: stored.key, fileName: file.name.slice(0, 120), fileSize: stored.size, updatedAt: new Date() })
      .where(eq(schema.product.id, product.id));
    if (product.fileKey) await deleteFile(product.fileKey).catch(() => {});
    await markCatalogChanged();
    await audit({ userId: user.id, action: 'product.file_upload', entity: 'product', entityId: product.id, after: { fileName: file.name, size: stored.size }, ip: clientIp(request) });
    return Response.json({ fileName: file.name, fileSize: stored.size });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'No se pudo guardar el PDF.' }, { status: 400 });
  }
};

// Descarga del PDF para revisarlo desde el panel.
export const GET: APIRoute = async ({ params, locals, redirect }) => {
  const user = locals.user;
  if (!user || !can(user.role, 'productos')) return new Response('Sin permiso.', { status: 403 });
  const product = await load(params.id);
  if (!product?.fileKey) return new Response('Sin archivo.', { status: 404 });
  return redirect(await signedDownloadUrl(product.fileKey, product.fileName ?? `${product.slug}.pdf`, 60));
};
