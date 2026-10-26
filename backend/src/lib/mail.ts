// Envío de correos con la API HTTP de Resend. Sin RESEND_API_KEY (desarrollo) se imprimen en la consola.
import { env } from '../env';

type Mail = { to: string; subject: string; text: string; html?: string | null };

export async function sendMail({ to, subject, text, html }: Mail): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.info(`\n── correo (sin enviar) ──\npara: ${to}\nasunto: ${subject}\n\n${text}\n────────────────────────\n`);
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    // Las respuestas de los clientes llegan al buzón del remitente (ventas@).
    body: JSON.stringify({ from: env.MAIL_FROM, to, subject, text, ...(html ? { html } : {}) }),
  });
  if (!res.ok) throw new Error(`Resend respondió ${res.status}`);
}
