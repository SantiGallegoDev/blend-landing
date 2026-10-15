# Blend

Sitio de **Blend**, marca de bienestar de Armenia, Quindío, con dos líneas:
**Blend Drinks** (bebidas en lata) y **Blend Digital** (e-books).

Astro 7 con CSS propio. Sitio estático; la compra en línea con Mercado Pago es la Fase 4.

## Uso

```bash
npm install
npm run dev       # http://localhost:4321
npm run build     # genera dist/
npm run preview   # sirve dist/ para revisar
npx astro check   # tipos y plantillas
npm run fonts     # regenera la tipografía Newsreader recortada (requiere: pip install fonttools brotli)
```

Requiere Node 22.12 o superior.

## Estructura

```
src/
  content/
    bebidas/      un archivo .md por bebida (datos de la etiqueta, color, fotos)
    ebooks/       un archivo .md por e-book (los `draft: true` solo se ven en desarrollo)
  content.config.ts   esquemas de las colecciones
  data/
    site.ts       contacto, WhatsApp, zona de entrega, líneas, ajustes globales
    catalog.ts    getDrinks() y getEbooks()
  assets/
    bebidas/      fotos de producto (se optimizan a AVIF/WebP en el build)
    marca/        logo y paisaje de Origen (logo-blend.svg es el logotipo vectorizado del catálogo, sin usar aún)
    fonts/        Newsreader recortada (ver scripts/build-fonts.py)
  components/     Hero, tarjetas, cuadrícula de bebidas, libro 3D, etc.
  pages/          /, /bebidas, /bebidas/[slug], /digital, /digital/[slug],
                  /nosotros, /negocios, /ayuda, /terminos, /privacidad, /brand
  styles/global.css   sistema visual "líquido y papel"
```

## Añadir una bebida

1. Copia las fotos a `src/assets/bebidas/<slug>/`.
2. Crea `src/content/bebidas/<slug>.md` copiando uno existente.
3. Usa solo datos de la etiqueta. `flavor` es el color del líquido y tiñe la ficha.
4. `focus` ajusta el encuadre (`"68% 50%"` mueve el recorte hacia la lata).

## Añadir un e-book

1. Copia la portada y las páginas de muestra a `src/assets/ebooks/<slug>/`.
2. Crea `src/content/ebooks/<slug>.md` con `title`, `summary`, `includes`, `toc`, `pages`, `price`, `cover` y `samples`.
3. Quita los archivos `borrador-*.md` cuando estén los reales.
4. **Los PDF nunca van al repositorio ni a `public/`.** La carpeta `ebooks/` y los `*.pdf` están en `.gitignore`; en la Fase 4 se suben a almacenamiento privado.

## Antes de publicar

- [x] Número de WhatsApp (311 366 7282, del catálogo) en `src/data/site.ts`.
- [ ] Correo y dominio reales en `src/data/site.ts`, `astro.config.mjs` y `public/robots.txt`.
- [ ] Regenerar las 5 fotos de café (las etiquetas dicen "COLD COFFE"). Están marcadas con `provisionalImages: true`.
- [x] Precios del catálogo (agosto 2026): lata Flow $10.000, six pack $42.000, 1 litro $25.000; Latte Ice $12.000, Americano Ice $10.000. Viven en `src/content/bebidas/*.md` (`price`) y en `drinkLines.flow.formats` de `src/data/site.ts`.
- [ ] Decidir si vuelven Spoonables (postres) y Abrazo Dulce (arequipe), que aparecen en el catálogo pero no en la web.
- [ ] Foto de Katherine y Simón para /nosotros: guardarla como `src/assets/marca/nosotros-katherine-y-simon.jpg` (la página la toma sola; mientras tanto muestra el hueco reservado).
- [ ] Cargar los e-books reales y borrar los borradores.
- [ ] Términos y política de privacidad redactados con asesoría legal (hoy son esqueletos sin indexar).

## Fase 4 (pendiente)

Carrito, checkout con Mercado Pago (Checkout Pro, API de Orders), webhook verificado en servidor,
entrega de e-books por enlace con vencimiento y envío por correo. Al terminar, `site.checkoutEnabled = true`
cambia los textos de compra en toda la web.
