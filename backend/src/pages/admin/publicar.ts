import type { APIRoute } from 'astro';
import { audit } from '../../lib/audit';
import { can } from '../../lib/guard';
import { clientIp } from '../../lib/ip';
import { publishSite } from '../../lib/publish';

export const POST: APIRoute = async ({ locals, request, redirect }) => {
  if (!can(locals.user?.role, 'productos')) return new Response('Sin permiso.', { status: 403 });
  const result = await publishSite();
  await audit({ userId: locals.user!.id, action: result.ok ? 'site.publish' : 'site.publish_failed', after: { message: result.message }, ip: clientIp(request) });
  // Sin Referer (la política es no-referrer): el formulario manda la ruta de vuelta.
  const back = String((await request.formData()).get('back') ?? '');
  const target = /^\/admin(\/[\w\-/]*)?$/.test(back) ? back : '/admin';
  return redirect(`${target}?publicado=${result.ok ? '1' : '0'}&msg=${encodeURIComponent(result.message)}`);
};
