import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const bebidas = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/bebidas' }),
  schema: ({ image }) => {
    const photo = z.object({
      src: image(),
      alt: z.string(),
      // object-position para recortes (ej. "68% 50%")
      focus: z.string().default('50% 50%'),
      // `contain` para recortes con fondo transparente
      fit: z.enum(['cover', 'contain']).default('cover'),
    });
    return z.object({
      name: z.string(),
      line: z.enum(['flow', 'cold-coffee']),
      order: z.number(),
      // Frase corta del catálogo ("Acompaña tu hidratación.").
      headline: z.string(),
      // Descripción del catálogo ("Ligera y refrescante, a base de pitahaya, limón y sal.").
      description: z.string(),
      // Solo datos de la etiqueta.
      ingredients: z.array(z.string()).min(1),
      extras: z.array(z.string()).default([]),
      volume: z.string(),
      badges: z.array(z.string()).default([]),
      flavor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
      // Precio de la lata de 330 ml en pesos (catálogo agosto 2026).
      price: z.number().int().positive().optional(),
      available: z.boolean().default(true),
      // Imágenes con errores de etiqueta que deben regenerarse antes de publicar.
      provisionalImages: z.boolean().default(false),
      card: photo,
      hero: photo,
      cutout: photo.optional(),
      gallery: z.array(photo).default([]),
      seoDescription: z.string(),
    });
  },
});

const ebooks = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/ebooks' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      subtitle: z.string().optional(),
      // Los borradores solo se ven en desarrollo, nunca en el build.
      draft: z.boolean().default(false),
      order: z.number().default(99),
      cover: z.object({ src: image(), alt: z.string() }).optional(),
      // Colores de la portada tipográfica cuando no hay imagen.
      coverColor: z.string().default('#C5D1B0'),
      coverInk: z.string().default('#3F4B37'),
      pages: z.number().int().positive().optional(),
      format: z.string().default('PDF'),
      price: z.number().int().positive().optional(),
      summary: z.string(),
      includes: z.array(z.string()).default([]),
      toc: z.array(z.string()).default([]),
      samples: z.array(z.object({ src: image(), alt: z.string() })).default([]),
      faq: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
      // Clave del archivo en el almacenamiento privado (Fase 4). Nunca se renderiza.
      file: z.string().optional(),
    }),
});

export const collections = { bebidas, ebooks };
