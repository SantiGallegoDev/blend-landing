// Carrito en el navegador. Solo guarda ids y cantidades: precios, stock y totales los decide
// el servidor al pagar. Si el almacenamiento está bloqueado (modo privado), vive en memoria.
export type CartItem = { variantId: string; qty: number };
export type CartBundle = { key: string; bundleId: string; picks: { variantId: string; qty: number }[] };
export type Cart = { items: CartItem[]; bundles: CartBundle[] };

const KEY = 'blend.cart.v1';
const EVENT = 'blend:cart';
let memory: Cart = { items: [], bundles: [] };

export function readCart(): Cart {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Cart;
      if (Array.isArray(parsed.items) && Array.isArray(parsed.bundles)) return parsed;
    }
  } catch {}
  return memory;
}

function write(cart: Cart) {
  memory = cart;
  try {
    localStorage.setItem(KEY, JSON.stringify(cart));
  } catch {}
  window.dispatchEvent(new CustomEvent(EVENT, { detail: cart }));
}

export function addItem(variantId: string, qty = 1, max = 50) {
  const cart = readCart();
  const line = cart.items.find((i) => i.variantId === variantId);
  if (line) line.qty = Math.min(line.qty + qty, max);
  else cart.items.push({ variantId, qty: Math.min(qty, max) });
  write(cart);
}

export function setItemQty(variantId: string, qty: number) {
  const cart = readCart();
  cart.items = qty > 0 ? cart.items.map((i) => (i.variantId === variantId ? { ...i, qty } : i)) : cart.items.filter((i) => i.variantId !== variantId);
  write(cart);
}

export function addBundle(bundleId: string, picks: CartBundle['picks']) {
  const cart = readCart();
  cart.bundles.push({ key: crypto.randomUUID?.() ?? String(Date.now()), bundleId, picks });
  write(cart);
}

export function removeBundle(key: string) {
  const cart = readCart();
  cart.bundles = cart.bundles.filter((b) => b.key !== key);
  write(cart);
}

export function clearCart() {
  write({ items: [], bundles: [] });
}

export function cartCount(cart = readCart()) {
  return cart.items.reduce((s, i) => s + i.qty, 0) + cart.bundles.length;
}

export function onCartChange(fn: (cart: Cart) => void) {
  window.addEventListener(EVENT, (e) => fn((e as CustomEvent<Cart>).detail));
  // Otra pestaña cambió el carrito.
  window.addEventListener('storage', (e) => e.key === KEY && fn(readCart()));
}
