// Plantillas de correo de Blend. HTML con tablas y estilos en línea (lo único que respetan Gmail,
// Outlook y Apple Mail) y una versión en texto plano para cada correo.
// Títulos en serif (Georgia: lo más cercano a Newsreader que existe en todos los clientes de correo).
import { env } from '../env';
import { formatCOP } from './format';

const C = {
  page: '#F3ECE2',
  card: '#FFFDF9',
  cream: '#F6EFE3',
  ink: '#2A2520',
  muted: '#6E655E',
  soft: '#9A8F86',
  line: '#E9DFD2',
  warn: '#8A5A12',
  warnBg: '#F8E9CF',
};
const SERIF = "Georgia, 'Times New Roman', Times, serif";
const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";

const BRAND = {
  site: env.SITE_ORIGIN,
  siteLabel: env.SITE_ORIGIN.replace(/^https?:\/\//, ''),
  logo: `${env.SITE_ORIGIN}/email/logo-blend.png`,
  whatsapp: '573113667282',
  whatsappDisplay: '311 366 7282',
  instagram: 'univerxo_blend',
  claim: 'Bienestar, sabor e historias que nos conectan.',
  email: env.MAIL_FROM.match(/<([^>]+)>/)?.[1] ?? env.MAIL_FROM,
};

export type Rendered = { subject: string; html: string; text: string };

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// ── Piezas ────────────────────────────────────────────────────────────────

function layout(o: { preheader: string; eyebrow: string; title: string; intro: string; body: string; note: string }) {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(o.title)}</title>
<style>@media (max-width:480px){.card{padding:32px 22px 28px!important;border-radius:22px!important}.h1{font-size:27px!important}.wrap{padding:20px 10px 32px!important}}</style></head>
<body style="margin:0;padding:0;background:${C.page};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.page};">${esc(o.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page};">
<tr><td align="center" class="wrap" style="padding:32px 16px 40px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
    <tr><td align="center" style="padding:8px 0 28px;">
      <a href="${BRAND.site}" style="text-decoration:none;"><img src="${BRAND.logo}" width="120" height="37" alt="Blend" style="display:block;border:0;width:120px;height:auto;"></a>
    </td></tr>
    <tr><td class="card" style="background:${C.card};border-radius:28px;padding:44px 40px 40px;border:1px solid ${C.line};">
      <p style="margin:0 0 14px;font-family:${SANS};font-size:11px;letter-spacing:2.4px;text-transform:uppercase;color:${C.soft};">${esc(o.eyebrow)}</p>
      <h1 class="h1" style="margin:0 0 16px;font-family:${SERIF};font-size:32px;line-height:1.12;font-weight:normal;letter-spacing:-0.5px;color:${C.ink};">${o.title}</h1>
      <p style="margin:0 0 28px;font-family:${SANS};font-size:16px;line-height:1.6;color:${C.muted};">${o.intro}</p>
      ${o.body}
    </td></tr>
    <tr><td align="center" style="padding:32px 24px 0;">
      <p style="margin:0 0 10px;font-family:${SERIF};font-size:17px;font-style:italic;color:${C.ink};">${esc(BRAND.claim)}</p>
      <p style="margin:0 0 18px;font-family:${SANS};font-size:13px;line-height:1.7;color:${C.muted};">
        <a href="${BRAND.site}" style="color:${C.ink};text-decoration:none;">${esc(BRAND.siteLabel)}</a>
        &nbsp;·&nbsp; <a href="https://wa.me/${BRAND.whatsapp}" style="color:${C.ink};text-decoration:none;">WhatsApp ${BRAND.whatsappDisplay}</a>
        &nbsp;·&nbsp; <a href="https://instagram.com/${BRAND.instagram}" style="color:${C.ink};text-decoration:none;">@${BRAND.instagram}</a>
      </p>
      <p style="margin:0;font-family:${SANS};font-size:12px;line-height:1.6;color:${C.soft};">${o.note}<br>Blend · Armenia, Quindío, Colombia</p>
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>`;
}

function button(href: string, label: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px;"><tr>
<td style="border-radius:999px;background:${C.ink};">
<a href="${esc(href)}" style="display:inline-block;padding:15px 30px;font-family:${SANS};font-size:15px;font-weight:bold;color:${C.cream};text-decoration:none;border-radius:999px;">${esc(label)}</a>
</td></tr></table>`;
}

function section(title: string, inner: string) {
  return `<p style="margin:28px 0 12px;font-family:${SANS};font-size:11px;letter-spacing:2.4px;text-transform:uppercase;color:${C.soft};">${esc(title)}</p>${inner}`;
}

function box(inner: string, tone: 'cream' | 'warn' = 'cream') {
  const bg = tone === 'warn' ? C.warnBg : C.cream;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:${bg};border-radius:18px;padding:20px 22px;font-family:${SANS};font-size:14px;line-height:1.65;color:${tone === 'warn' ? C.warn : C.ink};">${inner}</td></tr></table>`;
}

export type EmailItem = { name: string; detail?: string | null; quantity: number; total: number; color?: string | null; isDigital?: boolean };

function items(list: EmailItem[]) {
  const rows = list
    .map((i) => {
      const dot = i.color ?? C.line;
      return `<tr>
<td width="18" valign="top" style="padding:16px 0;border-bottom:1px solid ${C.line};"><div style="width:10px;height:10px;border-radius:50%;background:${esc(dot)};margin-top:7px;"></div></td>
<td valign="top" style="padding:16px 12px 16px 0;border-bottom:1px solid ${C.line};">
  <div style="font-family:${SERIF};font-size:18px;line-height:1.3;color:${C.ink};">${i.quantity > 1 ? `${i.quantity} × ` : ''}${esc(i.name)}</div>
  ${i.detail ? `<div style="font-family:${SANS};font-size:13px;line-height:1.5;color:${C.muted};margin-top:2px;">${esc(i.detail)}${i.isDigital ? ' · E-book' : ''}</div>` : i.isDigital ? `<div style="font-family:${SANS};font-size:13px;color:${C.muted};margin-top:2px;">E-book</div>` : ''}
</td>
<td valign="top" align="right" style="padding:16px 0;border-bottom:1px solid ${C.line};font-family:${SANS};font-size:15px;color:${C.ink};white-space:nowrap;">${formatCOP(i.total)}</td>
</tr>`;
    })
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${C.line};">${rows}</table>`;
}

function totals(t: { subtotal: number; deliveryFee: number; total: number; city?: string | null; physical: boolean }) {
  const row = (label: string, value: string, strong = false) =>
    `<tr><td style="padding:${strong ? '14px 0 0' : '6px 0'};font-family:${strong ? SERIF : SANS};font-size:${strong ? '20px' : '14px'};color:${strong ? C.ink : C.muted};">${label}</td><td align="right" style="padding:${strong ? '14px 0 0' : '6px 0'};font-family:${strong ? SERIF : SANS};font-size:${strong ? '22px' : '14px'};color:${C.ink};white-space:nowrap;">${value}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;">
${row('Subtotal', formatCOP(t.subtotal))}
${t.physical ? row(`Domicilio${t.city ? ` · ${esc(t.city)}` : ''}`, t.deliveryFee ? formatCOP(t.deliveryFee) : 'Gratis') : ''}
<tr><td colspan="2" style="padding-top:8px;border-bottom:1px solid ${C.line};font-size:0;line-height:0;">&nbsp;</td></tr>
${row('Total', formatCOP(t.total), true)}
</table>`;
}

function downloads(links: { name: string; url: string }[], limit: number, days: number) {
  const rows = links
    .map(
      (l) => `<tr><td style="padding:14px 0;border-bottom:1px solid ${C.line};">
<div style="font-family:${SERIF};font-size:18px;color:${C.ink};margin-bottom:10px;">${esc(l.name)}</div>
${button(l.url, 'Descargar PDF')}
</td></tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${C.line};">${rows}</table>
<p style="margin:12px 0 0;font-family:${SANS};font-size:13px;line-height:1.6;color:${C.muted};">Cada enlace sirve para ${limit} descargas durante ${days} días. Guarda el PDF en tu teléfono o computador; si se te vence, escríbenos y te mandamos uno nuevo.</p>`;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0];

const textFooter = `\n—\nBlend · ${BRAND.siteLabel}\nWhatsApp ${BRAND.whatsappDisplay} · @${BRAND.instagram}\nArmenia, Quindío, Colombia`;

const textItems = (list: EmailItem[]) =>
  list.map((i) => `· ${i.quantity} × ${i.name}${i.detail ? ` (${i.detail})` : ''} — ${formatCOP(i.total)}`).join('\n');

// ── Correos ───────────────────────────────────────────────────────────────

export type OrderView = {
  number: string;
  customerName: string;
  email: string;
  phone: string;
  hasPhysical: boolean;
  hasDigital: boolean;
  city: string | null;
  address: string | null;
  deliveryNotes: string | null;
  subtotal: number;
  deliveryFee: number;
  total: number;
};

// 1. Pedido pagado: bebidas, e-books o ambos.
export function orderPaidEmail(o: OrderView, list: EmailItem[], links: { name: string; url: string }[], dl: { limit: number; days: number }): Rendered {
  const name = firstName(o.customerName);
  const onlyDigital = o.hasDigital && !o.hasPhysical;
  const title = onlyDigital ? `Tus e-books están listos, ${esc(name)}.` : `Gracias, ${esc(name)}. Tu pedido está confirmado.`;
  const intro = onlyDigital
    ? 'Recibimos tu pago. Aquí abajo están tus enlaces de descarga.'
    : o.hasDigital
      ? 'Recibimos tu pago. Abajo tienes tus e-books para descargar, y ya estamos preparando tus bebidas.'
      : 'Recibimos tu pago y ya estamos preparando tus bebidas. Te escribimos por WhatsApp para coordinar la entrega.';

  const body = [
    links.length ? section(links.length > 1 ? 'Tus e-books' : 'Tu e-book', downloads(links, dl.limit, dl.days)) : '',
    section(`Pedido ${o.number}`, items(list) + totals({ ...o, physical: o.hasPhysical })),
    o.hasPhysical
      ? section(
          'Entrega',
          box(
            `<strong style="font-family:${SERIF};font-size:17px;font-weight:normal;">${esc(o.address)}</strong><br>${esc(o.city)}, Quindío` +
              (o.deliveryNotes ? `<br><span style="color:${C.muted};">${esc(o.deliveryNotes)}</span>` : '') +
              `<br><br><span style="color:${C.muted};">Te escribimos al ${esc(o.phone)} para acordar la hora. Al recibirlas, guárdalas en la nevera.</span>`,
          ),
        )
      : '',
    `<p style="margin:28px 0 0;font-family:${SANS};font-size:14px;line-height:1.6;color:${C.muted};">¿Alguna duda? Responde este correo o escríbenos por <a href="https://wa.me/${BRAND.whatsapp}" style="color:${C.ink};">WhatsApp</a>.</p>`,
  ].join('');

  return {
    subject: onlyDigital ? `Tus e-books de Blend · pedido ${o.number}` : `Pedido ${o.number} confirmado`,
    html: layout({
      preheader: onlyDigital ? 'Tus enlaces de descarga están adentro.' : `Recibimos tu pago de ${formatCOP(o.total)}.`,
      eyebrow: onlyDigital ? 'Blend Digital' : 'Pago confirmado',
      title,
      intro,
      body,
      note: `Recibes este correo por tu compra en ${esc(BRAND.siteLabel)}.`,
    }),
    text: [
      `Hola ${name},`,
      '',
      intro,
      ...(links.length ? ['', `Tus e-books (${dl.limit} descargas durante ${dl.days} días):`, ...links.map((l) => `${l.name}: ${l.url}`)] : []),
      '',
      `Pedido ${o.number}`,
      textItems(list),
      ...(o.hasPhysical ? [`Domicilio ${o.city}: ${o.deliveryFee ? formatCOP(o.deliveryFee) : 'gratis'}`] : []),
      `Total: ${formatCOP(o.total)}`,
      ...(o.hasPhysical ? ['', `Entrega: ${o.address}, ${o.city} (Quindío).`, `Te escribimos al ${o.phone} para acordar la hora.`] : []),
      '',
      '¿Dudas? Responde este correo o escríbenos por WhatsApp.',
      textFooter,
    ].join('\n'),
  };
}

// 2. Reenvío de enlaces de e-books (desde el panel).
export function ebookLinksEmail(o: Pick<OrderView, 'number' | 'customerName'>, links: { name: string; url: string }[], dl: { limit: number; days: number }): Rendered {
  const name = firstName(o.customerName);
  return {
    subject: `Tus enlaces de descarga · pedido ${o.number}`,
    html: layout({
      preheader: 'Enlaces nuevos para descargar tus e-books.',
      eyebrow: 'Blend Digital',
      title: `Aquí tienes tus e-books, ${esc(name)}.`,
      intro: 'Te enviamos enlaces nuevos de descarga. Los anteriores ya no funcionan.',
      body: section(links.length > 1 ? 'Tus e-books' : 'Tu e-book', downloads(links, dl.limit, dl.days)),
      note: `Recibes este correo por tu pedido ${esc(o.number)} en ${esc(BRAND.siteLabel)}.`,
    }),
    text: [`Hola ${name},`, '', 'Te enviamos enlaces nuevos (los anteriores ya no funcionan):', '', ...links.map((l) => `${l.name}: ${l.url}`), '', `Cada enlace sirve ${dl.limit} descargas durante ${dl.days} días.`, textFooter].join('\n'),
  };
}

// 3. Aviso interno: pedido pagado.
export function teamOrderPaidEmail(o: OrderView, list: EmailItem[], panelUrl: string): Rendered {
  const wa = `https://wa.me/${o.phone.replace(/\D/g, '').replace(/^(?!57)(\d{10})$/, '57$1')}`;
  const customer = box(
    `<strong style="font-family:${SERIF};font-size:18px;font-weight:normal;">${esc(o.customerName)}</strong><br>` +
      `<a href="${wa}" style="color:${C.ink};">${esc(o.phone)} · WhatsApp</a><br>` +
      `<a href="mailto:${esc(o.email)}" style="color:${C.ink};">${esc(o.email)}</a>` +
      (o.hasPhysical
        ? `<br><br><strong>Entrega:</strong> ${esc(o.address)}, ${esc(o.city)}${o.deliveryNotes ? `<br><span style="color:${C.muted};">${esc(o.deliveryNotes)}</span>` : ''}`
        : `<br><br><span style="color:${C.muted};">Solo digital: los e-books ya le llegaron por correo.</span>`),
  );
  return {
    subject: `Nuevo pedido ${o.number} · ${formatCOP(o.total)}${o.hasPhysical ? ` · ${o.city}` : ' · digital'}`,
    html: layout({
      preheader: `${o.customerName} pagó ${formatCOP(o.total)}.`,
      eyebrow: 'Nuevo pedido pagado',
      title: `${esc(o.number)} · ${formatCOP(o.total)}`,
      intro: o.hasPhysical ? 'Hay un pedido para preparar y despachar.' : 'Venta digital: no hay nada que despachar.',
      body: [section('Cliente', customer), section('Productos', items(list) + totals({ ...o, physical: o.hasPhysical })), `<div style="margin-top:28px;">${button(panelUrl, 'Abrir en el panel')}</div>`].join(''),
      note: 'Aviso interno del panel de Blend.',
    }),
    text: [
      `Nuevo pedido pagado ${o.number} · ${formatCOP(o.total)}`,
      '',
      `${o.customerName} · ${o.phone} · ${o.email}`,
      o.hasPhysical ? `Entrega: ${o.address}, ${o.city}${o.deliveryNotes ? ` (${o.deliveryNotes})` : ''}` : 'Solo digital.',
      '',
      textItems(list),
      `Total: ${formatCOP(o.total)}`,
      '',
      `Panel: ${panelUrl}`,
    ].join('\n'),
  };
}

// 4. Invitación al panel.
export function invitationEmail(i: { inviterName: string; roleLabel: string; url: string; hours: number }): Rendered {
  return {
    subject: 'Te invitaron al panel de Blend',
    html: layout({
      preheader: `${i.inviterName} te dio acceso al panel de administración.`,
      eyebrow: 'Panel de Blend',
      title: 'Te damos la bienvenida al equipo.',
      intro: `${esc(i.inviterName)} te invitó al panel de administración de Blend con el rol <strong style="color:${C.ink};">${esc(i.roleLabel)}</strong>.`,
      body:
        button(i.url, 'Crear mi cuenta') +
        `<p style="margin:16px 0 24px;font-family:${SANS};font-size:13px;line-height:1.6;color:${C.muted};">El enlace vence en ${i.hours} horas y sirve una sola vez.</p>` +
        box(`<strong>Antes de empezar:</strong> ten a mano una app autenticadora en tu teléfono (Google Authenticator, Microsoft Authenticator o 1Password). El panel te pedirá activar la verificación en dos pasos.`),
      note: 'Si no esperabas esta invitación, ignora este correo: sin el enlace nadie puede crear la cuenta.',
    }),
    text: [`${i.inviterName} te invitó al panel de Blend con el rol "${i.roleLabel}".`, '', `Crea tu cuenta (vence en ${i.hours} horas, un solo uso):`, i.url, '', 'Ten a mano una app autenticadora: el panel te pedirá activar la verificación en dos pasos.', '', 'Si no esperabas esta invitación, ignora este correo.', textFooter].join('\n'),
  };
}

// 5. Inicio de sesión desde un dispositivo nuevo.
export function newDeviceEmail(d: { name: string; device: string; ip: string; when: string; accountUrl: string }): Rendered {
  return {
    subject: 'Nuevo inicio de sesión en el panel de Blend',
    html: layout({
      preheader: `${d.device} · ${d.when}`,
      eyebrow: 'Seguridad',
      title: `Hola, ${esc(firstName(d.name))}: entraste desde un dispositivo nuevo.`,
      intro: 'Si fuiste tú, no tienes que hacer nada.',
      body:
        box(
          `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="font-family:${SANS};font-size:14px;line-height:1.8;color:${C.ink};">` +
            `<tr><td style="color:${C.muted};padding-right:18px;">Dispositivo</td><td>${esc(d.device)}</td></tr>` +
            `<tr><td style="color:${C.muted};padding-right:18px;">IP</td><td>${esc(d.ip)}</td></tr>` +
            `<tr><td style="color:${C.muted};padding-right:18px;">Fecha</td><td>${esc(d.when)}</td></tr></table>`,
        ) +
        `<div style="margin-top:24px;">` +
        box(`<strong>¿No fuiste tú?</strong> Entra a tu cuenta, cambia la contraseña (eso cierra las demás sesiones) y avisa al dueño del panel.`, 'warn') +
        `</div><div style="margin-top:24px;">${button(d.accountUrl, 'Revisar mi cuenta')}</div>`,
      note: 'Este aviso de seguridad se envía siempre que alguien entra al panel desde un dispositivo nuevo.',
    }),
    text: [`Hola ${firstName(d.name)},`, '', 'Se inició sesión en tu cuenta del panel de Blend desde un dispositivo nuevo.', `Dispositivo: ${d.device}`, `IP: ${d.ip}`, `Fecha: ${d.when}`, '', `Si no fuiste tú, cambia tu contraseña en ${d.accountUrl} y avisa al dueño del panel.`, textFooter].join('\n'),
  };
}
