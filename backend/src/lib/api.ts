// Utilidades de la API pública (api.<dominio>): CORS limitado a la web y límite de peticiones.
import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import { env } from '../env';

export function cors(request: Request, init: ResponseInit = {}): Headers {
  const headers = new Headers(init.headers);
  const origin = request.headers.get('origin');
  if (origin === env.SITE_ORIGIN) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }
  return headers;
}

export function json(request: Request, body: unknown, init: ResponseInit = {}) {
  const headers = cors(request, init);
  headers.set('Content-Type', 'application/json');
  if (!headers.has('Cache-Control')) headers.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function preflight(request: Request, methods = 'GET, POST') {
  const headers = cors(request);
  headers.set('Access-Control-Allow-Methods', methods);
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  headers.set('Access-Control-Max-Age', '600');
  return new Response(null, { status: 204, headers });
}

// Ventana fija por clave (reutiliza la tabla de rate limit de Better Auth). true = se pasó del límite.
export async function overLimit(key: string, max: number, windowSeconds: number): Promise<boolean> {
  const now = Date.now();
  const id = `api:${key}`;
  const [row] = await db
    .insert(schema.rateLimit)
    .values({ id, key: id, count: 1, lastRequest: now })
    .onConflictDoUpdate({
      target: schema.rateLimit.key,
      set: {
        count: sql`case when ${schema.rateLimit.lastRequest} < ${now - windowSeconds * 1000} then 1 else ${schema.rateLimit.count} + 1 end`,
        lastRequest: sql`case when ${schema.rateLimit.lastRequest} < ${now - windowSeconds * 1000} then ${now} else ${schema.rateLimit.lastRequest} end`,
      },
    })
    .returning({ count: schema.rateLimit.count });
  return row.count > max;
}

export async function clearLimit(key: string) {
  await db.delete(schema.rateLimit).where(and(eq(schema.rateLimit.key, `api:${key}`)));
}
