// Correos de pedidos: se guardan primero en email_log y se envían después, con reintentos.
// Si Resend falla, el pedido no se pierde: la tarea periódica vuelve a intentarlo.
import { and, eq, inArray, lt } from 'drizzle-orm';
import { db, schema } from '../db';
import { sendMail } from './mail';

const MAX_ATTEMPTS = 5;
// Correos con enlaces de descarga: una vez enviados se borra el cuerpo para no dejar tokens en la base.
const SENSITIVE = new Set(['customer_paid', 'ebook_resend']);

export async function queueEmail(m: { orderId?: string; kind: string; to: string; subject: string; body: string }) {
  const [row] = await db.insert(schema.emailLog).values({ ...m, orderId: m.orderId ?? null }).returning({ id: schema.emailLog.id });
  await deliver(row.id);
}

async function deliver(id: number) {
  const mail = await db.query.emailLog.findFirst({ where: eq(schema.emailLog.id, id) });
  if (!mail || mail.status === 'sent') return;
  try {
    await sendMail({ to: mail.to, subject: mail.subject, text: mail.body });
    await db
      .update(schema.emailLog)
      .set({
        status: 'sent',
        sentAt: new Date(),
        attempts: mail.attempts + 1,
        error: null,
        ...(SENSITIVE.has(mail.kind) ? { body: '(contenido omitido tras el envío: tenía enlaces de descarga)' } : {}),
      })
      .where(eq(schema.emailLog.id, id));
  } catch (err) {
    await db
      .update(schema.emailLog)
      .set({ status: 'failed', attempts: mail.attempts + 1, error: err instanceof Error ? err.message.slice(0, 300) : 'error' })
      .where(eq(schema.emailLog.id, id));
  }
}

export async function retryFailedEmails() {
  const pending = await db
    .select({ id: schema.emailLog.id })
    .from(schema.emailLog)
    .where(and(inArray(schema.emailLog.status, ['pending', 'failed']), lt(schema.emailLog.attempts, MAX_ATTEMPTS)))
    .limit(20);
  for (const { id } of pending) await deliver(id);
}
