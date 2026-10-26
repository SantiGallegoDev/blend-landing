// Archivos del catálogo: fotos (públicas vía /media) y PDF de e-books (privados).
// En producción van al Bucket S3 de Railway; en desarrollo, a una carpeta local.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../env';

export type StoredFile = { body: Uint8Array; contentType: string };

const s3 = env.S3_BUCKET
  ? new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: false,
      credentials: { accessKeyId: env.S3_ACCESS_KEY_ID ?? '', secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? '' },
    })
  : null;

const root = resolve(env.STORAGE_DIR);

// Las claves las genera el servidor, pero igual se valida que no escapen de la carpeta.
function localPath(key: string) {
  if (!/^[\w\-/.]+$/.test(key) || key.includes('..')) throw new Error('Clave de archivo inválida');
  const path = resolve(join(root, key));
  if (!path.startsWith(root + sep)) throw new Error('Clave de archivo inválida');
  return path;
}

export async function putFile(key: string, body: Uint8Array, contentType: string): Promise<void> {
  if (s3) {
    await s3.send(new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: body, ContentType: contentType }));
    return;
  }
  const path = localPath(key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body);
  await writeFile(path + '.type', contentType);
}

export async function getFile(key: string): Promise<StoredFile | null> {
  try {
    if (s3) {
      const res = await s3.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
      if (!res.Body) return null;
      return { body: await res.Body.transformToByteArray(), contentType: res.ContentType ?? 'application/octet-stream' };
    }
    const path = localPath(key);
    await stat(path);
    const contentType = await readFile(path + '.type', 'utf8').catch(() => 'application/octet-stream');
    return { body: await readFile(path), contentType };
  } catch {
    return null;
  }
}

export async function deleteFile(key: string): Promise<void> {
  if (s3) {
    await s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    return;
  }
  const path = localPath(key);
  await rm(path, { force: true });
  await rm(path + '.type', { force: true });
}

// Enlace temporal para descargar un archivo privado. En S3 es una URL prefirmada;
// en local, una ruta de la API firmada con HMAC.
export async function signedDownloadUrl(key: string, filename: string, seconds = 120): Promise<string> {
  const disposition = `attachment; filename="${filename.replace(/[^\w.\- ]/g, '_')}"`;
  if (s3) {
    return getSignedUrl(s3, new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key, ResponseContentDisposition: disposition }), {
      expiresIn: seconds,
    });
  }
  const exp = Math.floor(Date.now() / 1000) + seconds;
  const params = new URLSearchParams({ key, exp: String(exp), name: filename, sig: localSignature(key, exp, filename) });
  return `${env.API_ORIGIN}/api/files?${params}`;
}

function localSignature(key: string, exp: number, filename: string) {
  return createHmac('sha256', env.BETTER_AUTH_SECRET).update(`${key}\n${exp}\n${filename}`).digest('base64url');
}

export function verifyLocalSignature(key: string, exp: number, filename: string, sig: string): boolean {
  if (s3 || !Number.isFinite(exp) || exp < Date.now() / 1000) return false;
  const expected = Buffer.from(localSignature(key, exp, filename));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export const storageMode = s3 ? 's3' : 'local';
