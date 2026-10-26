// Pedidos: checkout, reserva de stock, estados de pago y entrega de e-books.
// Regla de oro: el precio y el estado de pago los decide el servidor (base de datos + GET a Mercado Pago),
// nunca lo que mande el navegador ni la URL de retorno.
import { z } from 'astro/zod';
import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import type { OrderStatus } from '../db/schema';
import { env } from '../env';
import { getDelivery, QUINDIO } from './delivery';
import { queueEmail } from './emails';
import { orderPaidEmail, teamOrderPaidEmail, type EmailItem, type OrderView } from './email-templates';
import { formatCOP } from './format';
import { moveStock, OutOfStockError } from './inventory';
import { cancelOrder, createCheckoutOrder, getOrder, mapStatus, MercadoPagoError, type MpOrder } from './mercadopago';
import { notifyPaidOrder } from './telegram';
import { hashToken, newToken } from './tokens';

export const RESERVATION_MINUTES = 60;
// Un pago en proceso (PSE, revisión manual) aparta el stock más tiempo.
const PROCESSING_HOLD_HOURS = 48;
export const DOWNLOAD_DAYS = 7;
export const DOWNLOAD_LIMIT = 5;

export const orderNumber = (n: number) => `BLD-${n}`;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Order = typeof schema.order.$inferSelect;

export class CheckoutError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export const checkoutInput = z.object({
  items: z.array(z.object({ variantId: z.uuid(), qty: z.number().int().min(1).max(50) })).max(30).default([]),
  bundles: z
    .array(z.object({ bundleId: z.uuid(), picks: z.array(z.object({ variantId: z.uuid(), qty: z.number().int().min(1).max(48) })).min(1).max(20) }))
    .max(10)
    .default([]),
  customer: z.object({
    name: z.string().trim().min(2, 'Escribe tu nombre').max(80),
    email: z.email('Escribe un correo válido').trim().toLowerCase().max(160),
    phone: z.string().trim().regex(/^[+\d\s()-]{7,20}$/, 'Escribe un teléfono válido'),
  }),
  delivery: z
    .object({
      // Solo municipios del Quindío.
      city: z.enum(QUINDIO, { error: 'Elige un municipio del Quindío' }),
      address: z.string().trim().min(5, 'Escribe la dirección completa').max(200),
      notes: z.string().trim().max(300).optional(),
    })
    .optional(),
  // Autorización de tratamiento de datos (Ley 1581): obligatoria.
  consent: z.literal(true, { error: 'Debes aceptar el tratamiento de datos' }),
});
export type CheckoutInput = z.infer<typeof checkoutInput>;

// ── Checkout ───────────────────────────────────────────────────────────────

