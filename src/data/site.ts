// Datos de contacto y ajustes globales de Blend.
// Fuente: CATÁLOGO_BLEND (agosto 2026). Los productos viven en src/content/.

export const site = {
  name: 'Blend',
  // WhatsApp del catálogo: 311 366 7282 (Colombia).
  whatsapp: '573113667282',
  whatsappDisplay: '311 366 7282',
  // ⚠︎ Placeholder: el catálogo no trae correo. Reemplazar antes de publicar.
  email: 'hola@blend.co',
  instagram: 'univerxo_blend',
  city: 'Armenia, Quindío',
  deliveryArea: 'Armenia y alrededores',
  deliveryNotes: [
    'Entrega inmediata según disponibilidad.',
    'Encargos especiales con mínimo 24 horas.',
  ],
  // Lema del catálogo.
  claim: 'Bienestar, sabor e historias que nos conectan.',
  founders: 'Katherine & Simón',
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

// Sellos de la etiqueta (Wellness Collection).
export const seals = [
  'Sin azúcar añadida',
  'Keto friendly',
  'Ingredientes 100 % naturales',
  'Mantener refrigerado',
] as const;

export type DrinkFormat = {
  id: string;
  label: string;
  detail?: string;
  price: number;
  note?: string;
};

export const drinkLines = {
  flow: {
    name: 'Flow',
    short: 'Bebidas refrigeradas con fruta, raíces y vitamina C.',
    // Precios del catálogo para toda la línea.
    formats: [
      { id: 'lata', label: 'Lata', detail: '330 ml', price: 10000 },
      { id: 'six', label: 'Six pack', detail: '6 × 330 ml', price: 42000, note: 'Ármalo con los sabores que quieras.' },
      { id: 'litro', label: '1 litro', price: 25000 },
    ] as DrinkFormat[],
  },
  'cold-coffee': {
    name: 'Cold Coffee',
    short: 'El café que amas, ahora frío y listo para acompañarte.',
    // En Cold Coffee el precio va en cada bebida (Latte Ice y Americano Ice difieren).
    formats: [] as DrinkFormat[],
  },
} as const;

export type DrinkLine = keyof typeof drinkLines;

// Eventos y bebidas personalizadas (catálogo, p. 9).
export const events = {
  title: '¿Tienes un evento?',
  lead: 'Sorprende a tus invitados con una bebida creada especialmente para ese momento.',
  motto: 'Tú la imaginas, en Blend la enlatamos.',
  note: 'Momentos únicos merecen detalles únicos.',
  waText: 'Hola Blend, tengo un evento y quiero una bebida personalizada.',
} as const;

// Distribuidores (página /negocios)
export const stockists = [
  ['01', 'Mocawa Café', 'Armenia · Quindío'],
] as const;

export const placeTags = [
  'Cafés', 'Estudios de yoga', 'Gimnasios boutique',
  'Hoteles', 'Co-workings', 'Tiendas pequeñas',
] as const;
