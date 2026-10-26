// Movimientos de stock. Todo cambio pasa por aquí para que quede registrado
// y para que el stock nunca baje de cero, aunque lleguen dos pedidos a la vez.
import { and, eq, gte, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import type { MovementReason } from '../db/schema';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Tx;

export class OutOfStockError extends Error {
  constructor(public variantId: string) {
    super('No hay stock suficiente.');
  }
}

export async function moveStock(
  exec: Executor,
  m: { variantId: string; delta: number; reason: MovementReason; note?: string | null; orderId?: string | null; userId?: string | null },
): Promise<number> {
  if (m.delta === 0) {
    const [row] = await exec.select({ stock: schema.variant.stock }).from(schema.variant).where(eq(schema.variant.id, m.variantId));
    return row?.stock ?? 0;
  }
  // Un solo UPDATE condicionado: si no alcanza, no cambia nada.
  const [row] = await exec
    .update(schema.variant)
    .set({ stock: sql`${schema.variant.stock} + ${m.delta}`, updatedAt: new Date() })
    .where(and(eq(schema.variant.id, m.variantId), gte(sql`${schema.variant.stock} + ${m.delta}`, 0)))
    .returning({ stock: schema.variant.stock });
  if (!row) throw new OutOfStockError(m.variantId);
  await exec.insert(schema.inventoryMovement).values({
    variantId: m.variantId,
    delta: m.delta,
    stockAfter: row.stock,
    reason: m.reason,
    note: m.note ?? null,
    orderId: m.orderId ?? null,
    userId: m.userId ?? null,
  });
  return row.stock;
}

export const reasonLabel: Record<MovementReason, string> = {
  restock: 'Reposición',
  adjust: 'Ajuste',
  shrink: 'Merma',
  reserve: 'Reserva de checkout',
  release: 'Liberación de reserva',
  sale: 'Venta confirmada',
  return: 'Devolución',
};
