// Alertas por Telegram: un bot avisa de cada compra a los chats vinculados desde el panel.
// Vincular un chat: el panel genera un código de un solo uso y se le manda al bot
// (/start CODIGO), normalmente con el enlace t.me/<bot>?startgroup=CODIGO.
// Los avisos se guardan en telegram_message y se reintentan como los correos.
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, inArray, isNull, lt } from 'drizzle-orm';
import { db, schema } from '../db';
import { env } from '../env';
import { formatCOP } from './format';
import { hashToken } from './tokens';

const MAX_ATTEMPTS = 5;
export const LINK_MINUTES = 15;
// Sin letras ni números que se confundan (O/0, I/1) por si alguien lo escribe a mano.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

type Chat = typeof schema.telegramChat.$inferSelect;
type TgChat = { id: number; type: string; title?: string; first_name?: string; last_name?: string; username?: string };
type TgMessage = { chat: TgChat; text?: string; migrate_to_chat_id?: number; new_chat_title?: string };
export type TgUpdate = {
  update_id: number;
  message?: TgMessage;
  channel_post?: TgMessage;
  my_chat_member?: { chat: TgChat; new_chat_member: { status: string } };
};

export class TelegramError extends Error {
  constructor(message: string, readonly code: number, readonly params: { retry_after?: number; migrate_to_chat_id?: number } = {}) {
    super(message);
  }
}

export const telegramConfigured = () => !!env.TELEGRAM_BOT_TOKEN;

async function call<T>(method: string, body?: unknown): Promise<T> {
  if (!env.TELEGRAM_BOT_TOKEN) throw new TelegramError('El bot de Telegram no está configurado.', 0);
  const res = await fetch(`${env.TELEGRAM_API_BASE}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await res.json().catch(() => null)) as
    | { ok: boolean; result?: T; description?: string; error_code?: number; parameters?: TelegramError['params'] }
    | null;
  if (!data?.ok) throw new TelegramError(data?.description ?? `Telegram respondió ${res.status}`, data?.error_code ?? res.status, data?.parameters);
  return data.result as T;
}

// ── Bot y webhook ──────────────────────────────────────────────────────────

let bot: { username: string; name: string } | null = null;
export async function getBot() {
  if (!bot) {
    const me = await call<{ username: string; first_name: string }>('getMe');
    bot = { username: me.username, name: me.first_name };
  }
  return bot;
}

export const webhookUrl = () => `${env.API_ORIGIN}/api/webhooks/telegram`;

// Secreto que Telegram manda en cada aviso (X-Telegram-Bot-Api-Secret-Token). Sale del token del bot:
// cambiar el token cambia el secreto, y ensureWebhook lo vuelve a registrar.
export function webhookSecret() {
  return createHash('sha256').update(`blend-telegram-webhook:${env.TELEGRAM_BOT_TOKEN ?? ''}`).digest('hex');
}

export type WebhookInfo = { url: string; pending_update_count: number; last_error_date?: number; last_error_message?: string };
export const getWebhookInfo = () => call<WebhookInfo>('getWebhookInfo');

// Registra el webhook si apunta a otro lado (por ejemplo, después de cambiar el dominio de la API).
// Lo corren las tareas periódicas, así que se arregla solo.
let webhookOk = '';
export async function ensureWebhook(force = false) {
  if (!telegramConfigured()) return;
  const url = webhookUrl();
  const key = `${url}|${webhookSecret()}`;
  if (!force && webhookOk === key) return;
  const info = await getWebhookInfo();
  if (force || info.url !== url) {
    await call('setWebhook', {
      url,
      secret_token: webhookSecret(),
      allowed_updates: ['message', 'channel_post', 'my_chat_member'],
    });
  }
  webhookOk = key;
}

// ── Vincular chats ─────────────────────────────────────────────────────────

const normalizeCode = (code: string) => code.trim().toUpperCase();

export async function createLinkCode(userId: string) {
  const bytes = randomBytes(10);
  const code = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
  await db.insert(schema.telegramLink).values({
    codeHash: hashToken(code),
    createdBy: userId,
    expiresAt: new Date(Date.now() + LINK_MINUTES * 60_000),
  });
  const { username } = await getBot();
  return {
    code,
    username,
    group: `https://t.me/${username}?startgroup=${code}`,
    private: `https://t.me/${username}?start=${code}`,
  };
}

