import { eq } from 'drizzle-orm';
import { db, schema } from '../db';
import type { Role } from '../db/schema';
import { auth } from './auth';

// Crea una cuenta con contraseña. Solo la usan create-owner y la aceptación de invitaciones.
export async function createAdminUser(input: { email: string; name: string; password: string; role: Role }) {
  const ctx = await auth.$context;
  const email = input.email.trim().toLowerCase();
  const exists = await db.query.user.findFirst({ where: eq(schema.user.email, email) });
  if (exists) throw new Error('Ya existe una cuenta con ese correo.');
  const { minPasswordLength, maxPasswordLength } = ctx.password.config;
  if (input.password.length < minPasswordLength || input.password.length > maxPasswordLength) {
    throw new Error(`La contraseña debe tener entre ${minPasswordLength} y ${maxPasswordLength} caracteres.`);
  }
  const user = await ctx.internalAdapter.createUser({
    email,
    name: input.name.trim(),
    emailVerified: true,
    role: input.role,
  }, { method: 'admin' });
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: 'credential',
    accountId: user.id,
    password: await ctx.password.hash(input.password),
  });
  return user;
}
