import { ActionError, type ActionAPIContext } from 'astro:actions';
import { can, type Permission } from '../lib/guard';
import { clientIp } from '../lib/ip';

export function ipOf(ctx: ActionAPIContext) {
  return clientIp(ctx.request);
}

export function requireUser(ctx: ActionAPIContext, permission?: Permission) {
  const user = ctx.locals.user;
  if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
  if (permission && !can(user.role, permission)) throw new ActionError({ code: 'FORBIDDEN', message: 'No tienes permiso para esto.' });
  return user;
}