export async function createCheckout(input: CheckoutInput, ip: string | null) {
  if (!input.items.length && !input.bundles.length) throw new CheckoutError('El carrito está vacío.');

  const variantIds = [...input.items.map((i) => i.variantId), ...input.bundles.flatMap((b) => b.picks.map((p) => p.variantId))];
  const rows = await db
    .select({ v: schema.variant, p: schema.product })
    .from(schema.variant)
    .innerJoin(schema.product, eq(schema.variant.productId, schema.product.id))
    .where(inArray(schema.variant.id, variantIds));
  const byId = new Map(rows.map((r) => [r.v.id, r]));
  const sellable = (id: string) => {
    const r = byId.get(id);
    if (!r || !r.v.active || r.p.status !== 'active') throw new CheckoutError('Uno de los productos ya no está disponible. Revisa tu carrito.', 409);
    return r;
  };

  const lines: {
    name: string;
    variantName: string | null;
    productId: string | null;
    variantId: string | null;
    bundleId: string | null;
    bundleContents: { variantId: string; name: string; qty: number }[] | null;
    isDigital: boolean;
    quantity: number;
    unitPrice: number;
  }[] = [];
  const stock = new Map<string, number>();
  const take = (variantId: string, qty: number) => stock.set(variantId, (stock.get(variantId) ?? 0) + qty);

  for (const item of input.items) {
    const { v, p } = sellable(item.variantId);
    const isDigital = p.type === 'ebook';
    if (isDigital && item.qty > 1) throw new CheckoutError('Los e-books se compran de a uno.');
    if (isDigital && !p.fileKey) throw new CheckoutError(`${p.name} todavía no está disponible.`, 409);
    lines.push({ name: p.name, variantName: v.name, productId: p.id, variantId: v.id, bundleId: null, bundleContents: null, isDigital, quantity: item.qty, unitPrice: v.price });
    if (v.trackStock) take(v.id, item.qty);
  }

  if (input.bundles.length) {
    const bundles = await db.query.bundle.findMany({ where: inArray(schema.bundle.id, input.bundles.map((b) => b.bundleId)) });
    const eligible = await db.select().from(schema.bundleVariant).where(inArray(schema.bundleVariant.bundleId, bundles.map((b) => b.id)));
    for (const req of input.bundles) {
      const b = bundles.find((x) => x.id === req.bundleId);
      if (!b || !b.active) throw new CheckoutError('Uno de los combos ya no está disponible.', 409);
      const allowed = new Set(eligible.filter((e) => e.bundleId === b.id).map((e) => e.variantId));
      const count = req.picks.reduce((s, p) => s + p.qty, 0);
      if (count !== b.size) throw new CheckoutError(`${b.name} lleva exactamente ${b.size} unidades.`);
      const contents = req.picks.map((pick) => {
        if (!allowed.has(pick.variantId)) throw new CheckoutError(`Ese sabor no se puede elegir en ${b.name}.`);
        const { v, p } = sellable(pick.variantId);
        if (v.trackStock) take(v.id, pick.qty);
        return { variantId: v.id, name: p.name, qty: pick.qty };
      });
      lines.push({ name: b.name, variantName: contents.map((c) => `${c.qty}× ${c.name}`).join(', '), productId: null, variantId: null, bundleId: b.id, bundleContents: contents, isDigital: false, quantity: 1, unitPrice: b.price });
    }
  }

  const hasPhysical = lines.some((l) => !l.isDigital);
  const hasDigital = lines.some((l) => l.isDigital);
  let deliveryFee = 0;
  if (hasPhysical) {
    if (!input.delivery) throw new CheckoutError('Escribe la dirección de entrega.');
    const delivery = await getDelivery();
    if (delivery.fee === null) throw new CheckoutError('Los domicilios todavía no están disponibles en línea. Escríbenos por WhatsApp.', 503);
    if (!delivery.cities.includes(input.delivery.city)) throw new CheckoutError(`Por ahora no hacemos entregas en ${input.delivery.city}.`);
    deliveryFee = delivery.fee;
  }
  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const total = subtotal + deliveryFee;
  const stockLines = [...stock].map(([variantId, qty]) => ({ variantId, qty }));
  const { token, hash } = newToken();

  // Reserva y pedido en una sola transacción: si una variante no alcanza, no queda nada a medias.
  let order: Order;
  try {
    order = await db.transaction(async (tx) => {
      const [o] = await tx
        .insert(schema.order)
        .values({
          publicTokenHash: hash,
          subtotal,
          deliveryFee,
          total,
          customerName: input.customer.name,
          email: input.customer.email,
          phone: input.customer.phone,
          city: hasPhysical ? input.delivery!.city : null,
          address: hasPhysical ? input.delivery!.address : null,
          deliveryNotes: hasPhysical ? input.delivery!.notes ?? null : null,
          hasPhysical,
          hasDigital,
          fulfillment: hasPhysical ? 'pending' : 'not_required',
          stockLines,
          stockState: stockLines.length ? 'reserved' : 'none',
          reservedUntil: new Date(Date.now() + RESERVATION_MINUTES * 60_000),
          consentAt: new Date(),
          consentIp: ip,
        })
        .returning();
      await tx.insert(schema.orderItem).values(lines.map((l) => ({ ...l, orderId: o.id, total: l.unitPrice * l.quantity })));
      for (const l of stockLines) await moveStock(tx, { variantId: l.variantId, delta: -l.qty, reason: 'reserve', orderId: o.id });
      await tx.insert(schema.orderEvent).values({ orderId: o.id, type: 'created', message: `Checkout iniciado por ${formatCOP(total)}` });
      return o;
    });
  } catch (err) {
    if (err instanceof OutOfStockError) {
      const r = byId.get(err.variantId);
      throw new CheckoutError(`No hay suficientes unidades de ${r ? `${r.p.name} (${r.v.name})` : 'un producto'}. Ajusta la cantidad.`, 409);
    }
    throw err;
  }

  const returnUrl = `${env.SITE_ORIGIN}/pedido?id=${order.id}&t=${token}`;
  try {
    const mp = await createCheckoutOrder({
      orderId: order.id,
      email: order.email,
      total,
      returnUrl,
      items: [
        ...lines.map((l) => ({ title: l.bundleId ? `${l.name} (${l.variantName})` : `${l.name} · ${l.variantName}`, unitPrice: l.unitPrice, quantity: l.quantity })),
        ...(deliveryFee > 0 ? [{ title: `Domicilio ${input.delivery!.city}`, unitPrice: deliveryFee, quantity: 1 }] : []),
      ],
    });
    if (!mp.checkout_url) throw new MercadoPagoError('Mercado Pago no devolvió el enlace de pago', 502, mp);
    await db.update(schema.order).set({ mpOrderId: mp.id, mpStatus: mp.status, updatedAt: new Date() }).where(eq(schema.order.id, order.id));
    return { id: order.id, number: orderNumber(order.number), token, checkoutUrl: mp.checkout_url };
  } catch (err) {
    // Sin enlace de pago no hay pedido: se devuelve el stock.
    await setStatus(order.id, 'failed', `No se pudo crear el pago en Mercado Pago (${err instanceof Error ? err.message : 'error'})`);
    if (err instanceof MercadoPagoError && err.status === 503) throw new CheckoutError('Los pagos en línea todavía no están activos.', 503);
    console.error('mercadopago.create', err instanceof MercadoPagoError ? { status: err.status, body: err.body } : err);
    throw new CheckoutError('No pudimos conectar con Mercado Pago. Intenta de nuevo en un momento.', 502);
  }
}

