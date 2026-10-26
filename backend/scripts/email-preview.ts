// Envía una muestra de cada correo del sistema, con datos de ejemplo, para revisar el diseño.
//   npm run email:preview -- --to tu@correo.com
// Sin --to, escribe los HTML en ./email-preview/ para abrirlos en el navegador.
import { mkdirSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import {
  ebookLinksEmail,
  invitationEmail,
  newDeviceEmail,
  orderPaidEmail,
  teamOrderPaidEmail,
  type EmailItem,
  type OrderView,
  type Rendered,
} from '../src/lib/email-templates';
import { sendMail } from '../src/lib/mail';
import { env } from '../src/env';

const { values } = parseArgs({ options: { to: { type: 'string' } } });
const dl = { limit: 5, days: 7 };
const link = (n: string) => ({ name: n, url: `${env.API_ORIGIN}/d/ejemplo-de-enlace-de-descarga` });

const base: OrderView = {
  number: 'BLD-1024',
  customerName: 'Laura Gómez',
  email: 'laura@ejemplo.com',
  phone: '311 000 0000',
  hasPhysical: true,
  hasDigital: false,
  city: 'Armenia',
  address: 'Carrera 14 # 20-35, Barrio Laureles',
  deliveryNotes: 'Torre 2, apto 503. Dejar en portería.',
  subtotal: 72000,
  deliveryFee: 6000,
  total: 78000,
};
const drinks: EmailItem[] = [
  { name: 'Six pack Flow', detail: '2× Detox, 2× Pink Cloud, 2× Sunset', quantity: 1, total: 42000, color: '#DC4981' },
  { name: 'Detox', detail: 'Lata 330 ml', quantity: 2, total: 20000, color: '#CAC05F' },
  { name: 'Latte Ice', detail: 'Lata 330 ml', quantity: 1, total: 12000, color: '#CBA781' },
];
const ebook: EmailItem = { name: 'Cocina con calma', detail: 'PDF · 48 páginas', quantity: 1, total: 30000, color: '#C5D1B0', isDigital: true };

const samples: [string, Rendered][] = [
  ['1-compra-bebidas', orderPaidEmail({ ...base, subtotal: 74000, total: 80000 }, drinks, [], dl)],
  ['2-compra-ebook', orderPaidEmail({ ...base, hasPhysical: false, hasDigital: true, city: null, address: null, deliveryNotes: null, subtotal: 30000, deliveryFee: 0, total: 30000 }, [ebook], [link('Cocina con calma')], dl)],
  ['3-compra-mixta', orderPaidEmail({ ...base, hasDigital: true, subtotal: 72000, total: 78000 }, [drinks[0], ebook], [link('Cocina con calma')], dl)],
  ['4-reenvio-ebooks', ebookLinksEmail(base, [link('Cocina con calma')], dl)],
  ['5-aviso-equipo', teamOrderPaidEmail({ ...base, subtotal: 74000, total: 80000 }, drinks, `${env.ADMIN_ORIGIN}/admin/pedidos/ejemplo`)],
  ['6-invitacion', invitationEmail({ inviterName: 'Santi Gallego', roleLabel: 'Operador', url: `${env.ADMIN_ORIGIN}/admin/invitacion/ejemplo`, hours: 24 })],
  ['7-nuevo-dispositivo', newDeviceEmail({ name: 'Santi Gallego', device: 'Chrome en Windows', ip: '181.52.10.4', when: new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'long', timeStyle: 'short' }), accountUrl: `${env.ADMIN_ORIGIN}/admin/cuenta` })],
];

if (values.to) {
  for (const [name, mail] of samples) {
    await sendMail({ to: values.to, subject: `[Muestra ${name.split('-')[0]}/7] ${mail.subject}`, text: mail.text, html: mail.html });
    console.log(`enviado: ${name} — ${mail.subject}`);
    await new Promise((r) => setTimeout(r, 700));
  }
} else {
  mkdirSync('email-preview', { recursive: true });
  for (const [name, mail] of samples) writeFileSync(`email-preview/${name}.html`, mail.html);
  console.log(`${samples.length} correos en ./email-preview/`);
}
process.exit(0);
