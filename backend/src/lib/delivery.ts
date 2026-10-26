// Domicilio: una tarifa fija para todo el Quindío, editable en el panel.
// Solo se entrega en los municipios del Quindío que estén activos.
import { eq } from 'drizzle-orm';
import { db, schema } from '../db';

export const QUINDIO = [
  'Armenia',
  'Buenavista',
  'Calarcá',
  'Circasia',
  'Córdoba',
  'Filandia',
  'Génova',
  'La Tebaida',
  'Montenegro',
  'Pijao',
  'Quimbaya',
  'Salento',
] as const;
export type Municipio = (typeof QUINDIO)[number];

export type DeliverySettings = {
  // null = sin configurar: no se pueden pagar bebidas hasta ponerle precio.
  fee: number | null;
  cities: Municipio[];
  note: string;
};

const DEFAULTS: DeliverySettings = { fee: null, cities: [...QUINDIO], note: '' };

export async function getDelivery(): Promise<DeliverySettings> {
  const row = await db.query.setting.findFirst({ where: eq(schema.setting.key, 'delivery') });
  const value = (row?.value ?? {}) as Partial<DeliverySettings>;
  return {
    fee: typeof value.fee === 'number' ? value.fee : DEFAULTS.fee,
    // Solo municipios válidos, en el orden de la lista oficial.
    cities: QUINDIO.filter((c) => (value.cities ?? DEFAULTS.cities).includes(c)),
    note: value.note ?? DEFAULTS.note,
  };
}

export async function saveDelivery(settings: DeliverySettings) {
  await db
    .insert(schema.setting)
    .values({ key: 'delivery', value: settings })
    .onConflictDoUpdate({ target: schema.setting.key, set: { value: settings, updatedAt: new Date() } });
}
