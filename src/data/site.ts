// Single source of editable site content.
// Edit these values to swap WhatsApp number, IG handle, stockists, etc.

export const site = {
  whatsapp: '573120000000',
  whatsappMsg: 'Hola Blend, quiero pedir ☁',
  instagram: 'univerxo_blend',
  email: 'hola@blend.co',
  city: 'Armenia, Quindío',
  coords: '4.5339° N · 75.6811° W',
} as const;

export function waLink(text: string = site.whatsappMsg): string {
  return `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(text)}`;
}

export const navLinks = [
  { label: 'Productos',     href: '#productos' },
  { label: 'Rituales',      href: '#rituales' },
  { label: 'Origen',        href: '#origen' },
  { label: 'Distribuidores', href: '#distribuidores' },
] as const;

export const products = [
  {
    name: 'Pink Cloud',
    tag:  'agua de coco · fresa · pitahaya',
    cat:  '01 · bebida',
    img:  'img-blush',
    photo: '/images/product-pink-cloud.png',
    alt:   'Botella de Pink Cloud sobre travertino bañada en luz cálida',
    price: '$ 9.500',
  },
  {
    name: 'Abrazo Dulce',
    tag:  'arequipe natural sin azúcar',
    cat:  '02 · dulce',
    img:  'img-latte',
    photo: '/images/product-abrazo-dulce.png',
    alt:   'Frasco de Abrazo Dulce abierto sobre lino beige con cuchara de madera',
    price: '$ 18.000',
  },
  {
    name: 'Spoonables',
    tag:  'parfait de frutos rojos',
    cat:  '03 · cuchara',
    img:  'img-berry',
    photo: '/images/product-spoonables.png',
    alt:   'Vaso de Spoonables con capas de frutos rojos y yogur sobre fondo berry',
    price: '$ 12.500',
  },
] as const;

export const rituals = [
  {
    time: '07:42 am',
    title: 'desayuno lento',
    body:  'Spoonables con yogurt griego, miel suave, y un libro.',
    img:   'img-cream',
    dot:   'dot',
    big:   true,
    photo: '/images/ritual-desayuno-lento.png',
    alt:   'Desayuno lento con Spoonables, yogur griego con miel y un libro abierto',
  },
  {
    time: 'pre-movimiento',
    title: 'antes del mat',
    body:  '',
    img:   'img-matcha',
    dot:   'dot-matcha',
    big:   false,
    photo: '/images/ritual-antes-del-mat.png',
    alt:   'Pink Cloud junto a un mat enrollado y una toalla de algodón',
  },
  {
    time: '4 pm',
    title: 'pausa rosada',
    body:  '',
    img:   'img-blush',
    dot:   'dot-blush',
    big:   false,
    photo: '/images/ritual-pausa-rosada.png',
    alt:   'Pink Cloud en una mesa de tarde con cuaderno abierto y rosa seca',
  },
  {
    time: 'domingo',
    title: 'cuchara dulce',
    body:  'Abrazo Dulce sobre pan tostado y queso fresco.',
    img:   'img-latte',
    dot:   'dot-latte',
    big:   true,
    photo: '/images/ritual-cuchara-dulce.png',
    alt:   'Pan tostado con Abrazo Dulce sobre queso fresco en tabla de madera',
  },
] as const;

export const stockists = [
  ['01', 'Mocawa Café',          'Armenia · Quindío'],
] as const;

export const placeTags = [
  'Cafés', 'Yoga', 'Estudios', 'Gyms boutique',
  'Hoteles', 'Co-workings', 'Universidades',
] as const;

export const footerCols = [
  { title: 'Tienda',  items: ['Pink Cloud', 'Abrazo Dulce', 'Spoonables', 'Próximamente'] },
  { title: 'Marca',   items: ['Origen', 'Rituales', 'Distribuidores', 'Prensa'] },
  { title: 'Contacto', items: [`WhatsApp +57 312`, `@${site.instagram}`, site.email, site.city] },
] as const;
