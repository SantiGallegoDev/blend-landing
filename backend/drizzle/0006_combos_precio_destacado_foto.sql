CREATE TYPE "public"."bundle_pricing" AS ENUM('fixed', 'per_item');--> statement-breakpoint
ALTER TABLE "bundle" ADD COLUMN "pricing" "bundle_pricing" DEFAULT 'fixed' NOT NULL;--> statement-breakpoint
ALTER TABLE "bundle" ADD COLUMN "featured" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bundle" ADD COLUMN "image_key" text;--> statement-breakpoint
ALTER TABLE "bundle" ADD COLUMN "image_width" integer;--> statement-breakpoint
ALTER TABLE "bundle" ADD COLUMN "image_height" integer;--> statement-breakpoint
ALTER TABLE "bundle" ADD COLUMN "image_alt" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "bundle" ADD COLUMN "image_focus" text DEFAULT '50% 50%' NOT NULL;--> statement-breakpoint
ALTER TABLE "bundle_variant" ADD COLUMN "unit_price" integer;--> statement-breakpoint
ALTER TABLE "bundle_variant" ADD CONSTRAINT "bundle_variant_unit_price_positive" CHECK ("bundle_variant"."unit_price" is null or "bundle_variant"."unit_price" > 0);