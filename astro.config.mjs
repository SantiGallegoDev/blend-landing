import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://www.univerxoblend.com',
  output: 'static',
  compressHTML: true,
  // El CSS total pesa ~7 KB: incrustarlo evita peticiones que bloquean el primer render.
  build: { inlineStylesheets: 'always' },
  integrations: [
    sitemap({
      // Páginas internas o aún en borrador legal: fuera del sitemap.
      filter: (page) => !/\/(brand|terminos|privacidad|carrito|pedido)\/?$/.test(page),
    }),
  ],
});
