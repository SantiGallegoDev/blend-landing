import { ActionError, defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { audit } from '../lib/audit';
import { getDelivery, QUINDIO, saveDelivery } from '../lib/delivery';
import { CatalogError, createProduct, markCatalogChanged, productInput, saveProduct, slugSchema } from '../lib/catalog';
import { moveStock, OutOfStockError } from '../lib/inventory';
import { ipOf, requireUser } from './shared';

const price = z.coerce.number().int('Sin decimales').positive('Debe ser mayor a 0').max(100_000_000);

export const catalog = {
  createProduct: defineAction({
    accept: 'form',
    input: z.object({ type: z.enum(['drink', 'ebook']), name: z.string().trim().min(1, 'Escribe el nombre').max(80) }),
    handler: async ({ type, name }, ctx) => {
      const me = requireUser(ctx, 'productos');
      const id = await createProduct(type, name);
      await audit({ userId: me.id, action: 'product.create', entity: 'product', entityId: id, after: { type, name }, ip: ipOf(ctx) });
      return { id };
    },
  }),

  saveProduct: defineAction({
    accept: 'json',
    input: productInput,
    handler: async (input, ctx) => {
      const me = requireUser(ctx, 'productos');
      try {
        const { before } = await saveProduct(input, me.id);
        const changed = (['name', 'slug', 'status'] as const).filter((k) => before[k] !== input[k]);
        await audit({
          userId: me.id,
          action: 'product.update',
          entity: 'product',
          entityId: input.id,
          before: Object.fromEntries(changed.map((k) => [k, before[k]])),
          after: { ...Object.fromEntries(changed.map((k) => [k, input[k]])), prices: input.variants.map((v) => `${v.name}: ${v.price}`) },
          ip: ipOf(ctx),
        });
      } catch (err) {
        if (err instanceof CatalogError) throw new ActionError({ code: 'BAD_REQUEST', message: err.message });
        if (err instanceof OutOfStockError) throw new ActionError({ code: 'CONFLICT', message: 'El stock cambió mientras editabas (entró una venta). Recarga la página y vuelve a intentarlo.' });
        throw err;
      }
    },
  }),

  createBundle: defineAction({
    accept: 'form',
    input: z.object({ name: z.string().trim().min(1).max(80) }),
    handler: async ({ name }, ctx) => {
      const me = requireUser(ctx, 'productos');
      const slug = `${name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Date.now().toString(36)}`;
      const [row] = await db.insert(schema.bundle).values({ name, slug, size: 6, price: 1, active: false }).returning({ id: schema.bundle.id });
      await audit({ userId: me.id, action: 'bundle.create', entity: 'bundle', entityId: row.id, after: { name }, ip: ipOf(ctx) });
      return { id: row.id };
    },
  }),

  saveBundle: defineAction({
    accept: 'json',
    input: z.object({
      id: z.uuid(),
      name: z.string().trim().min(1, 'Escribe el nombre').max(80),
      slug: slugSchema,
      description: z.string().trim().max(500),
      size: z.coerce.number().int().min(2, 'Mínimo 2 unidades').max(48),
      price,
      active: z.boolean(),
      sortOrder: z.coerce.number().int().min(0).max(9999),
      variantIds: z.array(z.uuid()).max(100),
    }),
    handler: async (input, ctx) => {
      const me = requireUser(ctx, 'productos');
      if (input.active && input.variantIds.length === 0) {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'Elige al menos un sabor para poder activarlo.' });
      }
      const clash = await db.query.bundle.findFirst({ where: eq(schema.bundle.slug, input.slug) });
      if (clash && clash.id !== input.id) throw new ActionError({ code: 'BAD_REQUEST', message: `El slug "${input.slug}" ya está en uso.` });
      const before = await db.query.bundle.findFirst({ where: eq(schema.bundle.id, input.id) });
      if (!before) throw new ActionError({ code: 'NOT_FOUND' });
      await db.transaction(async (tx) => {
        const { variantIds, id, ...fields } = input;
        await tx.update(schema.bundle).set({ ...fields, updatedAt: new Date() }).where(eq(schema.bundle.id, id));
        await tx.delete(schema.bundleVariant).where(eq(schema.bundleVariant.bundleId, id));
        if (variantIds.length) await tx.insert(schema.bundleVariant).values(variantIds.map((variantId) => ({ bundleId: id, variantId })));
      });
      await markCatalogChanged();
      await audit({
        userId: me.id,
        action: 'bundle.update',
        entity: 'bundle',
        entityId: input.id,
        before: { price: before.price, size: before.size, active: before.active },
        after: { price: input.price, size: input.size, active: input.active },
        ip: ipOf(ctx),
      });
    },
  }),

  adjustStock: defineAction({
    accept: 'form',
    input: z.object({
      variantId: z.uuid(),
      mode: z.enum(['restock', 'shrink', 'set']),
      quantity: z.coerce.number().int().min(0, 'La cantidad no puede ser negativa').max(1_000_000),
      note: z.string().trim().max(200).optional(),
    }),
    handler: async ({ variantId, mode, quantity, note }, ctx) => {
      const me = requireUser(ctx, 'inventario');
      const v = await db.query.variant.findFirst({ where: eq(schema.variant.id, variantId) });
      if (!v || !v.trackStock) throw new ActionError({ code: 'NOT_FOUND', message: 'Esa variante no lleva inventario.' });
      const delta = mode === 'restock' ? quantity : mode === 'shrink' ? -quantity : quantity - v.stock;
      if (delta === 0) return { stock: v.stock };
      try {
        const stock = await moveStock(db, { variantId, delta, reason: mode === 'set' ? 'adjust' : mode, note, userId: me.id });
        await audit({ userId: me.id, action: 'stock.adjust', entity: 'variant', entityId: variantId, before: { stock: v.stock }, after: { stock, note }, ip: ipOf(ctx) });
        return { stock };
      } catch (err) {
        if (err instanceof OutOfStockError) throw new ActionError({ code: 'BAD_REQUEST', message: `Solo hay ${v.stock} disponibles.` });
        throw err;
      }
    },
  }),

  saveDelivery: defineAction({
    accept: 'form',
    input: z.object({
      fee: z.coerce.number({ error: 'Escribe el valor del domicilio' }).int('Sin decimales').min(0, 'No puede ser negativo').max(1_000_000),
      // Arreglo simple: así Astro lee todas las casillas marcadas (getAll).
      cities: z.array(z.enum(QUINDIO)).default([]),
      note: z.string().trim().max(200).default(''),
    }),
    handler: async (input, ctx) => {
      const me = requireUser(ctx, 'productos');
      if (input.cities.length === 0) throw new ActionError({ code: 'BAD_REQUEST', message: 'Elige al menos un municipio.' });
      const before = await getDelivery();
      await saveDelivery(input);
      await markCatalogChanged();
      await audit({ userId: me.id, action: 'delivery.save', entity: 'setting', entityId: 'delivery', before, after: input, ip: ipOf(ctx) });
    },
  }),
};
