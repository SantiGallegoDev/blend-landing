import type { APIRoute } from 'astro';
import { timingSafeEqual } from 'node:crypto';
import { overLimit } from '../../../lib/api';
import { clientIp } from '../../../lib/ip';
import { handleUpdate, telegramConfigured, webhookSecret, type TgUpdate } from '../../../lib/telegram';

// Webhook del bot de Telegram: vincula chats con el código del panel y sigue cambios de cada chat.
// Solo se aceptan avisos con el secreto que se registró en setWebhook.
export const POST: APIRoute = async ({ request }) => {
  if (!telegramConfigured()) return new Response(null, { status: 404 });
  if (await overLimit(`telegram:${clientIp(request) ?? 'sin-ip'}`, 120, 60)) return new Response(null, { status: 429 });

  const given = Buffer.from(request.headers.get('x-telegram-bot-api-secret-token') ?? '');
  const expected = Buffer.from(webhookSecret());
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return new Response(null, { status: 401 });

  const update = (await request.json().catch(() => null)) as TgUpdate | null;
  if (!update) return new Response(null, { status: 400 });
  try {
    await handleUpdate(update);
  } catch (err) {
    // 200 igual: si Telegram reintenta un aviso que falla siempre, se atascan los siguientes.
    console.error('webhook telegram', err instanceof Error ? err.message : err);
  }
  return new Response(null, { status: 200 });
};
