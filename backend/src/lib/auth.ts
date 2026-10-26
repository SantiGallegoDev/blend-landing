// Autenticación del panel: contraseña (argon2) + TOTP obligatorio, o passkey.
// No hay registro público: las cuentas nacen de una invitación o del script create-owner.
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware, isAPIError } from 'better-auth/api';
import { twoFactor } from 'better-auth/plugins/two-factor';
import { passkey } from '@better-auth/passkey';
import { hash, verify } from '@node-rs/argon2';
import { createHash } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import { env, isProd } from '../env';
import { audit } from './audit';
import { clientIp } from './ip';
import { sendMail } from './mail';

const MAX_FAILURES = 5;
const BASE_LOCK_MINUTES = 15;

// Bloqueo progresivo por cuenta: 15 min tras 5 fallos, y se duplica con cada fallo extra (máx. 24 h).
async function registerFailure(email: string) {
  const [row] = await db
    .insert(schema.loginGuard)
    .values({ email, failures: 1 })
    .onConflictDoUpdate({
      target: schema.loginGuard.email,
      set: { failures: sql`${schema.loginGuard.failures} + 1`, updatedAt: sql`now()` },
    })
    .returning();
  if (row.failures >= MAX_FAILURES) {
    const minutes = Math.min(BASE_LOCK_MINUTES * 2 ** (row.failures - MAX_FAILURES), 24 * 60);
    await db
      .update(schema.loginGuard)
      .set({ lockedUntil: new Date(Date.now() + minutes * 60_000) })
      .where(eq(schema.loginGuard.email, email));
  }
}

// Cambios de seguridad de la cuenta que quedan en el registro de auditoría.
const AUDITED_PATHS: Record<string, string> = {
  '/change-password': 'auth.password_change',
  '/two-factor/enable': 'auth.2fa_enable_start',
  '/two-factor/generate-backup-codes': 'auth.backup_codes',
  '/passkey/verify-registration': 'auth.passkey_add',
  '/passkey/delete-passkey': 'auth.passkey_delete',
  '/sign-out': 'auth.logout',
};

const fingerprint = (userAgent?: string | null) =>
  createHash('sha256').update(userAgent ?? 'desconocido').digest('hex');

export const auth = betterAuth({
  appName: 'Blend Admin',
  baseURL: env.ADMIN_ORIGIN,
  basePath: '/admin/api/auth',
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.ADMIN_ORIGIN],
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      twoFactor: schema.twoFactor,
      passkey: schema.passkey,
      rateLimit: schema.rateLimit,
    },
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    password: {
      hash: (password) => hash(password),
      verify: ({ hash: stored, password }) => verify(stored, password),
    },
  },
  user: {
    additionalFields: {
      role: { type: 'string', input: false, defaultValue: 'operador' },
      disabled: { type: 'boolean', input: false, defaultValue: false },
    },
  },
  session: {
    // Vence a los 30 min sin actividad; el tope absoluto de 12 h lo aplica el middleware.
    expiresIn: 30 * 60,
    updateAge: 5 * 60,
    freshAge: 10 * 60,
  },
  rateLimit: {
    enabled: true,
    storage: 'database',
    window: 60,
    max: 60,
    customRules: {
      '/sign-in/email': { window: 60, max: 5 },
      '/passkey/verify-authentication': { window: 60, max: 10 },
      '/two-factor/*': { window: 60, max: 5 },
      '/change-password': { window: 60, max: 3 },
    },
  },
  advanced: {
    cookiePrefix: 'blend-admin',
    useSecureCookies: isProd,
    defaultCookieAttributes: { sameSite: 'strict', httpOnly: true, path: '/' },
    ipAddress: { ipAddressHeaders: [env.CLIENT_IP_HEADER] },
  },
  plugins: [
    twoFactor({
      issuer: 'Blend Admin',
      backupCodeOptions: { amount: 10 },
      accountLockout: { maxFailedAttempts: MAX_FAILURES, durationSeconds: BASE_LOCK_MINUTES * 60 },
    }),
    passkey({
      rpID: new URL(env.ADMIN_ORIGIN).hostname,
      rpName: 'Blend Admin',
      origin: env.ADMIN_ORIGIN,
    }),
  ],
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // El 2FA es obligatorio: no se puede apagar desde el panel.
      if (ctx.path === '/two-factor/disable') {
        throw new APIError('FORBIDDEN', { message: 'La verificación en dos pasos es obligatoria.' });
      }
      if (ctx.path !== '/sign-in/email') return;
      const email = String(ctx.body?.email ?? '').trim().toLowerCase();
      const guard = await db.query.loginGuard.findFirst({ where: eq(schema.loginGuard.email, email) });
      if (guard?.lockedUntil && guard.lockedUntil > new Date()) {
        // Mismo mensaje que una contraseña errada: no revela si la cuenta existe o está bloqueada.
        throw new APIError('UNAUTHORIZED', { message: 'Correo o contraseña incorrectos.' });
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      const audited = AUDITED_PATHS[ctx.path];
      if (audited && !isAPIError(ctx.context.returned)) {
        await audit({ userId: ctx.context.session?.user.id, action: audited, entity: 'user', ip: clientIp(ctx.request) });
      }
      if (ctx.path !== '/sign-in/email') return;
      const email = String(ctx.body?.email ?? '').trim().toLowerCase();
      if (isAPIError(ctx.context.returned)) {
        await registerFailure(email);
        await audit({ action: 'auth.login_failed', entity: 'user', entityId: email, ip: clientIp(ctx.request) });
      } else {
        await db.delete(schema.loginGuard).where(eq(schema.loginGuard.email, email));
      }
    }),
  },
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const u = await db.query.user.findFirst({ where: eq(schema.user.id, session.userId) });
          if (!u || u.disabled) throw new APIError('FORBIDDEN', { message: 'Cuenta desactivada.' });
        },
        after: async (session) => {
          await audit({ userId: session.userId, action: 'auth.login', entity: 'session', entityId: session.id, ip: session.ipAddress });
          const fp = fingerprint(session.userAgent);
          const known = await db
            .insert(schema.knownDevice)
            .values({ userId: session.userId, fingerprint: fp })
            .onConflictDoUpdate({
              target: [schema.knownDevice.userId, schema.knownDevice.fingerprint],
              set: { lastSeenAt: sql`now()` },
            })
            .returning({ fresh: sql<boolean>`xmax = 0` });
          const isNewDevice = known[0]?.fresh;
          const priorDevices = await db.$count(schema.knownDevice, eq(schema.knownDevice.userId, session.userId));
          if (isNewDevice && priorDevices > 1) {
            const u = await db.query.user.findFirst({ where: eq(schema.user.id, session.userId) });
            if (u) {
              await sendMail({
                to: u.email,
                subject: 'Nuevo inicio de sesión en el panel de Blend',
                text: [
                  `Hola ${u.name},`,
                  '',
                  'Se inició sesión en tu cuenta del panel de Blend desde un dispositivo nuevo.',
                  `Navegador: ${session.userAgent ?? 'desconocido'}`,
                  `IP: ${session.ipAddress ?? 'desconocida'}`,
                  `Fecha: ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`,
                  '',
                  'Si no fuiste tú, cambia tu contraseña y cierra las demás sesiones desde "Mi cuenta", y avisa al dueño de la cuenta.',
                ].join('\n'),
              }).catch((err) => console.error('aviso de inicio de sesión', err instanceof Error ? err.message : err));
            }
          }
        },
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
