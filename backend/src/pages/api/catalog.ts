import type { APIRoute } from 'astro';
import { json, preflight } from '../../lib/api';
import { publicCatalog } from '../../lib/catalog-public';

// Lo lee el build de la web (Vercel). Es información pública: solo productos publicados.
export const GET: APIRoute = async ({ request }) =>
  json(request, await publicCatalog(), { headers: { 'Cache-Control': 'public, max-age=60' } });

export const OPTIONS: APIRoute = ({ request }) => preflight(request, 'GET');
