// Datos de contacto y ajustes globales de Blend.
// Los productos viven en src/content/ (colecciones `bebidas` y `ebooks`).

export const site = {
  name: 'Blend',
  // ⚠︎ Placeholders: reemplazar antes de publicar.
  whatsapp: '573120000000',
  email: 'hola@blend.co',
  instagram: 'univerxo_blend',
  city: 'Armenia, Quindío',
  deliveryArea: 'Armenia y el Eje Cafetero',
  // Fase 4: se activa cuando el pago con Mercado Pago esté integrado y probado.
  checkoutEnabled: false,
} as const;

export function waLink(text = 'Hola Blend, quiero hacer un pedido.'): string {
  return `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(text)}`;
}

export const instagramUrl = `https://instagram.com/${site.instagram}`;

export function formatCOP(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value);
}

export const navLinks = [
  { label: 'Bebidas', href: '/bebidas' },
  { label: 'Digital', href: '/digital' },
  { label: 'Nosotros', href: '/nosotros' },
  { label: 'Negocios', href: '/negocios' },
] as const;

export const drinkLines = {
  flow: {
    name: 'Flow',
    short: 'Fruta, raíces y vitamina C.',
  },
  'cold-coffee': {
    name: 'Cold Coffee',
    short: 'Café de especialidad, tostión media, listo para tomar frío.',
  },
} as const;

export type DrinkLine = keyof typeof drinkLines;

// Distribuidores (página /negocios)
export const stockists = [
  ['01', 'Mocawa Café', 'Armenia · Quindío'],
] as const;

export const placeTags = [
  'Cafés', 'Estudios de yoga', 'Gimnasios boutique',
  'Hoteles', 'Co-workings', 'Tiendas pequeñas',
] as const;
