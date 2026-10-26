// "Publicar en la web": dispara un build de Vercel para que la web tome el catálogo nuevo.
import { inArray } from 'drizzle-orm';
import { db, schema } from '../db';
import { env } from '../env';

export async function publishState() {
  const rows = await db.select().from(schema.setting).where(inArray(schema.setting.key, ['catalog_changed_at', 'published_at']));
  const get = (k: string) => rows.find((r) => r.key === k)?.value as string | undefined;
  const changed = get('catalog_changed_at');
  const published = get('published_at');
  return { changed, published, pending: !!changed && (!published || changed > published), configured: !!env.VERCEL_DEPLOY_HOOK_URL };
}

export async function publishSite(): Promise<{ ok: boolean; message: string }> {
  if (!env.VERCEL_DEPLOY_HOOK_URL) {
    return { ok: false, message: 'Falta configurar VERCEL_DEPLOY_HOOK_URL en Railway para publicar desde aquí.' };
  }
  const res = await fetch(env.VERCEL_DEPLOY_HOOK_URL, { method: 'POST' });
  if (!res.ok) return { ok: false, message: `Vercel respondió ${res.status}. Inténtalo de nuevo en un momento.` };
  const now = new Date().toISOString();
  await db
    .insert(schema.setting)
    .values({ key: 'published_at', value: now })
    .onConflictDoUpdate({ target: schema.setting.key, set: { value: now, updatedAt: new Date() } });
  return { ok: true, message: 'Publicando: la web se actualiza en 1 o 2 minutos.' };
}
