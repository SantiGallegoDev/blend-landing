// Formatos, precios y carrito. Con el catálogo del panel (BLEND_API_URL) todo sale de las
// variantes y combos de la API; sin él, de drinkLines en site.ts y los pedidos van a WhatsApp.
import { getCollection, type CollectionEntry } from 'astro:content';
import { API_URL, CHECKOUT_ON } from './blend-api';
import { getDrinks } from './catalog';
import { site, drinkLines, type DrinkFormat } from './site';

export const cartEnabled = (site.checkoutEnabled || CHECKOUT_ON) && !!API_URL;

export type Combo = CollectionEntry<'combos'>['data'] & { id: string };

export async function getSixPack(): Promise<Combo | undefined> {
  const combos = await getCollection('combos');
  const c = combos.find((x) => x.data.slug === 'six-pack-flow') ?? combos[0];
  return c && { id: c.id, ...c.data };
}

// "Lata 330 ml" → id 'lata', label 'Lata', detail '330 ml'. "1 litro" queda entero.
function fromVariant(v: { id: string; name: string; price: number }): DrinkFormat {
  const m = v.name.match(/^(.*?)\s+(\d.*)$/);
  const id = /lata/i.test(v.name) ? 'lata' : /litro/i.test(v.name) ? 'litro' : v.id;
  return { id, label: m ? m[1] : v.name, detail: m ? m[2] : undefined, price: v.price, variantId: v.id };
}

export async function drinkFormats(drink: CollectionEntry<'bebidas'>): Promise<DrinkFormat[]> {
  const d = drink.data;
  if (d.variants.length === 0) {
    const line = drinkLines[d.line];
    return line.formats.length > 0 ? [...line.formats] : [{ id: 'lata', label: 'Lata', detail: d.volume, price: d.price ?? 0 }];
  }
  const formats = d.variants.map(fromVariant);
  const pack = await getSixPack();
  if (pack && d.variants.some((v) => pack.variantIds.includes(v.id))) {
    formats.splice(1, 0, {
      id: 'six',
      label: 'Six pack',
      detail: `${pack.size} × ${d.volume}`,
      price: pack.price,
      units: pack.size,
      bundleId: pack.id,
      note: pack.description,
    });
  }
  return formats;
}

// Precios de la línea Flow para tablas y textos generales.
export async function flowFormats(): Promise<DrinkFormat[]> {
  const flow = (await getDrinks()).find((d) => d.data.line === 'flow' && d.data.variants.length > 0);
  return flow ? drinkFormats(flow) : [...drinkLines.flow.formats];
}
