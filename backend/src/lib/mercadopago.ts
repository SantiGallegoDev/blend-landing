// Mercado Pago Checkout Pro con la API de Orders (https://api.mercadopago.com/v1/orders).
// Sin MP_ACCESS_TOKEN todo esto responde "no configurado" y el checkout queda apagado.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../env';
import type { OrderStatus } from '../db/schema';


export const paymentsConfigured = () => !!env.MP_ACCESS_TOKEN;

export type MpOrder = {
  id: string;
  status: string;
  status_detail?: string;
  external_reference?: string;
  total_amount?: string;
  total_paid_amount?: string;
  currency?: string;
  checkout_url?: string;
};

export class MercadoPagoError extends Error {
  constructor(message: string, public status: number, public body?: unknown) {
    super(message);
  }
}

async function call<T>(path: string, init: { method: 'GET' | 'POST'; body?: unknown; idempotencyKey?: string }): Promise<T> {
  if (!env.MP_ACCESS_TOKEN) throw new MercadoPagoError('Mercado Pago no está configurado.', 503);
  const res = await fetch(env.MP_API_BASE + path, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.idempotencyKey ? { 'X-Idempotency-Key': init.idempotencyKey } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new MercadoPagoError(`Mercado Pago respondió ${res.status}`, res.status, body);
  return body as T;
}

// Los montos van como texto. COP no usa centavos: se envían enteros.
const amount = (n: number) => String(Math.round(n));

export function createCheckoutOrder(input: {
  orderId: string;
  email: string;
  items: { title: string; unitPrice: number; quantity: number }[];
  total: number;
  returnUrl: string;
}) {
  return call<MpOrder>('/v1/orders', {
    method: 'POST',
    // La misma clave para el mismo pedido: un reintento no crea dos cobros.
    idempotencyKey: input.orderId,
    body: {
      type: 'online',
      processing_mode: 'manual',
      total_amount: amount(input.total),
      external_reference: input.orderId,
      description: 'Pedido Blend',
      // Coincide con la reserva de stock (60 min).
      expiration_time: 'PT1H',
      payer: { email: input.email },
      items: input.items.map((i) => ({ title: i.title.slice(0, 120), unit_price: amount(i.unitPrice), quantity: i.quantity })),
      config: {
        online: {
          success_url: input.returnUrl,
          failure_url: input.returnUrl,
          pending_url: input.returnUrl,
          auto_return: 'approved',
        },
      },
    },
  });
}

export const getOrder = (id: string) => call<MpOrder>(`/v1/orders/${encodeURIComponent(id)}`, { method: 'GET' });

export const cancelOrder = (id: string) =>
  call<MpOrder>(`/v1/orders/${encodeURIComponent(id)}/cancel`, { method: 'POST', idempotencyKey: `cancel-${id}` });

export const refundOrder = (id: string) =>
  call<MpOrder>(`/v1/orders/${encodeURIComponent(id)}/refund`, { method: 'POST', idempotencyKey: `refund-${id}` });

// Estado de Mercado Pago → estado interno del pedido.
export function mapStatus(mp: MpOrder): OrderStatus {
  switch (mp.status) {
    case 'processed':
      return 'paid';
    case 'processing':
    case 'action_required':
      return 'processing';
    case 'failed':
      return 'failed';
    case 'canceled':
    case 'expired':
      return 'canceled';
    case 'refunded':
      return 'refunded';
    default:
      return 'pending';
  }
}

// Firma x-signature del webhook: "ts=…,v1=…", HMAC-SHA256 de "id:{data.id};request-id:{x-request-id};ts:{ts};".
// Solo se registra si es válida o no: el pedido se cambia siempre con lo que diga GET /v1/orders.
export function verifyWebhookSignature(headers: Headers, dataId: string | null): boolean | null {
  if (!env.MP_WEBHOOK_SECRET) return null;
  const signature = headers.get('x-signature') ?? '';
  const requestId = headers.get('x-request-id') ?? '';
  const parts = Object.fromEntries(signature.split(',').map((p) => p.trim().split('=') as [string, string]));
  if (!parts.ts || !parts.v1) return false;
  let manifest = '';
  if (dataId) manifest += `id:${/^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId};`;
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${parts.ts};`;
  const expected = Buffer.from(createHmac('sha256', env.MP_WEBHOOK_SECRET).update(manifest).digest('hex'));
  const given = Buffer.from(parts.v1);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
