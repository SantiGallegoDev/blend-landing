import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db, schema } from '../../../db';
import { overLimit } from '../../../lib/api';
import { clientIp } from '../../../lib/ip';
import { syncFromMercadoPago } from '../../../lib/orders';
import { verifyWebhookSignature } from '../../../lib/mercadopago';

// Webhook de Mercado Pago (evento "Order"). Se toma solo como aviso: el estado real se consulta
// siempre con GET /v1/orders/{id}. Un aviso falso no puede cambiar nada, solo provoca esa consulta.
export const POST: APIRoute = async ({ request, url }) => {
  if (await overLimit(`webhook:${clientIp(request) ?? 'sin-ip'}`, 120, 60)) return new Response(null, { status: 429 });

  const body = (await request.json().catch(() => null)) as { id?: string | number; type?: string; action?: string; data?: { id?: string } } | null;
  const dataId = url.searchParams.get('data.id') ?? body?.data?.id ?? null;
  const type = url.searchParams.get('type') ?? body?.type ?? 'desconocido';
  if (type !== 'order' || !dataId || !/^[\w-]{1,64}$/.test(dataId)) return new Response(null, { status: 200 });

  const eventId = request.headers.get('x-request-id') ?? String(body?.id ?? `${dataId}-${Date.now()}`);
  const signatureValid = verifyWebhookSignature(request.headers, dataId);
  await db
    .insert(schema.webhookEvent)
    .values({ id: eventId.slice(0, 120), topic: `${type}:${body?.action ?? ''}`, dataId, signatureValid })
    .onConflictDoNothing();
  if (signatureValid === false) console.warn('webhook mercadopago: firma inválida', { dataId });

  try {
    const result = await syncFromMercadoPago(dataId);
    await db.update(schema.webhookEvent).set({ processedAt: new Date(), error: result.ok ? null : result.reason }).where(eq(schema.webhookEvent.id, eventId.slice(0, 120)));
    return new Response(null, { status: 200 });
  } catch (err) {
    // 500: Mercado Pago reintenta más tarde.
    const message = err instanceof Error ? err.message : 'error';
    await db.update(schema.webhookEvent).set({ error: message.slice(0, 300) }).where(eq(schema.webhookEvent.id, eventId.slice(0, 120)));
    console.error('webhook mercadopago', message);
    return new Response(null, { status: 500 });
  }
};