// ── Cambios de estado ──────────────────────────────────────────────────────

async function releaseStock(tx: Tx, o: Order, note: string) {
  if (o.stockState !== 'reserved') return;
  for (const l of o.stockLines) await moveStock(tx, { variantId: l.variantId, delta: l.qty, reason: 'release', orderId: o.id, note });
  await tx.update(schema.order).set({ stockState: 'released' }).where(eq(schema.order.id, o.id));
}

// Aplica un estado al pedido con el registro bloqueado (dos webhooks a la vez no se pisan).
// Devuelve lo que hay que hacer después de confirmar la transacción (correos).
export async function setStatus(orderId: string, next: OrderStatus, message: string, extra: { mp?: MpOrder; userId?: string } = {}) {
  const after: (() => Promise<void>)[] = [];
  await db.transaction(async (tx) => {
    const [o] = await tx.select().from(schema.order).where(eq(schema.order.id, orderId)).for('update');
    if (!o) return;
    const mpFields = extra.mp ? { mpStatus: extra.mp.status, mpStatusDetail: extra.mp.status_detail ?? null } : {};
    if (o.status === next) {
      if (extra.mp) await tx.update(schema.order).set({ ...mpFields, updatedAt: new Date() }).where(eq(schema.order.id, o.id));
      return;
    }
    // Un pedido pagado solo puede pasar a reembolsado; uno reembolsado ya no cambia.
    if ((o.status === 'paid' && next !== 'refunded') || o.status === 'refunded') {
      await tx.insert(schema.orderEvent).values({ orderId: o.id, type: 'ignored', message: `Se ignoró el cambio a "${next}" (el pedido está ${o.status})` });
      return;
    }

    let status = next;
    let note = message;
    const updates: Partial<Order> = { ...mpFields, updatedAt: new Date() };

    if (next === 'paid') {
      let stockOk = true;
      if (o.stockState === 'released') {
        // La reserva venció antes de que el pago se confirmara (pasa con PSE): se intenta volver a apartar.
        // Va en un savepoint: si una variante no alcanza, no queda ninguna descontada a medias.
        try {
          await tx.transaction(async (sp) => {
            for (const l of o.stockLines) await moveStock(sp, { variantId: l.variantId, delta: -l.qty, reason: 'sale', orderId: o.id, note: 'Pago confirmado después de vencer la reserva' });
          });
        } catch (err) {
          if (!(err instanceof OutOfStockError)) throw err;
          stockOk = false;
          status = 'attention';
          note = `${message}. Ya no hay stock para todo el pedido: contactar al cliente (entregar parcial o reembolsar).`;
        }
      }
      if (stockOk) {
        updates.stockState = o.stockLines.length ? 'sold' : 'none';
        after.push(() => onPaid(o.id));
      }
      // Un pago rechazado que después se aprueba vuelve a quedar por despachar.
      if (o.hasPhysical && o.fulfillment === 'canceled') updates.fulfillment = 'pending';
      updates.paidAt = new Date();
      updates.reservedUntil = null;
    } else if (next === 'failed' || next === 'canceled') {
      await releaseStock(tx, o, message);
      updates.stockState = o.stockState === 'reserved' ? 'released' : o.stockState;
      if (o.hasPhysical) updates.fulfillment = 'canceled';
    } else if (next === 'processing') {
      updates.reservedUntil = new Date(Date.now() + PROCESSING_HOLD_HOURS * 3600_000);
    } else if (next === 'refunded') {
      await tx.update(schema.downloadGrant).set({ revokedAt: new Date() }).where(and(eq(schema.downloadGrant.orderId, o.id), isNull(schema.downloadGrant.revokedAt)));
      if (o.hasPhysical && o.fulfillment !== 'delivered') updates.fulfillment = 'canceled';
    }

    await tx.update(schema.order).set({ ...updates, status }).where(eq(schema.order.id, o.id));
    await tx.insert(schema.orderEvent).values({ orderId: o.id, type: status, message: note, userId: extra.userId ?? null });
  });
  for (const fn of after) await fn().catch((err) => console.error('post-pago', err));
}

