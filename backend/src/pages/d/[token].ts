import type { APIRoute } from 'astro';
import { and, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import { db, schema } from '../../db';
import { overLimit } from '../../lib/api';
import { clientIp } from '../../lib/ip';
import { signedDownloadUrl } from '../../lib/storage';
import { hashToken } from '../../lib/tokens';

const page = (title: string, text: string, status: number) =>
  new Response(
    `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title} · Blend</title>` +
      `<body style="font-family:system-ui,sans-serif;background:#FBF7EF;color:#2A2520;display:grid;place-content:center;min-height:100vh;margin:0;padding:24px;text-align:center">` +
      `<h1 style="font-weight:500">${title}</h1><p style="max-width:42ch">${text}</p></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" } },
  );

// Enlace de descarga del e-book que llega por correo: valida vencimiento y límite,
// y redirige a una URL firmada del bucket que dura 2 minutos.
export const GET: APIRoute = async ({ params, request, redirect }) => {
  if (await overLimit(`download:${clientIp(request) ?? 'sin-ip'}`, 30, 60)) return page('Espera un momento', 'Demasiados intentos seguidos.', 429);
  const token = params.token ?? '';
  if (token.length < 20) return page('Enlace no válido', 'Revisa que copiaste el enlace completo del correo.', 404);

  // Cuenta la descarga y comprueba los límites en un solo UPDATE (dos clics simultáneos no se saltan el tope).
  const [grant] = await db
    .update(schema.downloadGrant)
    .set({ downloads: sql`${schema.downloadGrant.downloads} + 1`, lastDownloadAt: new Date() })
    .where(
      and(
        eq(schema.downloadGrant.tokenHash, hashToken(token)),
        isNull(schema.downloadGrant.revokedAt),
        gt(schema.downloadGrant.expiresAt, new Date()),
        lt(schema.downloadGrant.downloads, schema.downloadGrant.maxDownloads),
      ),
    )
    .returning();
  if (!grant) {
    return page('Este enlace ya no funciona', 'Venció, llegó al límite de descargas o fue reemplazado por uno nuevo. Escríbenos y te enviamos otro.', 410);
  }
  const order = await db.query.order.findFirst({ where: eq(schema.order.id, grant.orderId) });
  const product = grant.productId ? await db.query.product.findFirst({ where: eq(schema.product.id, grant.productId) }) : null;
  if (order?.status !== 'paid' || !product?.fileKey) return page('No disponible', 'El archivo no está disponible en este momento. Escríbenos.', 410);
  return redirect(await signedDownloadUrl(product.fileKey, product.fileName ?? `${product.slug}.pdf`, 120), 302);
};
