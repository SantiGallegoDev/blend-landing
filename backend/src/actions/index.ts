import { ActionError, defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import { and, eq, gt, isNull, ne } from 'drizzle-orm';
import { db, schema } from '../db';
import { roles } from '../db/schema';
import { env } from '../env';
import { audit } from '../lib/audit';
import { sendMail } from '../lib/mail';
import { invitationEmail } from '../lib/email-templates';
import { roleLabel } from '../lib/format';
import { hashToken, newToken } from '../lib/tokens';
import { createAdminUser } from '../lib/users';
import { alerts } from './alerts';
import { catalog } from './catalog';
import { orders } from './orders';
import { ipOf, requireUser } from './shared';

const INVITE_HOURS = 24;

export const server = {
  alerts,
  catalog,
  orders,

  invite: defineAction({
    accept: 'form',
    input: z.object({
      email: z.email('Escribe un correo válido.').transform((v) => v.trim().toLowerCase()),
      role: z.enum(roles),
    }),
    handler: async ({ email, role }, ctx) => {
      const me = requireUser(ctx, 'usuarios');
      const exists = await db.query.user.findFirst({ where: eq(schema.user.email, email) });
      if (exists) throw new ActionError({ code: 'CONFLICT', message: 'Ese correo ya tiene una cuenta.' });

      // Una invitación nueva anula las pendientes para el mismo correo.
      await db
        .update(schema.invitation)
        .set({ revokedAt: new Date() })
        .where(and(eq(schema.invitation.email, email), isNull(schema.invitation.acceptedAt), isNull(schema.invitation.revokedAt)));

      const { token, hash } = newToken();
      const id = crypto.randomUUID();
      await db.insert(schema.invitation).values({
        id,
        email,
        role,
        tokenHash: hash,
        invitedBy: me.id,
        expiresAt: new Date(Date.now() + INVITE_HOURS * 3600_000),
      });
      await audit({ userId: me.id, action: 'invitation.create', entity: 'invitation', entityId: id, after: { email, role }, ip: ipOf(ctx) });
      const mail = invitationEmail({ inviterName: me.name, roleLabel: roleLabel[role], url: `${env.ADMIN_ORIGIN}/admin/invitacion/${token}`, hours: INVITE_HOURS });
      await sendMail({ to: email, subject: mail.subject, text: mail.text, html: mail.html });
      return { email };
    },
  }),

  revokeInvite: defineAction({
    accept: 'form',
    input: z.object({ id: z.string().min(1) }),
    handler: async ({ id }, ctx) => {
      const me = requireUser(ctx, 'usuarios');
      await db.update(schema.invitation).set({ revokedAt: new Date() }).where(eq(schema.invitation.id, id));
      await audit({ userId: me.id, action: 'invitation.revoke', entity: 'invitation', entityId: id, ip: ipOf(ctx) });
    },
  }),

  changeRole: defineAction({
    accept: 'form',
    input: z.object({ userId: z.string().min(1), role: z.enum(roles) }),
    handler: async ({ userId, role }, ctx) => {
      const me = requireUser(ctx, 'usuarios');
      if (userId === me.id) throw new ActionError({ code: 'BAD_REQUEST', message: 'No puedes cambiar tu propio rol.' });
      const target = await db.query.user.findFirst({ where: eq(schema.user.id, userId) });
      if (!target) throw new ActionError({ code: 'NOT_FOUND' });
      await db.update(schema.user).set({ role, updatedAt: new Date() }).where(eq(schema.user.id, userId));
      await audit({ userId: me.id, action: 'user.role', entity: 'user', entityId: userId, before: { role: target.role }, after: { role }, ip: ipOf(ctx) });
    },
  }),

  setDisabled: defineAction({
    accept: 'form',
    input: z.object({ userId: z.string().min(1), disabled: z.enum(['true', 'false']).transform((v) => v === 'true') }),
    handler: async ({ userId, disabled }, ctx) => {
      const me = requireUser(ctx, 'usuarios');
      if (userId === me.id) throw new ActionError({ code: 'BAD_REQUEST', message: 'No puedes desactivar tu propia cuenta.' });
      if (disabled) {
        // Siempre debe quedar al menos un owner activo.
        const target = await db.query.user.findFirst({ where: eq(schema.user.id, userId) });
        if (target?.role === 'owner') {
          const owners = await db.$count(schema.user, and(eq(schema.user.role, 'owner'), eq(schema.user.disabled, false), ne(schema.user.id, userId)));
          if (owners === 0) throw new ActionError({ code: 'BAD_REQUEST', message: 'Debe quedar al menos un owner activo.' });
        }
      }
      await db.update(schema.user).set({ disabled, updatedAt: new Date() }).where(eq(schema.user.id, userId));
      // Desactivar cierra todas sus sesiones al instante.
      if (disabled) await db.delete(schema.session).where(eq(schema.session.userId, userId));
      await audit({ userId: me.id, action: disabled ? 'user.disable' : 'user.enable', entity: 'user', entityId: userId, ip: ipOf(ctx) });
    },
  }),

  acceptInvite: defineAction({
    accept: 'form',
    input: z
      .object({
        token: z.string().min(20),
        name: z.string().trim().min(2, 'Escribe tu nombre.').max(80),
        password: z.string().min(12, 'La contraseña debe tener al menos 12 caracteres.').max(128),
        confirm: z.string(),
      })
      .refine((d) => d.password === d.confirm, { message: 'Las contraseñas no coinciden.', path: ['confirm'] }),
    handler: async ({ token, name, password }, ctx) => {
      const invite = await db.query.invitation.findFirst({
        where: and(
          eq(schema.invitation.tokenHash, hashToken(token)),
          isNull(schema.invitation.acceptedAt),
          isNull(schema.invitation.revokedAt),
          gt(schema.invitation.expiresAt, new Date()),
        ),
      });
      if (!invite) throw new ActionError({ code: 'NOT_FOUND', message: 'La invitación no es válida o ya venció.' });

      // Marcarla primero evita que dos envíos simultáneos creen dos cuentas.
      const claimed = await db
        .update(schema.invitation)
        .set({ acceptedAt: new Date() })
        .where(and(eq(schema.invitation.id, invite.id), isNull(schema.invitation.acceptedAt)))
        .returning({ id: schema.invitation.id });
      if (claimed.length === 0) throw new ActionError({ code: 'CONFLICT', message: 'La invitación ya se usó.' });

      let user;
      try {
        user = await createAdminUser({ email: invite.email, name, password, role: invite.role });
      } catch (err) {
        await db.update(schema.invitation).set({ acceptedAt: null }).where(eq(schema.invitation.id, invite.id));
        throw new ActionError({ code: 'BAD_REQUEST', message: err instanceof Error ? err.message : 'No se pudo crear la cuenta.' });
      }
      await audit({ userId: user.id, action: 'invitation.accept', entity: 'user', entityId: user.id, after: { email: user.email, role: invite.role }, ip: ipOf(ctx) });
      return { email: user.email };
    },
  }),

  revokeSession: defineAction({
    accept: 'form',
    input: z.object({ id: z.string().min(1) }),
    handler: async ({ id }, ctx) => {
      const me = requireUser(ctx);
      // Solo se pueden cerrar sesiones propias.
      await db.delete(schema.session).where(and(eq(schema.session.id, id), eq(schema.session.userId, me.id)));
      await audit({ userId: me.id, action: 'session.revoke', entity: 'session', entityId: id, ip: ipOf(ctx) });
    },
  }),
};
