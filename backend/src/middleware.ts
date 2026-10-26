import { defineMiddleware } from 'astro:middleware';
import { auth, REMEMBER_DAYS } from './lib/auth';
import { env, isProd } from './env';
import { startJobs } from './lib/jobs';

startJobs();

const MAX_SESSION_MS = 12 * 60 * 60 * 1000;
const MAX_REMEMBERED_MS = REMEMBER_DAYS * 24 * 60 * 60 * 1000;
// Una sesión normal nunca vence a más de 30 min; si vence más lejos, es una sesión recordada.
const REMEMBERED_AFTER_MS = 60 * 60 * 1000;

// Rutas del panel que no exigen sesión.
const PUBLIC_ADMIN = [/^\/admin\/login\/?$/, /^\/admin\/invitacion\/[^/]+\/?$/, /^\/admin\/api\/auth\//];
// Con sesión pero sin 2FA solo se puede activar el 2FA o salir.
const SETUP_ONLY = [/^\/admin\/seguridad\/activar\/?$/, /^\/admin\/salir\/?$/, /^\/admin\/api\/auth\//];

const ADMIN_PATHS = /^\/(admin(\/|$)|_astro\/|_actions\/|robots\.txt$)/;
const API_PATHS = /^\/(api|media|d)\//;

function securityHeaders(res: Response, zone: 'admin' | 'api') {
  const h = res.headers;
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'no-referrer');
  h.set('X-Frame-Options', 'DENY');
  h.set('Cross-Origin-Opener-Policy', 'same-origin');
  h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  if (isProd) h.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  if (zone === 'admin') {
    h.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    // frame-ancestors no funciona en <meta>; el resto de la CSP la pone Astro con hashes.
    h.append('Content-Security-Policy', "frame-ancestors 'none'");
    if (!h.has('Cache-Control')) h.set('Cache-Control', 'no-store');
  }
  return res;
}

const ADMIN_HOST = new URL(env.ADMIN_ORIGIN).host;
const API_HOST = new URL(env.API_ORIGIN).host;

const notFound = () => new Response('No encontrado', { status: 404 });

export const onRequest = defineMiddleware(async (ctx, next) => {
  const { pathname, host } = ctx.url;
  // El healthcheck de Railway llega con su propio Host.
  if (pathname === '/healthz') return next();
  const isAdminHost = host === ADMIN_HOST;
  const isApiHost = host === API_HOST;

  // Cada host solo responde lo suyo: una cookie del panel nunca llega a la API pública.
  const zone = isAdminHost && ADMIN_PATHS.test(pathname) ? 'admin' : isApiHost && API_PATHS.test(pathname) ? 'api' : null;
  if (!zone) {
    if (isAdminHost && pathname === '/') return ctx.redirect('/admin');
    return notFound();
  }

  ctx.locals.user = null;
  ctx.locals.session = null;

  if (zone === 'api') return securityHeaders(await next(), 'api');

  if (PUBLIC_ADMIN.some((re) => re.test(pathname)) || pathname.startsWith('/_astro/') || pathname === '/robots.txt') {
    return securityHeaders(await next(), 'admin');
  }

  // returnHeaders: cuando Better Auth renueva la sesión (30 min deslizantes) manda la cookie nueva;
  // hay que pasarla al navegador o la cookie vence aunque haya actividad.
  const { headers: authHeaders, response: data } = await auth.api.getSession({ headers: ctx.request.headers, returnHeaders: true });
  if (!data || data.user.disabled) {
    if (pathname.startsWith('/_actions/')) return new Response(null, { status: 401 });
    return ctx.redirect(`/admin/login?next=${encodeURIComponent(pathname)}`);
  }

  // Tope absoluto: 12 h para una sesión normal, REMEMBER_DAYS para una recordada.
  const remembered = new Date(data.session.expiresAt).getTime() - Date.now() > REMEMBERED_AFTER_MS;
  if (Date.now() - new Date(data.session.createdAt).getTime() > (remembered ? MAX_REMEMBERED_MS : MAX_SESSION_MS)) {
    await auth.api.revokeSession({ headers: ctx.request.headers, body: { token: data.session.token } });
    return ctx.redirect('/admin/login?expirada=1');
  }

  if (!data.user.twoFactorEnabled && !SETUP_ONLY.some((re) => re.test(pathname))) {
    return ctx.redirect('/admin/seguridad/activar');
  }

  ctx.locals.user = data.user;
  ctx.locals.session = data.session;
  const res = securityHeaders(await next(), 'admin');
  for (const cookie of authHeaders?.getSetCookie() ?? []) res.headers.append('Set-Cookie', cookie);
  return res;
});
