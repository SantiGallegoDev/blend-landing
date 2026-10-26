// Procesa lo que se sube desde el panel antes de guardarlo.
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { putFile } from './storage';

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_PDF_BYTES = 150 * 1024 * 1024;
const MAX_SIDE = 2800;

// Re-codifica la imagen: corrige la orientación, quita metadatos (GPS, cámara) y limita el tamaño.
// Las que tienen transparencia (recortes de lata) quedan en PNG; el resto en WebP de alta calidad.
// La web vuelve a optimizarla en su build (AVIF/WebP por tamaño).
export async function storeImage(input: Uint8Array) {
  const img = sharp(input, { failOn: 'error' }).rotate();
  const meta = await img.metadata();
  if (!meta.format || !['jpeg', 'png', 'webp', 'avif', 'heif', 'tiff'].includes(meta.format)) {
    throw new Error('Formato de imagen no soportado. Usa JPG, PNG, WebP o AVIF.');
  }
  const resized = img.resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true });
  const alpha = meta.hasAlpha ?? false;
  const { data, info } = alpha
    ? await resized.png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true })
    : await resized.webp({ quality: 90 }).toBuffer({ resolveWithObject: true });
  const ext = alpha ? 'png' : 'webp';
  const key = `media/${randomUUID()}.${ext}`;
  await putFile(key, data, alpha ? 'image/png' : 'image/webp');
  return { key, width: info.width, height: info.height, hasAlpha: alpha };
}

export async function storePdf(input: Uint8Array) {
  // Firma de archivo PDF: "%PDF-" al inicio.
  if (Buffer.from(input.subarray(0, 5)).toString('latin1') !== '%PDF-') {
    throw new Error('El archivo no es un PDF válido.');
  }
  const key = `private/ebooks/${randomUUID()}.pdf`;
  await putFile(key, input, 'application/pdf');
  return { key, size: input.byteLength };
}
