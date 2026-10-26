import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db, schema } from '../../db';
import { env } from '../../env';
import { audit } from '../../lib/audit';
import { auth, REMEMBER_DAYS } from '../../lib/auth';
import { clientIp } from '../../lib/ip';

// "Recordar este navegador": alarga a REMEMBER_DAYS la sesión que se acaba de iniciar.
// Solo sirve en los primeros minutos tras entrar: una sesión vieja (o robada) no se puede alargar.
const JUST_SIGNED_IN_MS = 5 * 60 * 1000;

export const POST: APIRoute = async ({ request, locals }) => {
  const session = locals.session;
  if (!session || !locals.user) return new Response(null, { status: 401 });
  if (request.headers.get('origin') !== env.ADMIN_ORIGIN) return new Response(null, { status: 403 });
  if (Date.now() - new Date(session.createdAt).getTime() > JUST_SIGNED_IN_MS) return new Response(null, { status: 409 });

  const maxAge = REMEMBER_DAYS * 24 * 3600;
  await db
    .update(schema.session)
    .set({ expiresAt: new Date(Date.now() + maxAge * 1000), updatedAt: new Date() })
    .where(eq(schema.session.id, session.id));

  // La cookie de sesión vence a los 30 min: se vuelve a emitir, con el mismo valor firmado, para 30 días.
  const { name, attributes } = (await auth.$context).authCookies.sessionToken;
  const raw = request.headers
    .get('cookie')
    ?.split(/;\s*/)
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  if (!raw) return new Response(null, { status: 400 });
  const cookie = [
    `${name}=${raw}`,
    `Max-Age=${maxAge}`,
    `Path=${attributes.path ?? '/'}`,
    'HttpOnly',
    'SameSite=Strict',
    ...(attributes.secure ? ['Secure'] : []),
  ].join('; ');

  await audit({ userId: locals.user.id, action: 'auth.remember', entity: 'session', entityId: session.id, ip: clientIp(request) });
  return new Response(null, { status: 204, headers: { 'Set-Cookie': cookie } });
};
