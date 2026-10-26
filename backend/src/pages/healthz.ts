import type { APIRoute } from 'astro';
import { sql } from 'drizzle-orm';
import { db } from '../db';

// Healthcheck de Railway: confirma que el servicio responde y que Postgres está disponible.
export const GET: APIRoute = async () => {
  try {
    await db.execute(sql`select 1`);
    return new Response('ok', { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return new Response('db', { status: 503 });
  }
};
