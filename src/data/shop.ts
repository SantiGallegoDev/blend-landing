// Formatos, precios y carrito. Con el catálogo del panel (BLEND_API_URL) todo sale de las
// variantes y combos de la API; sin él, de drinkLines en site.ts y los pedidos van a WhatsApp.
import { getCollection, type CollectionEntry } from 'astro:content';
import { API_URL, CHECKOUT_ON, bundleUnitPrice } from './blend-api';
import { getDrinks } from './catalog';
import { site, drinkLines, type DrinkFormat } from './site';

export const cartEnabled = (site.checkoutEnabled || CHECKOUT_ON) && !!API_URL;

export type Combo = CollectionEntry<'combos'>['data'] & { id: string };

// Combos activos del panel, en el orden del panel (y por nombre si empatan).
export async function getCombos(): Promise<Combo[]> {
  const combos = await getCollection('combos');
  return combos
    .map((c) => ({ id: c.id, ...c.data }))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'es'));
}

// El combo del inicio: el destacado en el panel o, si ninguno, el primero.
export async function getFeaturedCombo(): Promise<Combo | undefined> {
  const combos = await getCombos();
  return combos.find((c) => c.featured) ?? combos[0];
}

// El combo al que entra esta bebida (el primero que incluya alguna de sus variantes).
export async function comboForDrink(drink: CollectionEntry<'bebidas'>): Promise<Combo | undefined> {
  const ids = new Set(drink.data.variants.map((v) => v.id));
  return (await getCombos()).find((c) => c.variantIds.some((id) => ids.has(id)));
}

// "Six pack" para cajas de 6; si no, "Caja de N".
export const comboLabel = (size: number) => (size === 6 ? 'Six pack' : `Caja de ${size}`);

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
  const combo = await comboForDrink(drink);
  const can = combo && d.variants.find((v) => combo.variantIds.includes(v.id));
  if (combo && can) {
    // Una caja llena de este sabor: con precio por sabor, size × el precio de este sabor en el combo.
    formats.splice(1, 0, {
      id: 'six',
      label: comboLabel(combo.size),
      detail: `${combo.size} × ${d.volume}`,
      price: combo.size * bundleUnitPrice(combo, can.id),
      units: combo.size,
      bundleId: combo.id,
      note: combo.description,
    });
  }
  return formats;
}

// Precios de la línea Flow para tablas y textos generales.
export async function flowFormats(): Promise<DrinkFormat[]> {
  const flow = (await getDrinks()).find((d) => d.data.line === 'flow' && d.data.variants.length > 0);
  return flow ? drinkFormats(flow) : [...drinkLines.flow.formats];
}
