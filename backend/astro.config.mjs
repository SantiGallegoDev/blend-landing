import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

// Panel (admin.<dominio>) y API (api.<dominio>) de Blend en un solo servicio de Railway.
// El middleware decide qué rutas responde cada host.
// Con protocolo explícito, Astro confía en X-Forwarded-Proto/Host del proxy de Railway
// y arma las URL como https (lo necesitan checkOrigin y el ruteo por host).
const allowedDomains = [process.env.ADMIN_ORIGIN, process.env.API_ORIGIN]
  .filter(Boolean)
  .map((origin) => new URL(origin))
  .map((u) => ({ protocol: u.protocol.replace(':', ''), hostname: u.hostname }));

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  server: { host: process.env.HOST ?? 'localhost', port: Number(process.env.PORT ?? 4400) },
  devToolbar: { enabled: false },
  markdown: { syntaxHighlight: false },
  // Se optimizan al arrancar: si Vite las descubre al cargar la página, responde 504 "Outdated Optimize Dep".
  vite: {
    optimizeDeps: {
      include: ['better-auth/client', 'better-auth/client/plugins', '@better-auth/passkey/client', 'uqr'],
    },
  },
  security: {
    checkOrigin: true,
    // Solo se confía en el Host/X-Forwarded-Host de nuestros dominios.
    allowedDomains,
    // Hashes automáticos de scripts y estilos propios: nada inline ni de terceros.
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data: blob:",
        "connect-src 'self'",
        "font-src 'self'",
        "form-action 'self'",
        "base-uri 'none'",
        "object-src 'none'",
      ],
    },
  },
});
