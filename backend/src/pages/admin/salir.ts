import type { APIRoute } from 'astro';
import { auth } from '../../lib/auth';

// Solo POST: Astro verifica el Origin, así nadie puede cerrar la sesión desde otro sitio.
export const POST: APIRoute = async ({ request, redirect }) => {
  const res = await auth.api.signOut({ headers: request.headers, asResponse: true });
  const out = redirect('/admin/login');
  for (const cookie of res.headers.getSetCookie()) out.headers.append('Set-Cookie', cookie);
  return out;
};
