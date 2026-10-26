import { ActionError, defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { fulfillmentEnum } from '../db/schema';
import { audit } from '../lib/audit';
import { queueEmail } from '../lib/emails';
import { moveStock } from '../lib/inventory';
import { cancelOrder, MercadoPagoError, refundOrder } from '../lib/mercadopago';
import { createDownloadLinks, DOWNLOAD_DAYS, DOWNLOAD_LIMIT, orderNumber, setStatus, syncFromMercadoPago } from '../lib/orders';
import { ipOf, requireUser } from './shared';

const orderId = z.object({ orderId: z.uuid() });

async function load(id: string) {
  const o = await db.query.order.findFirst({ where: eq(schema.order.id, id) });
  if (!o) throw new ActionError({ code: 'NOT_FOUND', message: 'El pedido no existe.' });
  return o;
}

const fulfillmentLabel: Record<string, string> = {
  pending: 'Por preparar',
  preparing: 'Preparando',
  dispatched: 'En camino',
  delivered: 'Entregado',
  canceled: 'Entrega cancelada',
};

export const orders = {
  setFulfillment: defineAction({
    accept: 'form',
    input: orderId.extend({ fulfillment: z.enum(fulfillmentEnum.enumValues.filter((f) => f !== 'not_required') as [string, ...string[]]) }),
    handler: async ({ orderId, fulfillment }, ctx) => {
      const me = requireUser(ctx, 'pedidos');
      const o = await load(orderId);
      if (!o.hasPhysical) throw new ActionError({ code: 'BAD_REQUEST', message: 'Este pedido no tiene entrega física.' });
      if (o.status !== 'paid' && fulfillment !== 'canceled') throw new ActionError({ code: 'BAD_REQUEST', message: 'Solo se despachan pedidos pagados.' });
      await db.update(schema.order).set({ fulfillment: fulfillment as never, updatedAt: new Date() }).where(eq(schema.order.id, orderId));
      await db.insert(schema.orderEvent).values({ orderId, type: 'fulfillment', message: fulfillmentLabel[fulfillment], userId: me.id });
      await audit({ userId: me.id, action: 'order.fulfillment', entity: 'order', entityId: orderId, before: { fulfillment: o.fulfillment }, after: { fulfillment }, ip: ipOf(ctx) });
    },
  }),

  addNote: defineAction({
    accept: 'form',
    input: orderId.extend({ note: z.string().trim().min(1, 'Escribe la nota').max(1000) }),
    handler: async ({ orderId, note }, ctx) => {
      const me = requireUser(ctx, 'pedidos');
      await load(orderId);
      await db.insert(schema.orderEvent).values({ orderId, type: 'note', message: note, userId: me.id });
    },
  }),

  // Vuelve a preguntar a Mercado Pago por el estado (útil si un webhook no llegó).
  sync: defineAction({
    accept: 'form',
    input: orderId,
    handler: async ({ orderId }, ctx) => {
      requireUser(ctx, 'pedidos');
      const o = await load(orderId);
      if (!o.mpOrderId) throw new ActionError({ code: 'BAD_REQUEST', message: 'Este pedido no llegó a crear un pago en Mercado Pago.' });
      try {
        const r = await syncFromMercadoPago(o.mpOrderId);
        if (!r.ok) throw new ActionError({ code: 'CONFLICT', message: `No se aplicó: ${r.reason}.` });
      } catch (err) {
        if (err instanceof MercadoPagoError) throw new ActionError({ code: 'BAD_GATEWAY', message: `Mercado Pago no respondió (${err.status}).` });
        throw err;
      }
    },
  }),

  // Cancela un pedido sin pagar: anula el cobro en Mercado Pago y devuelve el stock apartado.
  cancel: defineAction({
    accept: 'form',
    input: orderId,
    handler: async ({ orderId }, ctx) => {
      const me = requireUser(ctx, 'pedidos');
      const o = await load(orderId);
      if (!['pending', 'processing', 'attention', 'failed'].includes(o.status)) {
        throw new ActionError({ code: 'BAD_REQUEST', message: o.status === 'paid' ? 'Está pagado: usa "Reembolsar".' : 'Este pedido ya está cerrado.' });
      }
      if (o.mpOrderId && o.status !== 'failed') await cancelOrder(o.mpOrderId).catch(() => {});
      await setStatus(orderId, 'canceled', `Cancelado desde el panel por ${me.name}`, { userId: me.id });
      await audit({ userId: me.id, action: 'order.cancel', entity: 'order', entityId: orderId, ip: ipOf(ctx) });
    },
  }),

  refund: defineAction({
    accept: 'form',
    input: orderId.extend({ restock: z.preprocess((v) => v === 'on' || v === 'true', z.boolean()) }),
    handler: async ({ orderId, restock }, ctx) => {
      const me = requireUser(ctx, 'reembolsos');
      const o = await load(orderId);
      if (!['paid', 'attention'].includes(o.status) || !o.mpOrderId) throw new ActionError({ code: 'BAD_REQUEST', message: 'Solo se reembolsan pedidos pagados con Mercado Pago.' });
      try {
        const mp = await refundOrder(o.mpOrderId);
        await setStatus(orderId, 'refunded', `Reembolso total solicitado por ${me.name}`, { mp, userId: me.id });
      } catch (err) {
        if (err instanceof MercadoPagoError) {
          throw new ActionError({ code: 'BAD_GATEWAY', message: `Mercado Pago rechazó el reembolso (${err.status}). Revisa la orden en su panel.` });
        }
        throw err;
      }
      // Devolver al inventario solo si el producto volvió en buen estado (o nunca salió).
      if (restock && o.stockState === 'sold') {
        for (const l of o.stockLines) await moveStock(db, { variantId: l.variantId, delta: l.qty, reason: 'return', orderId, userId: me.id, note: `Reembolso ${orderNumber(o.number)}` });
        await db.update(schema.order).set({ stockState: 'released' }).where(eq(schema.order.id, orderId));
      }
      await audit({ userId: me.id, action: 'order.refund', entity: 'order', entityId: orderId, after: { total: o.total, restock }, ip: ipOf(ctx) });
    },
  }),

  resendDownloads: defineAction({
    accept: 'form',
    input: orderId,
    handler: async ({ orderId }, ctx) => {
      const me = requireUser(ctx, 'pedidos');
      const o = await load(orderId);
      if (o.status !== 'paid' || !o.hasDigital) throw new ActionError({ code: 'BAD_REQUEST', message: 'Solo para pedidos pagados con e-books.' });
      const links = await createDownloadLinks(orderId);
      await queueEmail({
        orderId,
        kind: 'ebook_resend',
        to: o.email,
        subject: `Tus e-books de Blend (pedido ${orderNumber(o.number)})`,
        body: [
          `Hola ${o.customerName.split(' ')[0]},`,
          '',
          `Aquí están de nuevo tus enlaces de descarga. Cada uno sirve ${DOWNLOAD_LIMIT} descargas durante ${DOWNLOAD_DAYS} días; los enlaces anteriores ya no funcionan.`,
          '',
          ...links.map((l) => `${l.name}: ${l.url}`),
          '',
          'Blend',
        ].join('\n'),
      });
      await db.insert(schema.orderEvent).values({ orderId, type: 'downloads', message: 'Enlaces de descarga reenviados', userId: me.id });
      await audit({ userId: me.id, action: 'order.resend_downloads', entity: 'order', entityId: orderId, ip: ipOf(ctx) });
    },
  }),
};
