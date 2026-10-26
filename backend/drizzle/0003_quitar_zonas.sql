ALTER TABLE "order" DROP CONSTRAINT IF EXISTS "order_zone_id_delivery_zone_id_fk";--> statement-breakpoint
ALTER TABLE "order" DROP COLUMN "zone_id";--> statement-breakpoint
ALTER TABLE "order" DROP COLUMN "zone_name";--> statement-breakpoint
DROP TABLE "delivery_zone";
