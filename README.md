# Blend — Atelier de Latte

Landing page for **Blend**, a soft luxury wellness brand from Armenia, Quindío.

Built in Astro with vanilla CSS. Implements the "Atelier de Latte" creative direction from the Claude Design handoff (`Santi Gallego - Blend`).

## Setup

```bash
npm install
npm run dev      # → http://localhost:4321
npm run build    # → dist/
npm run preview  # serves dist/ for QA
```

## Structure

```
src/
  components/   Nav, Hero, Products, Spotlight, Origin, Rituals,
                Instagram, Distributors, Footer
  data/         site.ts — single source of editable content
  layouts/      BaseLayout.astro — html shell + fonts + meta
  pages/        index.astro (homepage) · brand.astro (brand board)
  styles/       global.css — design system (palette, fonts, utilities)
public/
  favicon.svg · robots.txt
```

## Edit before launch

Open `src/data/site.ts` and update:

- `whatsapp` — real WhatsApp number (digits with country code, e.g. `573001234567`)
- `instagram` — handle URL
- `email` — contact mailbox
- `stockists` — current ya-stockists list

## Design source

The placeholders (striped diagonal `repeating-linear-gradient` blocks with monospace captions) are intentional — they're the handoff state for real photography. Replace them with `<img>` tags as photo shoots come in.

Palette, type, voice, and motion direction live in `/brand`.