// Trae el pedido de Mercado Pago y lo aplica, después de comprobar que corresponde al nuestro.
export async function syncFromMercadoPago(mpOrderId: string) {
  const mp = await getOrder(mpOrderId);
  const o = await db.query.order.findFirst({
    where: mp.external_reference ? eq(schema.order.id, mp.external_reference) : eq(schema.order.mpOrderId, mpOrderId),
  });
  if (!o) return { ok: false, reason: 'pedido desconocido' };
  if (o.mpOrderId && o.mpOrderId !== mp.id) return { ok: false, reason: 'el id de Mercado Pago no coincide' };
  const next = mapStatus(mp);
  if (next === 'paid' && Math.round(Number(mp.total_amount)) !== o.total) {
    await setStatus(o.id, 'attention', `Mercado Pago reporta un monto (${mp.total_amount}) distinto al del pedido (${o.total}). Revisar antes de entregar.`, { mp });
    return { ok: false, reason: 'monto distinto' };
  }
  if (next === 'paid' && mp.currency && mp.currency !== 'COP') {
    await setStatus(o.id, 'attention', `Moneda inesperada (${mp.currency}). Revisar antes de entregar.`, { mp });
    return { ok: false, reason: 'moneda distinta' };
  }
  const labels: Record<OrderStatus, string> = {
    pending: 'Esperando el pago',
    processing: 'Pago en proceso',
    paid: 'Pago aprobado',
    failed: 'Pago rechazado',
    canceled: 'Pago cancelado o vencido',
    refunded: 'Pago reembolsado',
    attention: 'Requiere atención',
  };
  await setStatus(o.id, next, `${labels[next]} en Mercado Pago (${mp.status}${mp.status_detail ? ` / ${mp.status_detail}` : ''})`, { mp });
  return { ok: true, status: next };
}

// Vence reservas de checkouts abandonados (y les cancela el pago en Mercado Pago si aún está abierto).
export async function expireReservations() {
  const stale = await db
    .select({ id: schema.order.id, mpOrderId: schema.order.mpOrderId })
    .from(schema.order)
    .where(and(eq(schema.order.stockState, 'reserved'), inArray(schema.order.status, ['pending', 'processing']), sql`${schema.order.reservedUntil} < now()`))
    .limit(50);
  for (const o of stale) {
    if (o.mpOrderId) {
      // Antes de liberar, se pregunta: puede que se haya pagado y el webhook no llegó.
      const res = await syncFromMercadoPago(o.mpOrderId).catch(() => null);
      if (res?.ok && res.status === 'paid') continue;
      await cancelOrder(o.mpOrderId).catch(() => {});
    }
    await setStatus(o.id, 'canceled', `La reserva venció a los ${RESERVATION_MINUTES} minutos sin pago`);
  }
  return stale.length;
}

// Revisa pagos en proceso por si un webhook se perdió.
export async function reconcileProcessing() {
  const open = await db
    .select({ mpOrderId: schema.order.mpOrderId })
    .from(schema.order)
    .where(and(inArray(schema.order.status, ['pending', 'processing']), isNotNull(schema.order.mpOrderId), sql`${schema.order.updatedAt} < now() - interval '10 minutes'`))
    .limit(30);
  for (const o of open) await syncFromMercadoPago(o.mpOrderId!).catch((err) => console.error('reconciliación', err instanceof Error ? err.message : err));
}

// ── Después del pago ───────────────────────────────────────────────────────

export async function createDownloadLinks(orderId: string) {
  const items = await db.query.orderItem.findMany({ where: and(eq(schema.orderItem.orderId, orderId), eq(schema.orderItem.isDigital, true)) });
  const links: { name: string; url: string }[] = [];
  for (const item of items) {
    // Un enlace nuevo invalida los anteriores del mismo ítem.
    await db.update(schema.downloadGrant).set({ revokedAt: new Date() }).where(and(eq(schema.downloadGrant.orderItemId, item.id), isNull(schema.downloadGrant.revokedAt)));
    const { token, hash } = newToken();
    await db.insert(schema.downloadGrant).values({
      orderId,
      orderItemId: item.id,
      productId: item.productId,
      tokenHash: hash,
      expiresAt: new Date(Date.now() + DOWNLOAD_DAYS * 24 * 3600_000),
      maxDownloads: DOWNLOAD_LIMIT,
    });
    links.push({ name: item.name, url: `${env.API_ORIGIN}/d/${token}` });
  }
  return links;
}

