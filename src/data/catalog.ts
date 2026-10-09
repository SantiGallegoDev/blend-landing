import { getCollection, type CollectionEntry } from 'astro:content';

export type Ebook = CollectionEntry<'ebooks'>;

// En desarrollo se muestran los borradores (con aviso); en el build, nunca.
export async function getEbooks(): Promise<Ebook[]> {
  const all = await getCollection('ebooks', ({ data }) => import.meta.env.DEV || !data.draft);
  return all.sort((a, b) => a.data.order - b.data.order);
}

export async function getDrinks() {
  const all = await getCollection('bebidas');
  return all.sort((a, b) => a.data.order - b.data.order);
}
