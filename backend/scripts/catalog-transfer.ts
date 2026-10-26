// Exporta o importa el catálogo (productos, variantes, combos, fotos) como JSON.
// Sirve para pasar el catálogo de una base a otra (local → Railway) o como respaldo.
//   npm run catalog -- export catalogo.json
//   npm run catalog -- import catalogo.json
// Las fotos no van en el JSON: viven en el almacenamiento (mismas claves en el bucket).
// El stock no se copia: en la base de destino arranca en 0.
import { readFileSync, writeFileSync } from 'node:fs';
import { db, schema } from '../src/db';

const [mode, file] = process.argv.slice(2);
const tables = ['product', 'variant', 'bundle', 'bundleVariant', 'productImage'] as const;

if (mode === 'export' && file) {
  const data = Object.fromEntries(await Promise.all(tables.map(async (t) => [t, await db.select().from(schema[t])] as const)));
  data.variant = data.variant.map((v) => ({ ...v, stock: 0 }));
  writeFileSync(file, JSON.stringify(data));
  console.log(Object.entries(data).map(([t, rows]) => `${t}: ${rows.length}`).join(' · '));
} else if (mode === 'import' && file) {
  const data = JSON.parse(readFileSync(file, 'utf8')) as Record<(typeof tables)[number], Record<string, unknown>[]>;
  const dates = (r: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'string' && /At$/.test(k) ? new Date(v) : v]));
  await db.transaction(async (tx) => {
    // En orden de dependencias; lo que ya existe (mismo id) no se toca.
    for (const t of tables) {
      const rows = data[t].map(dates);
      if (rows.length) await tx.insert(schema[t]).values(rows as never).onConflictDoNothing();
      console.log(`${t}: ${rows.length}`);
    }
  });
} else {
  console.error('Uso: npm run catalog -- export|import <archivo.json>');
  process.exit(1);
}
process.exit(0);
