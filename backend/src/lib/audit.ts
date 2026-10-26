import { db, schema } from '../db';

type Entry = {
  userId?: string | null;
  action: string;
  entity?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
};

// Registro de auditoría: nunca debe tumbar la acción que lo origina.
export async function audit(entry: Entry): Promise<void> {
  try {
    await db.insert(schema.auditLog).values({ ...entry, ip: entry.ip ?? null });
  } catch (err) {
    console.error('audit_log', err instanceof Error ? err.message : err);
  }
}
