const dateFmt = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' });

export const formatDate = (d: Date | string | null | undefined) => (d ? dateFmt.format(new Date(d)) : '—');

export const roleLabel: Record<string, string> = { owner: 'Owner', admin: 'Admin', operador: 'Operador' };

const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
export const formatCOP = (n: number) => cop.format(n);

export const statusLabel: Record<string, string> = { draft: 'Borrador', active: 'Publicado', archived: 'Archivado' };

export const roleImageLabel: Record<string, string> = {
  card: 'Tarjeta',
  hero: 'Portada de ficha',
  cutout: 'Recorte sin fondo',
  gallery: 'Galería',
  cover: 'Portada del e-book',
  sample: 'Página de muestra',
};

export const orderStatusLabel: Record<string, string> = {
  pending: 'Esperando pago',
  processing: 'Pago en proceso',
  paid: 'Pagado',
  failed: 'Rechazado',
  canceled: 'Cancelado',
  refunded: 'Reembolsado',
  attention: 'Requiere atención',
};
export const orderStatusBadge: Record<string, string> = {
  pending: '',
  processing: 'badge-warn',
  paid: 'badge-ok',
  failed: 'badge-bad',
  canceled: 'badge-bad',
  refunded: 'badge-bad',
  attention: 'badge-warn',
};
export const fulfillmentLabel: Record<string, string> = {
  not_required: 'Digital',
  pending: 'Por preparar',
  preparing: 'Preparando',
  dispatched: 'En camino',
  delivered: 'Entregado',
  canceled: 'Entrega cancelada',
};
