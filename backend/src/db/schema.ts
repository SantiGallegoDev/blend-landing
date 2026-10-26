// Esquema de Postgres. Las claves de cada tabla de Better Auth siguen sus nombres de campo
// (camelCase en TypeScript, snake_case en la base de datos).
import { sql } from 'drizzle-orm';
import {
  pgTable, pgEnum, text, boolean, timestamp, integer, bigint, jsonb, index, uniqueIndex, uuid, primaryKey, check,
} from 'drizzle-orm/pg-core';

const created = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updated = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const roleEnum = pgEnum('role', ['owner', 'admin', 'operador']);

// ── Better Auth ────────────────────────────────────────────────────────────

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  role: roleEnum('role').notNull().default('operador'),
  // Usuario revocado: no puede iniciar sesión, pero se conserva para la auditoría.
  disabled: boolean('disabled').notNull().default(false),
  twoFactorEnabled: boolean('two_factor_enabled').default(false),
  createdAt: created(),
  updatedAt: updated(),
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: created(),
  updatedAt: updated(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
}, (t) => [index('session_user_idx').on(t.userId)]);

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: created(),
  updatedAt: updated(),
}, (t) => [index('account_user_idx').on(t.userId)]);

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: created(),
  updatedAt: updated(),
}, (t) => [index('verification_identifier_idx').on(t.identifier)]);

export const twoFactor = pgTable('two_factor', {
  id: text('id').primaryKey(),
  secret: text('secret').notNull(),
  backupCodes: text('backup_codes').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  verified: boolean('verified').default(true),
  failedVerificationCount: integer('failed_verification_count').default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
}, (t) => [index('two_factor_user_idx').on(t.userId), index('two_factor_secret_idx').on(t.secret)]);

export const passkey = pgTable('passkey', {
  id: text('id').primaryKey(),
  name: text('name'),
  publicKey: text('public_key').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  credentialID: text('credential_id').notNull(),
  counter: integer('counter').notNull(),
  deviceType: text('device_type').notNull(),
  backedUp: boolean('backed_up').notNull(),
  transports: text('transports'),
  createdAt: timestamp('created_at', { withTimezone: true }),
  aaguid: text('aaguid'),
}, (t) => [index('passkey_user_idx').on(t.userId), index('passkey_credential_idx').on(t.credentialID)]);

export const rateLimit = pgTable('rate_limit', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
});

// ── Acceso al panel ────────────────────────────────────────────────────────

// Bloqueo progresivo por cuenta tras contraseñas fallidas (Better Auth solo limita por IP).
export const loginGuard = pgTable('login_guard', {
  email: text('email').primaryKey(),
  failures: integer('failures').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  updatedAt: updated(),
});

export const invitation = pgTable('invitation', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  role: roleEnum('role').notNull(),
  // Solo se guarda el hash del token; el enlace en claro viaja una vez por correo.
  tokenHash: text('token_hash').notNull().unique(),
  invitedBy: text('invited_by').notNull().references(() => user.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: created(),
}, (t) => [index('invitation_email_idx').on(t.email)]);

// Dispositivos conocidos por usuario, para avisar de inicios de sesión nuevos.
export const knownDevice = pgTable('known_device', {
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  fingerprint: text('fingerprint').notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('known_device_pk').on(t.userId, t.fingerprint)]);

export const auditLog = pgTable('audit_log', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  entity: text('entity'),
  entityId: text('entity_id'),
  before: jsonb('before'),
  after: jsonb('after'),
  ip: text('ip'),
  createdAt: created(),
}, (t) => [
  index('audit_created_idx').on(t.createdAt.desc()),
  index('audit_entity_idx').on(t.entity, t.entityId),
]);

// ── Catálogo ───────────────────────────────────────────────────────────────

export const productTypeEnum = pgEnum('product_type', ['drink', 'ebook']);
export const productStatusEnum = pgEnum('product_status', ['draft', 'active', 'archived']);
export const imageRoleEnum = pgEnum('image_role', ['card', 'hero', 'cutout', 'gallery', 'cover', 'sample']);

// Un solo registro por producto; los campos de bebida o de e-book quedan vacíos en el otro tipo.
export const product = pgTable('product', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  type: productTypeEnum('type').notNull(),
  status: productStatusEnum('status').notNull().default('draft'),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  headline: text('headline').notNull().default(''),
  description: text('description').notNull().default(''),
  seoDescription: text('seo_description').notNull().default(''),
  // Bebidas
  line: text('line'),
  volume: text('volume'),
  flavorColor: text('flavor_color'),
  ingredients: text('ingredients').array().notNull().default(sql`'{}'`),
  extras: text('extras').array().notNull().default(sql`'{}'`),
  badges: text('badges').array().notNull().default(sql`'{}'`),
  // Fotos con errores de etiqueta: la web las marca como provisionales.
  provisionalImages: boolean('provisional_images').notNull().default(false),
  // E-books
  subtitle: text('subtitle'),
  pages: integer('pages'),
  format: text('format'),
  summary: text('summary'),
  includes: text('includes').array().notNull().default(sql`'{}'`),
  toc: text('toc').array().notNull().default(sql`'{}'`),
  faq: jsonb('faq').$type<{ q: string; a: string }[]>().notNull().default([]),
  coverColor: text('cover_color'),
  coverInk: text('cover_ink'),
  // Archivo privado del e-book en el bucket. Nunca sale por la API pública.
  fileKey: text('file_key'),
  fileName: text('file_name'),
  fileSize: integer('file_size'),
  createdAt: created(),
  updatedAt: updated(),
});

