// Variables de entorno validadas. En desarrollo se leen de .env; en Railway vienen del servicio.
import { existsSync } from 'node:fs';
import { z } from 'zod';

if (existsSync('.env')) process.loadEnvFile('.env');

const origin = z.url().transform((u) => u.replace(/\/$/, ''));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1),
  ADMIN_ORIGIN: origin,
  API_ORIGIN: origin,
  SITE_ORIGIN: origin,
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET debe tener al menos 32 caracteres'),
  RESEND_API_KEY: z.string().optional(),
  // Cabecera con la IP real del cliente. Railway sobrescribe X-Real-IP en su borde; X-Forwarded-For se puede falsificar.
  CLIENT_IP_HEADER: z.string().default('x-real-ip').transform((v) => v.toLowerCase()),
  MAIL_FROM: z.string().default('Blend <no-responder@blend.local>'),
  // Correo del equipo que recibe el aviso de cada pedido pagado.
  ORDERS_NOTIFY_EMAIL: z.string().optional(),

  // Archivos: sin S3_BUCKET se guardan en STORAGE_DIR (solo desarrollo).
  STORAGE_DIR: z.string().default('./storage'),
  S3_BUCKET: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('auto'),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  // Mercado Pago (API de Orders). Sin MP_ACCESS_TOKEN el checkout responde "pagos no configurados".
  MP_ACCESS_TOKEN: z.string().optional(),
  MP_WEBHOOK_SECRET: z.string().optional(),
  // Solo para pruebas locales contra un simulador; en producción se deja vacío.
  MP_API_BASE: z.string().default('https://api.mercadopago.com'),

  // Deploy Hook de Vercel para el botón "Publicar en la web".
  VERCEL_DEPLOY_HOOK_URL: z.string().optional(),
});

export const env = schema.parse(process.env);
export const isProd = env.NODE_ENV === 'production';
