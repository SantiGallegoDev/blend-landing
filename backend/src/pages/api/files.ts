import type { APIRoute } from 'astro';
import { getFile, verifyLocalSignature } from '../../lib/storage';

// Solo desarrollo (almacenamiento local): sirve un archivo privado con un enlace firmado que vence.
// En producción los enlaces son URLs prefirmadas del bucket y esta ruta siempre responde 404.
export const GET: APIRoute = async ({ url }) => {
  const key = url.searchParams.get('key') ?? '';
  const name = url.searchParams.get('name') ?? 'archivo';
  const exp = Number(url.searchParams.get('exp'));
  if (!verifyLocalSignature(key, exp, name, url.searchParams.get('sig') ?? '')) return new Response('Enlace vencido.', { status: 404 });
  const file = await getFile(key);
  if (!file) return new Response('No encontrado', { status: 404 });
  return new Response(file.body as BodyInit, {
    headers: {
      'Content-Type': file.contentType,
      'Content-Disposition': `attachment; filename="${name.replace(/[^\w.\- ]/g, '_')}"`,
      'Cache-Control': 'no-store',
    },
  });
};