// Lo que se vende y se cobra: cada producto tiene una o más variantes con su precio y su stock.
export const variant = pgTable('variant', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').notNull().references(() => product.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sku: text('sku').unique(),
  price: integer('price').notNull(),
  trackStock: boolean('track_stock').notNull().default(true),
  // Unidades disponibles para vender (ya descuenta las reservas de checkouts en curso).
  stock: integer('stock').notNull().default(0),
  lowStock: integer('low_stock').notNull().default(5),
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: created(),
  updatedAt: updated(),
}, (t) => [
  index('variant_product_idx').on(t.productId),
  check('variant_stock_nonnegative', sql`${t.stock} >= 0`),
  check('variant_price_positive', sql`${t.price} > 0`),
]);

// Combos que arma el cliente (six pack): precio fijo, N unidades de las variantes elegibles.
export const bundle = pgTable('bundle', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  size: integer('size').notNull(),
  price: integer('price').notNull(),
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: created(),
  updatedAt: updated(),
}, (t) => [check('bundle_size_min', sql`${t.size} > 1`), check('bundle_price_positive', sql`${t.price} > 0`)]);

export const bundleVariant = pgTable('bundle_variant', {
  bundleId: uuid('bundle_id').notNull().references(() => bundle.id, { onDelete: 'cascade' }),
  variantId: uuid('variant_id').notNull().references(() => variant.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.bundleId, t.variantId] })]);

export const productImage = pgTable('product_image', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').notNull().references(() => product.id, { onDelete: 'cascade' }),
  role: imageRoleEnum('role').notNull().default('gallery'),
  key: text('key').notNull(),
  alt: text('alt').notNull().default(''),
  focus: text('focus').notNull().default('50% 50%'),
  fit: text('fit').notNull().default('cover'),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: created(),
}, (t) => [index('product_image_product_idx').on(t.productId)]);

export const movementReasonEnum = pgEnum('movement_reason', ['restock', 'adjust', 'shrink', 'reserve', 'release', 'sale', 'return']);

// Cada cambio de stock queda aquí: es la auditoría del inventario.
export const inventoryMovement = pgTable('inventory_movement', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  variantId: uuid('variant_id').notNull().references(() => variant.id, { onDelete: 'cascade' }),
  delta: integer('delta').notNull(),
  stockAfter: integer('stock_after').notNull(),
  reason: movementReasonEnum('reason').notNull(),
  note: text('note'),
  orderId: uuid('order_id'),
  userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
  createdAt: created(),
}, (t) => [index('movement_variant_idx').on(t.variantId, t.createdAt.desc())]);

// Ajustes sueltos: estado de publicación de la web, domicilio, etc.
export const setting = pgTable('setting', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: updated(),
});

// ── Pedidos y pagos ────────────────────────────────────────────────────────

export const orderStatusEnum = pgEnum('order_status', ['pending', 'processing', 'paid', 'failed', 'canceled', 'refunded', 'attention']);
export const fulfillmentEnum = pgEnum('fulfillment_status', ['not_required', 'pending', 'preparing', 'dispatched', 'delivered', 'canceled']);
export const stockStateEnum = pgEnum('stock_state', ['none', 'reserved', 'sold', 'released']);

