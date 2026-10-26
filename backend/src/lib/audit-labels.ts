// Textos legibles para el registro de auditoría.
export const actionLabel: Record<string, string> = {
  'auth.login': 'Inició sesión',
  'auth.login_failed': 'Intento de inicio de sesión fallido',
  'auth.logout': 'Cerró sesión',
  'auth.password_change': 'Cambió su contraseña',
  'auth.2fa_enable_start': 'Empezó a activar el 2FA',
  'auth.backup_codes': 'Generó códigos de respaldo',
  'auth.passkey_add': 'Agregó una passkey',
  'auth.passkey_delete': 'Eliminó una passkey',
  'session.revoke': 'Cerró una sesión',
  'invitation.create': 'Envió una invitación',
  'invitation.revoke': 'Revocó una invitación',
  'invitation.accept': 'Aceptó una invitación',
  'user.create_owner': 'Cuenta owner creada desde la consola',
  'user.role': 'Cambió un rol',
  'user.disable': 'Desactivó una cuenta',
  'user.enable': 'Reactivó una cuenta',
};
