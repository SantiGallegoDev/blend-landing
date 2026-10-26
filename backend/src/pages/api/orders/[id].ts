import type { APIRoute } from 'astro';
import { json, overLimit, preflight } from '../../../lib/api';
import { clientIp } from '../../../lib/ip';
import { publicOrder } from '../../../lib/orders';

// Estado del pedido para la página /pedido de la web. Exige el token que se le dio al comprador:
// sin él no se puede consultar ni enumerar pedidos ajenos.
export const GET: APIRoute = async ({ params, url, request }) => {
  if (await overLimit(`order:${clientIp(request) ?? 'sin-ip'}`, 60, 60)) return json(request, { error: 'Demasiadas consultas.' }, { status: 429 });
  const token = url.searchParams.get('t') ?? '';
  const id = params.id ?? '';
  if (!/^[0-9a-f-]{36}$/.test(id) || token.length < 20) return json(request, { error: 'Pedido no encontrado.' }, { status: 404 });
  const order = await publicOrder(id, token);
  if (!order) return json(request, { error: 'Pedido no encontrado.' }, { status: 404 });
  return json(request, order);
};

export const OPTIONS: APIRoute = ({ request }) => preflight(request, 'GET');
