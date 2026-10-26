import type { AstroGlobal } from 'astro';
import type { Role } from '../db/schema';

// Qué puede hacer cada rol. El owner lo puede todo.
const permissions = {
  usuarios: ['owner'],
  actividad: ['owner', 'admin'],
  productos: ['owner', 'admin'],
  inventario: ['owner', 'admin'],
  pedidos: ['owner', 'admin', 'operador'],
  reembolsos: ['owner', 'admin'],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof permissions;

export function can(role: string | undefined, permission: Permission): boolean {
  return (permissions[permission] as readonly string[]).includes(role ?? '');
}

// En páginas: `const denied = requirePermission(Astro, 'usuarios'); if (denied) return denied;`
export function requirePermission(Astro: AstroGlobal, permission: Permission): Response | null {
  if (can(Astro.locals.user?.role, permission)) return null;
  return new Response('No tienes permiso para ver esta página.', { status: 403 });
}
