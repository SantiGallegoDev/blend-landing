// Stock en vivo desde el panel: { [variantId]: unidades | null }, null = no lleva inventario.
// Si la API no responde, devuelve null y la página sigue funcionando sin límites.
export type Stock = Record<string, number | null>;

let pending: Promise<Stock | null> | null = null;

export function loadStock(api: string): Promise<Stock | null> {
  pending ??= fetch(`${api}/api/stock`)
    .then((res) => (res.ok ? res.json() : null))
    .then((body) => (body?.stock as Stock | undefined) ?? null)
    .catch(() => null);
  return pending;
}