function chatTitle(c: TgChat) {
  if (c.title) return c.title;
  const name = [c.first_name, c.last_name].filter(Boolean).join(' ');
  return name || (c.username ? `@${c.username}` : `Chat ${c.id}`);
}

export async function sendText(chatId: string, text: string) {
  await call('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
}

async function reply(chat: TgChat, text: string) {
  await sendText(String(chat.id), text).catch((err) => console.error('telegram reply', err instanceof Error ? err.message : err));
}

// /start CODIGO, /start@bot CODIGO o /vincular CODIGO.
const COMMAND = /^\/(start|vincular)(?:@(\w+))?(?:\s+([A-Za-z0-9_-]{4,64}))?\s*$/i;

export async function handleUpdate(update: TgUpdate) {
  const member = update.my_chat_member;
  if (member) {
    // Sacaron al bot del chat: se pausa para no seguir intentando.
    if (['left', 'kicked'].includes(member.new_chat_member.status)) {
      await db
        .update(schema.telegramChat)
        .set({ enabled: false, lastError: 'El bot ya no está en este chat.', updatedAt: new Date() })
        .where(eq(schema.telegramChat.chatId, String(member.chat.id)));
    }
    return;
  }

  const msg = update.message ?? update.channel_post;
  if (!msg) return;
  const chatId = String(msg.chat.id);

  if (msg.migrate_to_chat_id) {
    await db
      .update(schema.telegramChat)
      .set({ chatId: String(msg.migrate_to_chat_id), type: 'supergroup', updatedAt: new Date() })
      .where(eq(schema.telegramChat.chatId, chatId));
    return;
  }
  if (msg.new_chat_title) {
    await db.update(schema.telegramChat).set({ title: msg.new_chat_title, updatedAt: new Date() }).where(eq(schema.telegramChat.chatId, chatId));
    return;
  }

  const m = msg.text?.match(COMMAND);
  if (!m) return;
  const [, , mention, code] = m;
  if (mention && mention.toLowerCase() !== (await getBot()).username.toLowerCase()) return;

  if (!code) {
    if (msg.chat.type === 'private') {
      await reply(msg.chat, 'Hola, soy el bot de alertas de <b>Blend</b>. Para recibir los avisos de compras, pide un código en el panel → Alertas.');
    }
    return;
  }

  // Marcar el código primero: dos mensajes iguales a la vez no vinculan dos veces.
  const [link] = await db
    .update(schema.telegramLink)
    .set({ usedAt: new Date(), chatId })
    .where(and(eq(schema.telegramLink.codeHash, hashToken(normalizeCode(code))), isNull(schema.telegramLink.usedAt), gt(schema.telegramLink.expiresAt, new Date())))
    .returning();
  if (!link) {
    await reply(msg.chat, 'Ese código no sirve o ya venció. Genera uno nuevo en el panel de Blend → Alertas.');
    return;
  }

  const title = chatTitle(msg.chat);
  await db
    .insert(schema.telegramChat)
    .values({ chatId, title, type: msg.chat.type, addedBy: link.createdBy })
    .onConflictDoUpdate({
      target: schema.telegramChat.chatId,
      set: { title, type: msg.chat.type, enabled: true, lastError: null, updatedAt: new Date() },
    });
  await reply(msg.chat, '✅ Listo. Este chat va a recibir un aviso por cada compra nueva en Blend.');
}

// ── Avisos ─────────────────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

type PaidOrder = Pick<typeof schema.order.$inferSelect, 'id' | 'total' | 'customerName' | 'city' | 'hasPhysical' | 'deliveryFee'>;
type Item = Pick<typeof schema.orderItem.$inferSelect, 'quantity' | 'name' | 'variantName' | 'bundleContents' | 'total'>;

// Sin teléfono, correo ni dirección: esos datos se ven en el panel, no quedan en el historial del chat.
export function paidOrderText(number: string, o: PaidOrder, items: Item[]) {
  const lines = items.map((i) => {
    const detail = i.bundleContents?.length ? `\n   ${esc(i.bundleContents.map((b) => `${b.qty} ${b.name}`).join(', '))}` : '';
    return `· ${i.quantity} × ${esc(i.name)}${i.variantName ? ` (${esc(i.variantName)})` : ''} — ${formatCOP(i.total)}${detail}`;
  });
  if (o.deliveryFee) lines.push(`· Domicilio — ${formatCOP(o.deliveryFee)}`);
  return [
    `🛒 <b>Nueva compra ${esc(number)}</b> · ${formatCOP(o.total)}`,
    `${esc(o.customerName)} · ${o.hasPhysical ? esc(o.city ?? 'Quindío') : 'Solo digital'}`,
    '',
    ...lines,
    '',
    `<a href="${env.ADMIN_ORIGIN}/admin/pedidos/${o.id}">Ver el pedido en el panel</a>`,
  ].join('\n');
}

export async function notifyPaidOrder(number: string, o: PaidOrder, items: Item[]) {
  if (!telegramConfigured()) return;
  const chats = await db.query.telegramChat.findMany({ where: eq(schema.telegramChat.enabled, true) });
  if (chats.length === 0) return;
  const text = paidOrderText(number, o, items);
  const rows = await db
    .insert(schema.telegramMessage)
    .values(chats.map((c) => ({ chatRef: c.id, orderId: o.id, kind: 'order_paid', text })))
    .returning({ id: schema.telegramMessage.id });
  for (const { id } of rows) await deliver(id);
}

async function deliver(id: number) {
  const msg = await db.query.telegramMessage.findFirst({ where: eq(schema.telegramMessage.id, id) });
  if (!msg || msg.status === 'sent') return;
  const chat = await db.query.telegramChat.findFirst({ where: eq(schema.telegramChat.id, msg.chatRef) });
  if (!chat) return;
  try {
    await sendToChat(chat, msg.text);
    await db.update(schema.telegramMessage).set({ status: 'sent', sentAt: new Date(), attempts: msg.attempts + 1, error: null }).where(eq(schema.telegramMessage.id, id));
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 300) : 'error';
    // 403: el bot ya no puede escribir ahí (lo sacaron o lo bloquearon). No tiene sentido reintentar.
    const final = err instanceof TelegramError && err.code === 403;
    await db
      .update(schema.telegramMessage)
      .set({ status: final ? 'dropped' : 'failed', attempts: msg.attempts + 1, error: message })
      .where(eq(schema.telegramMessage.id, id));
  }
}