export const order = pgTable('order', {
  id: uuid('id').primaryKey().defaultRandom(),
  number: bigint('number', { mode: 'number' }).generatedAlwaysAsIdentity({ startWith: 1001 }).unique(),
  // Hash del token que permite consultar el pedido desde la web sin iniciar sesión.
  publicTokenHash: text('public_token_hash').notNull(),
  status: orderStatusEnum('status').notNull().default('pending'),
  fulfillment: fulfillmentEnum('fulfillment').notNull().default('not_required'),
  mpOrderId: text('mp_order_id').unique(),
  mpStatus: text('mp_status'),
  mpStatusDetail: text('mp_status_detail'),
  subtotal: integer('subtotal').notNull(),
  deliveryFee: integer('delivery_fee').notNull().default(0),
  total: integer('total').notNull(),
  customerName: text('customer_name').notNull(),
  email: text('email').notNull(),
  phone: text('phone').notNull(),
  // Municipio del Quindío donde se entrega.
  city: text('city'),
  address: text('address'),
  deliveryNotes: text('delivery_notes'),
  internalNotes: text('internal_notes').notNull().default(''),
  hasPhysical: boolean('has_physical').notNull(),
  hasDigital: boolean('has_digital').notNull(),
  // Unidades que este pedido reservó, por variante, para liberarlas o venderlas después.
  stockLines: jsonb('stock_lines').$type<{ variantId: string; qty: number }[]>().notNull().default([]),
  stockState: stockStateEnum('stock_state').notNull().default('none'),
  reservedUntil: timestamp('reserved_until', { withTimezone: true }),
  consentAt: timestamp('consent_at', { withTimezone: true }).notNull(),
  consentIp: text('consent_ip'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  createdAt: created(),
  updatedAt: updated(),
}, (t) => [
  index('order_status_idx').on(t.status, t.createdAt.desc()),
  index('order_email_idx').on(t.email),
]);

export const orderItem = pgTable('order_item', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull().references(() => order.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').references(() => product.id, { onDelete: 'set null' }),
  variantId: uuid('variant_id').references(() => variant.id, { onDelete: 'set null' }),
  bundleId: uuid('bundle_id').references(() => bundle.id, { onDelete: 'set null' }),
  // Copia de lo que se vendió: el pedido no cambia si después se edita el catálogo.
  name: text('name').notNull(),
  variantName: text('variant_name'),
  bundleContents: jsonb('bundle_contents').$type<{ variantId: string; name: string; qty: number }[]>(),
  isDigital: boolean('is_digital').notNull().default(false),
  quantity: integer('quantity').notNull(),
  unitPrice: integer('unit_price').notNull(),
  total: integer('total').notNull(),
}, (t) => [index('order_item_order_idx').on(t.orderId)]);

export const orderEvent = pgTable('order_event', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  orderId: uuid('order_id').notNull().references(() => order.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  message: text('message').notNull(),
  userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
  createdAt: created(),
}, (t) => [index('order_event_order_idx').on(t.orderId, t.createdAt)]);

export const downloadGrant = pgTable('download_grant', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull().references(() => order.id, { onDelete: 'cascade' }),
  orderItemId: uuid('order_item_id').notNull().references(() => orderItem.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').references(() => product.id, { onDelete: 'set null' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  maxDownloads: integer('max_downloads').notNull(),
  downloads: integer('downloads').notNull().default(0),
  lastDownloadAt: timestamp('last_download_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: created(),
}, (t) => [index('grant_order_idx').on(t.orderId)]);

export const webhookEvent = pgTable('webhook_event', {
  id: text('id').primaryKey(),
  topic: text('topic').notNull(),
  dataId: text('data_id'),
  signatureValid: boolean('signature_valid'),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  error: text('error'),
});

export const emailLog = pgTable('email_log', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  orderId: uuid('order_id').references(() => order.id, { onDelete: 'set null' }),
  kind: text('kind').notNull(),
  to: text('to').notNull(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  html: text('html'),
  status: text('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  error: text('error'),
  createdAt: created(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
}, (t) => [index('email_status_idx').on(t.status)]);

// ── Alertas por Telegram ───────────────────────────────────────────────────

// Chats (grupos, personas o canales) que reciben los avisos del bot.
export const telegramChat = pgTable('telegram_chat', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Id del chat en Telegram. Cambia si un grupo pasa a supergrupo.
  chatId: text('chat_id').notNull().unique(),
  title: text('title').notNull(),
  // private | group | supergroup | channel
  type: text('type').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  addedBy: text('added_by').references(() => user.id, { onDelete: 'set null' }),
  lastSentAt: timestamp('last_sent_at', { withTimezone: true }),
  lastError: text('last_error'),
  createdAt: created(),
  updatedAt: updated(),
});

// Códigos de un solo uso para vincular un chat desde el panel. Solo se guarda el hash.
export const telegramLink = pgTable('telegram_link', {
  codeHash: text('code_hash').primaryKey(),
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  chatId: text('chat_id'),
  createdAt: created(),
});

// Avisos por enviar, con reintentos (como email_log).
export const telegramMessage = pgTable('telegram_message', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  chatRef: uuid('chat_ref').notNull().references(() => telegramChat.id, { onDelete: 'cascade' }),
  orderId: uuid('order_id').references(() => order.id, { onDelete: 'set null' }),
  kind: text('kind').notNull(),
  text: text('text').notNull(),
  status: text('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  error: text('error'),
  createdAt: created(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
}, (t) => [index('telegram_message_status_idx').on(t.status)]);

export type Role = (typeof roleEnum.enumValues)[number];
export const roles = roleEnum.enumValues;
export type ProductType = (typeof productTypeEnum.enumValues)[number];
export type ImageRole = (typeof imageRoleEnum.enumValues)[number];
export const imageRoles = imageRoleEnum.enumValues;
export type OrderStatus = (typeof orderStatusEnum.enumValues)[number];
export type Fulfillment = (typeof fulfillmentEnum.enumValues)[number];
export type MovementReason = (typeof movementReasonEnum.enumValues)[number];
