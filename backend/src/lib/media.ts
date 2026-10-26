import type { APIRoute } from 'astro';
import { getFile } from './storage';

// Sirve fotos del catálogo. Solo claves bajo media/: los PDF privados nunca salen por aquí.
export function mediaRoute(): APIRoute {
  return async ({ params }) => {
    const key = `media/${params.key ?? ''}`;
    if (!/^media\/[\w-]+\.(png|webp|jpe?g|avif)$/.test(key)) return new Response('No encontrado', { status: 404 });
    const file = await getFile(key);
    if (!file) return new Response('No encontrado', { status: 404 });
    return new Response(file.body as BodyInit, {
      headers: {
        'Content-Type': file.contentType,
        // Las claves son únicas e inmutables: una foto nueva tiene otra URL.
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Cross-Origin-Resource-Policy': 'cross-origin',
      },
    });
  };
}

export const adminMediaUrl = (key: string) => `/admin/${key}`;
