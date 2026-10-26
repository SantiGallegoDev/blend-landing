import { ActionError, defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { audit } from '../lib/audit';
import { createLinkCode, ensureWebhook, sendToChat, telegramConfigured } from '../lib/telegram';
import { ipOf, requireUser } from './shared';

const chatInput = z.object({ id: z.uuid() });

function requireBot() {
  if (!telegramConfigured()) throw new ActionError({ code: 'BAD_REQUEST', message: 'Falta configurar TELEGRAM_BOT_TOKEN en Railway.' });
}

async function findChat(id: string) {
  const chat = await db.query.telegramChat.findFirst({ where: eq(schema.telegramChat.id, id) });
  if (!chat) throw new ActionError({ code: 'NOT_FOUND', message: 'Ese chat ya no existe.' });
  return chat;
}

const fail = (err: unknown, fallback: string) =>
  new ActionError({ code: 'BAD_REQUEST', message: err instanceof Error ? `${fallback}: ${err.message}` : fallback });

export const alerts = {
  linkCode: defineAction({
    accept: 'form',
    handler: async (_input, ctx) => {
      const me = requireUser(ctx, 'alertas');
      requireBot();
      try {
        // Sin webhook el bot no recibiría el código: se asegura antes de entregarlo.
        await ensureWebhook();
        const link = await createLinkCode(me.id);
        await audit({ userId: me.id, action: 'telegram.link_code', entity: 'telegram_chat', ip: ipOf(ctx) });
        return link;
      } catch (err) {
        throw fail(err, 'No se pudo hablar con Telegram');
      }
    },
  }),

  reconnect: defineAction({
    accept: 'form',
    handler: async (_input, ctx) => {
      requireUser(ctx, 'alertas');
      requireBot();
      try {
        await ensureWebhook(true);
      } catch (err) {
        throw fail(err, 'No se pudo registrar el webhook');
      }
    },
  }),

  setEnabled: defineAction({
    accept: 'form',
    input: chatInput.extend({ enabled: z.enum(['true', 'false']).transform((v) => v === 'true') }),
    handler: async ({ id, enabled }, ctx) => {
      const me = requireUser(ctx, 'alertas');
      const chat = await findChat(id);
      await db.update(schema.telegramChat).set({ enabled, ...(enabled ? { lastError: null } : {}), updatedAt: new Date() }).where(eq(schema.telegramChat.id, id));
      await audit({ userId: me.id, action: enabled ? 'telegram.chat_enable' : 'telegram.chat_disable', entity: 'telegram_chat', entityId: id, after: { title: chat.title }, ip: ipOf(ctx) });
    },
  }),

  remove: defineAction({
    accept: 'form',
    input: chatInput,
    handler: async ({ id }, ctx) => {
      const me = requireUser(ctx, 'alertas');
      const chat = await findChat(id);
      await db.delete(schema.telegramChat).where(eq(schema.telegramChat.id, id));
      await audit({ userId: me.id, action: 'telegram.chat_remove', entity: 'telegram_chat', entityId: id, before: { title: chat.title, type: chat.type }, ip: ipOf(ctx) });
      return { title: chat.title };
    },
  }),

  test: defineAction({
    accept: 'form',
    input: chatInput,
    handler: async ({ id }, ctx) => {
      const me = requireUser(ctx, 'alertas');
      requireBot();
      const chat = await findChat(id);
      try {
        await sendToChat(chat, `🔔 Prueba de alertas de <b>Blend</b>, enviada por ${me.name.replace(/[<>&]/g, '')}. Aquí van a llegar las compras nuevas.`);
      } catch (err) {
        throw fail(err, 'Telegram no aceptó el mensaje');
      }
      await audit({ userId: me.id, action: 'telegram.test', entity: 'telegram_chat', entityId: id, ip: ipOf(ctx) });
      return { title: chat.title };
    },
  }),
};
