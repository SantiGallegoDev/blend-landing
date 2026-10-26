CREATE TYPE "public"."fulfillment_status" AS ENUM('not_required', 'pending', 'preparing', 'dispatched', 'delivered', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."image_role" AS ENUM('card', 'hero', 'cutout', 'gallery', 'cover', 'sample');--> statement-breakpoint
CREATE TYPE "public"."movement_reason" AS ENUM('restock', 'adjust', 'shrink', 'reserve', 'release', 'sale', 'return');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'processing', 'paid', 'failed', 'canceled', 'refunded', 'attention');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."product_type" AS ENUM('drink', 'ebook');--> statement-breakpoint
CREATE TYPE "public"."stock_state" AS ENUM('none', 'reserved', 'sold', 'released');--> statement-breakpoint
CREATE TABLE "bundle" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"size" integer NOT NULL,
	"price" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bundle_slug_unique" UNIQUE("slug"),
	CONSTRAINT "bundle_size_min" CHECK ("bundle"."size" > 1),
	CONSTRAINT "bundle_price_positive" CHECK ("bundle"."price" > 0)
);
--> statement-breakpoint
CREATE TABLE "bundle_variant" (
	"bundle_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	CONSTRAINT "bundle_variant_bundle_id_variant_id_pk" PRIMARY KEY("bundle_id","variant_id")
);
--> statement-breakpoint
CREATE TABLE "delivery_zone" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"fee" integer DEFAULT 0 NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "zone_fee_nonnegative" CHECK ("delivery_zone"."fee" >= 0)
);
--> statement-breakpoint
CREATE TABLE "download_grant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"product_id" uuid,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"max_downloads" integer NOT NULL,
	"downloads" integer DEFAULT 0 NOT NULL,
	"last_download_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "download_grant_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "email_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "email_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"order_id" uuid,
	"kind" text NOT NULL,
	"to" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "inventory_movement" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "inventory_movement_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"variant_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"stock_after" integer NOT NULL,
	"reason" "movement_reason" NOT NULL,
	"note" text,
	"order_id" uuid,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" bigint GENERATED ALWAYS AS IDENTITY (sequence name "order_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1001 CACHE 1),
	"public_token_hash" text NOT NULL,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"fulfillment" "fulfillment_status" DEFAULT 'not_required' NOT NULL,
	"mp_order_id" text,
	"mp_status" text,
	"mp_status_detail" text,
	"subtotal" integer NOT NULL,
	"delivery_fee" integer DEFAULT 0 NOT NULL,
	"total" integer NOT NULL,
	"customer_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"zone_id" uuid,
	"zone_name" text,
	"address" text,
	"delivery_notes" text,
	"internal_notes" text DEFAULT '' NOT NULL,
	"has_physical" boolean NOT NULL,
	"has_digital" boolean NOT NULL,
	"stock_lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"stock_state" "stock_state" DEFAULT 'none' NOT NULL,
	"reserved_until" timestamp with time zone,
	"consent_at" timestamp with time zone NOT NULL,
	"consent_ip" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_number_unique" UNIQUE("number"),
	CONSTRAINT "order_mp_order_id_unique" UNIQUE("mp_order_id")
);
--> statement-breakpoint
CREATE TABLE "order_event" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "order_event_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"order_id" uuid NOT NULL,
	"type" text NOT NULL,
	"message" text NOT NULL,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid,
	"variant_id" uuid,
	"bundle_id" uuid,
	"name" text NOT NULL,
	"variant_name" text,
	"bundle_contents" jsonb,
	"is_digital" boolean DEFAULT false NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" integer NOT NULL,
	"total" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"type" "product_type" NOT NULL,
	"status" "product_status" DEFAULT 'draft' NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"headline" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"seo_description" text DEFAULT '' NOT NULL,
	"line" text,
	"volume" text,
	"flavor_color" text,
	"ingredients" text[] DEFAULT '{}' NOT NULL,
	"extras" text[] DEFAULT '{}' NOT NULL,
	"badges" text[] DEFAULT '{}' NOT NULL,
	"provisional_images" boolean DEFAULT false NOT NULL,
	"subtitle" text,
	"pages" integer,
	"format" text,
	"summary" text,
	"includes" text[] DEFAULT '{}' NOT NULL,
	"toc" text[] DEFAULT '{}' NOT NULL,
	"faq" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cover_color" text,
	"cover_ink" text,
	"file_key" text,
	"file_name" text,
	"file_size" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "product_image" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"role" "image_role" DEFAULT 'gallery' NOT NULL,
	"key" text NOT NULL,
	"alt" text DEFAULT '' NOT NULL,
	"focus" text DEFAULT '50% 50%' NOT NULL,
	"fit" text DEFAULT 'cover' NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "setting" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "variant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sku" text,
	"price" integer NOT NULL,
	"track_stock" boolean DEFAULT true NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"low_stock" integer DEFAULT 5 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "variant_sku_unique" UNIQUE("sku"),
	CONSTRAINT "variant_stock_nonnegative" CHECK ("variant"."stock" >= 0),
	CONSTRAINT "variant_price_positive" CHECK ("variant"."price" > 0)
);
--> statement-breakpoint
CREATE TABLE "webhook_event" (
	"id" text PRIMARY KEY NOT NULL,
	"topic" text NOT NULL,
	"data_id" text,
	"signature_valid" boolean,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "bundle_variant" ADD CONSTRAINT "bundle_variant_bundle_id_bundle_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."bundle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bundle_variant" ADD CONSTRAINT "bundle_variant_variant_id_variant_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "download_grant" ADD CONSTRAINT "download_grant_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "download_grant" ADD CONSTRAINT "download_grant_order_item_id_order_item_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "download_grant" ADD CONSTRAINT "download_grant_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_variant_id_variant_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_zone_id_delivery_zone_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."delivery_zone"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_event" ADD CONSTRAINT "order_event_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_event" ADD CONSTRAINT "order_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_variant_id_variant_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_bundle_id_bundle_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."bundle"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_image" ADD CONSTRAINT "product_image_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant" ADD CONSTRAINT "variant_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "grant_order_idx" ON "download_grant" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "email_status_idx" ON "email_log" USING btree ("status");--> statement-breakpoint
CREATE INDEX "movement_variant_idx" ON "inventory_movement" USING btree ("variant_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "order_status_idx" ON "order" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "order_email_idx" ON "order" USING btree ("email");--> statement-breakpoint
CREATE INDEX "order_event_order_idx" ON "order_event" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "order_item_order_idx" ON "order_item" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "product_image_product_idx" ON "product_image" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "variant_product_idx" ON "variant" USING btree ("product_id");