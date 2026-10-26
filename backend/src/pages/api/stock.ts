import type { APIRoute } from 'astro';
import { json, preflight } from '../../lib/api';
import { publicStock } from '../../lib/catalog-public';

export const GET: APIRoute = async ({ request }) =>
  json(request, { stock: await publicStock() }, { headers: { 'Cache-Control': 'public, max-age=15' } });

export const OPTIONS: APIRoute = ({ request }) => preflight(request, 'GET');
