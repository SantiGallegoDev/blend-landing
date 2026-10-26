import type { APIRoute } from 'astro';
import { env } from '../../env';
import { json, overLimit, preflight } from '../../lib/api';
import { clientIp } from '../../lib/ip';
import { paymentsConfigured } from '../../lib/mercadopago';
import { checkoutInput, CheckoutError, createCheckout } from '../../lib/orders';

// Crea el pedido, aparta el stock y devuelve el enlace de pago de Mercado Pago.
export const POST: APIRoute = async ({ request }) => {
  // Solo desde la web: el navegador manda Origin y otra página no lo puede falsificar.
  if (request.headers.get('origin') !== env.SITE_ORIGIN) return json(request, { error: 'Origen no permitido.' }, { status: 403 });
  if (!paymentsConfigured()) return json(request, { error: 'Los pagos en línea todavía no están activos.' }, { status: 503 });

  const ip = clientIp(request);
  if (await overLimit(`checkout:${ip ?? 'sin-ip'}`, 10, 10 * 60)) {
    return json(request, { error: 'Demasiados intentos. Espera unos minutos.' }, { status: 429 });
  }
  if (Number(request.headers.get('content-length') ?? 0) > 32_000) return json(request, { error: 'Pedido demasiado grande.' }, { status: 413 });

  const parsed = checkoutInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return json(
      request,
      { error: 'Revisa los datos del formulario.', issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
      { status: 400 },
    );
  }
  try {
    return json(request, await createCheckout(parsed.data, ip), { status: 201 });
  } catch (err) {
    if (err instanceof CheckoutError) return json(request, { error: err.message }, { status: err.status });
    console.error('checkout', err);
    return json(request, { error: 'Algo salió mal. Intenta de nuevo.' }, { status: 500 });
  }
};

export const OPTIONS: APIRoute = ({ request }) => preflight(request, 'POST');
