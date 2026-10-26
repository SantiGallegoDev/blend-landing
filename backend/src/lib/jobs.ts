// Tareas periódicas dentro del mismo servicio (cada 5 min): vencer reservas, conciliar pagos
// en proceso, reintentar correos y avisos de Telegram, y mantener el webhook del bot. Un candado de Postgres evita que dos réplicas las corran a la vez.
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { retryFailedEmails } from './emails';
import { paymentsConfigured } from './mercadopago';
import { expireReservations, reconcileProcessing } from './orders';
import { ensureWebhook, retryFailedTelegram } from './telegram';

const EVERY_MS = 5 * 60_000;
const LOCK_ID = 7_424_201;

export async function runJobs() {
  // Candado de transacción: se suelta solo al terminar, aunque el pool use otra conexión para el resto.
  await db
    .transaction(async (tx) => {
      const [row] = (await tx.execute(sql`select pg_try_advisory_xact_lock(${LOCK_ID}) as locked`)) as unknown as { locked: boolean }[];
      if (!row?.locked) return;
      const expired = await expireReservations();
      if (expired) console.info(`tareas: ${expired} reserva(s) vencida(s)`);
      if (paymentsConfigured()) await reconcileProcessing();
      await retryFailedEmails();
      await retryFailedTelegram().catch((err) => console.error('tareas telegram', err instanceof Error ? err.message : err));
      // Si cambia el dominio de la API, el webhook del bot se vuelve a registrar solo.
      await ensureWebhook().catch((err) => console.error('webhook telegram', err instanceof Error ? err.message : err));
    })
    .catch((err) => console.error('tareas', err instanceof Error ? err.message : err));
}

const g = globalThis as { __blendJobs?: NodeJS.Timeout };
export function startJobs() {
  if (g.__blendJobs || process.env.BLEND_JOBS === 'off') return;
  g.__blendJobs = setInterval(runJobs, EVERY_MS);
  g.__blendJobs.unref();
  setTimeout(runJobs, 15_000).unref();
}
