// Cliente de Better Auth para los scripts del navegador del panel.
import { createAuthClient } from 'better-auth/client';
import { twoFactorClient } from 'better-auth/client/plugins';
import { passkeyClient } from '@better-auth/passkey/client';

export const authClient = createAuthClient({
  basePath: '/admin/api/auth',
  plugins: [twoFactorClient(), passkeyClient()],
});

// Mensajes en español para los códigos de error más comunes.
const messages: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'Correo o contraseña incorrectos.',
  UNAUTHORIZED: 'Correo o contraseña incorrectos.',
  INVALID_CODE: 'El código no es válido. Revisa la hora del teléfono e inténtalo de nuevo.',
  INVALID_TWO_FACTOR_COOKIE: 'La verificación venció. Vuelve a iniciar sesión.',
  TOO_MANY_REQUESTS: 'Demasiados intentos. Espera un momento.',
  INVALID_PASSWORD: 'La contraseña no es correcta.',
};

export function errorMessage(error: { code?: string; message?: string; status?: number } | null | undefined): string {
  if (!error) return 'Algo salió mal. Inténtalo de nuevo.';
  if (error.status === 429) return messages.TOO_MANY_REQUESTS;
  return (error.code && messages[error.code]) || error.message || 'Algo salió mal. Inténtalo de nuevo.';
}
