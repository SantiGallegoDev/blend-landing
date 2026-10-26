// Aplica las migraciones de ./drizzle. Railway lo corre antes de arrancar (preDeployCommand).
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { env } from '../src/env';

const client = postgres(env.DATABASE_URL, { max: 1 });
await migrate(drizzle(client), { migrationsFolder: './drizzle' });
await client.end();
console.log('Migraciones aplicadas.');
