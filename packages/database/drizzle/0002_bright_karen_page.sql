CREATE TYPE "public"."price_event_type" AS ENUM('DROP', 'FLASH_DROP', 'RISE', 'RECORD_LOW', 'RECORD_HIGH', 'TARGET_HIT', 'UNUSUAL');--> statement-breakpoint
CREATE TABLE "fx_rates" (
	"base" varchar(3) NOT NULL,
	"quote" varchar(3) NOT NULL,
	"rate" numeric(18, 8) NOT NULL,
	"as_of" date NOT NULL,
	"source" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fx_rates_base_quote_as_of_pk" PRIMARY KEY("base","quote","as_of")
);
--> statement-breakpoint
CREATE TABLE "price_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flight_offer_id" uuid NOT NULL,
	"search_id" uuid,
	"type" "price_event_type" NOT NULL,
	"previous_price_eur_cents" integer,
	"new_price_eur_cents" integer NOT NULL,
	"drop_amount_eur_cents" integer,
	"drop_pct" double precision,
	"previous_snapshot_id" bigint,
	"new_snapshot_id" bigint NOT NULL,
	"confirmed" boolean DEFAULT false NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"duration_seconds" integer
);
--> statement-breakpoint
ALTER TABLE "price_events" ADD CONSTRAINT "price_events_flight_offer_id_flight_offers_id_fk" FOREIGN KEY ("flight_offer_id") REFERENCES "public"."flight_offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_events" ADD CONSTRAINT "price_events_search_id_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."searches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "price_events_search_detected_idx" ON "price_events" USING btree ("search_id","detected_at");--> statement-breakpoint
CREATE INDEX "price_events_offer_detected_idx" ON "price_events" USING btree ("flight_offer_id","detected_at");--> statement-breakpoint
CREATE INDEX "price_events_open_idx" ON "price_events" USING btree ("flight_offer_id","type") WHERE "price_events"."resolved_at" is null;