// Datos del pedido para las plantillas de correo, con el color de cada sabor o portada.
export async function emailOrderData(o: Order, items: (typeof schema.orderItem.$inferSelect)[]) {
  const variantIds = items.flatMap((i) => (i.bundleContents ?? []).map((c) => c.variantId));
  const viaVariant = variantIds.length
    ? await db.select({ id: schema.variant.id, productId: schema.variant.productId }).from(schema.variant).where(inArray(schema.variant.id, variantIds))
    : [];
  const productIds = [...new Set([...items.flatMap((i) => (i.productId ? [i.productId] : [])), ...viaVariant.map((v) => v.productId)])];
  const products = productIds.length
    ? await db.select({ id: schema.product.id, flavor: schema.product.flavorColor, cover: schema.product.coverColor }).from(schema.product).where(inArray(schema.product.id, productIds))
    : [];
  const colorOf = (productId?: string | null) => {
    const p = products.find((x) => x.id === productId);
    return p?.flavor ?? p?.cover ?? null;
  };
  const view: OrderView = {
    number: orderNumber(o.number),
    customerName: o.customerName,
    email: o.email,
    phone: o.phone,
    hasPhysical: o.hasPhysical,
    hasDigital: o.hasDigital,
    city: o.city,
    address: o.address,
    deliveryNotes: o.deliveryNotes,
    subtotal: o.subtotal,
    deliveryFee: o.deliveryFee,
    total: o.total,
  };
  const list: EmailItem[] = items.map((i) => ({
    name: i.name,
    detail: i.variantName,
    quantity: i.quantity,
    total: i.total,
    isDigital: i.isDigital,
    color: colorOf(i.productId ?? viaVariant.find((v) => v.id === i.bundleContents?.[0]?.variantId)?.productId),
  }));
  return { view, list };
}

async function onPaid(orderId: string) {
  const o = await db.query.order.findFirst({ where: eq(schema.order.id, orderId) });
  if (!o || o.status !== 'paid') return;
  const items = await db.query.orderItem.findMany({ where: eq(schema.orderItem.orderId, o.id) });
  const links = o.hasDigital ? await createDownloadLinks(o.id) : [];
  const n = orderNumber(o.number);
  const { view, list } = await emailOrderData(o, items);

  const customer = orderPaidEmail(view, list, links, { limit: DOWNLOAD_LIMIT, days: DOWNLOAD_DAYS });
  await queueEmail({ orderId: o.id, kind: 'customer_paid', to: o.email, subject: customer.subject, body: customer.text, html: customer.html });

  if (env.ORDERS_NOTIFY_EMAIL) {
    const team = teamOrderPaidEmail(view, list, `${env.ADMIN_ORIGIN}/admin/pedidos/${o.id}`);
    await queueEmail({ orderId: o.id, kind: 'team_paid', to: env.ORDERS_NOTIFY_EMAIL, subject: team.subject, body: team.text, html: team.html });
  }

  // Aviso al equipo por Telegram. Nunca debe afectar la confirmación del pago.
  try {
    await notifyPaidOrder(n, o, items);
  } catch (err) {
    console.error('telegram pedido pagado', err instanceof Error ? err.message : err);
  }
}

// Vista pública del pedido para la página /pedido de la web (solo con el token correcto).
export async function publicOrder(id: string, token: string) {
  const o = await db.query.order.findFirst({ where: eq(schema.order.id, id) });
  if (!o || o.publicTokenHash !== hashToken(token)) return null;
  const items = await db.query.orderItem.findMany({ where: eq(schema.orderItem.orderId, o.id) });
  return {
    number: orderNumber(o.number),
    status: o.status,
    fulfillment: o.fulfillment,
    items: items.map((i) => ({ name: i.name, detail: i.variantName, quantity: i.quantity, total: i.total, isDigital: i.isDigital })),
    subtotal: o.subtotal,
    deliveryFee: o.deliveryFee,
    total: o.total,
    hasPhysical: o.hasPhysical,
    hasDigital: o.hasDigital,
    city: o.city,
    // Correo parcialmente oculto: confirma a dónde llegó sin exponerlo completo.
    email: o.email.replace(/^(.{2}).*(@.*)$/, '$1•••$2'),
    createdAt: o.createdAt,
  };
}
