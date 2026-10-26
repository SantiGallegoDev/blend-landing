// Crea la primera cuenta owner del panel. Se corre una sola vez desde la consola:
//   npm run create-owner -- --email tu@correo.com --name "Tu nombre"
// En Railway: `railway run npm run create-owner -- ...` (pide la contraseña sin mostrarla).
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline';
import { createAdminUser } from '../src/lib/users';
import { audit } from '../src/lib/audit';

const { values } = parseArgs({ options: { email: { type: 'string' }, name: { type: 'string' } } });
if (!values.email || !values.name) {
  console.error('Uso: npm run create-owner -- --email tu@correo.com --name "Tu nombre"');
  process.exit(1);
}

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const write = (rl as unknown as { _writeToOutput: (s: string) => void });
    write._writeToOutput = (s: string) => {
      if (s.startsWith(question)) process.stdout.write(question);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

const password = process.env.OWNER_PASSWORD ?? (await askHidden('Contraseña (mín. 12 caracteres): '));
if (!process.env.OWNER_PASSWORD && password !== (await askHidden('Repite la contraseña: '))) {
  console.error('Las contraseñas no coinciden.');
  process.exit(1);
}

try {
  const user = await createAdminUser({ email: values.email, name: values.name, password, role: 'owner' });
  await audit({ userId: user.id, action: 'user.create_owner', entity: 'user', entityId: user.id });
  console.log(`Owner creado: ${user.email}. Al entrar por primera vez el panel te pedirá activar el 2FA.`);
  process.exit(0);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