// Envía a un chat y deja registro en él. Sigue la migración de grupo a supergrupo.
export async function sendToChat(chat: Chat, text: string) {
  try {
    await sendText(chat.chatId, text);
    await db.update(schema.telegramChat).set({ lastSentAt: new Date(), lastError: null }).where(eq(schema.telegramChat.id, chat.id));
  } catch (err) {
    if (err instanceof TelegramError && err.params.migrate_to_chat_id) {
      const chatId = String(err.params.migrate_to_chat_id);
      await db.update(schema.telegramChat).set({ chatId, type: 'supergroup', updatedAt: new Date() }).where(eq(schema.telegramChat.id, chat.id));
      return sendToChat({ ...chat, chatId }, text);
    }
    const message = err instanceof Error ? err.message.slice(0, 300) : 'error';
    const gone = err instanceof TelegramError && err.code === 403;
    await db
      .update(schema.telegramChat)
      .set({ lastError: message, ...(gone ? { enabled: false } : {}), updatedAt: new Date() })
      .where(eq(schema.telegramChat.id, chat.id));
    throw err;
  }
}

export async function retryFailedTelegram() {
  if (!telegramConfigured()) return;
  const pending = await db
    .select({ id: schema.telegramMessage.id })
    .from(schema.telegramMessage)
    .where(and(inArray(schema.telegramMessage.status, ['pending', 'failed']), lt(schema.telegramMessage.attempts, MAX_ATTEMPTS)))
    .limit(20);
  for (const { id } of pending) await deliver(id);
}
