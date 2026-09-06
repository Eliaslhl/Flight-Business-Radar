CREATE TYPE "public"."availability" AS ENUM('AVAILABLE', 'LOW', 'WAITLIST', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."cabin_class" AS ENUM('ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST');--> statement-breakpoint
CREATE TYPE "public"."search_priority" AS ENUM('HIGH', 'MEDIUM', 'LOW');--> statement-breakpoint
CREATE TYPE "public"."search_status" AS ENUM('ACTIVE', 'PAUSED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."snapshot_status" AS ENUM('OBSERVED', 'CONFIRMED', 'EXPIRED', 'REJECTED');--> statement-breakpoint
CREATE TABLE "flight_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fingerprint" text NOT NULL,
	"origin" varchar(3) NOT NULL,
	"destination" varchar(3) NOT NULL,
	"cabin_class" "cabin_class" NOT NULL,
	"outbound_date" date NOT NULL,
	"return_date" date,
	"trip_days" integer,
	"marketing_airline" varchar(3),
	"max_stops" integer DEFAULT 0 NOT NULL,
	"payload" jsonb NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flight_offers_fingerprint_unique" UNIQUE("fingerprint")
);
--> statement-breakpoint
CREATE TABLE "offer_provider_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flight_offer_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_offer_id" text,
	"booking_url" text,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"flight_offer_id" uuid NOT NULL,
	"search_id" uuid,
	"provider" text NOT NULL,
	"price_cents" integer NOT NULL,
	"currency" varchar(3) NOT NULL,
	"price_eur_cents" integer,
	"availability" "availability" DEFAULT 'UNKNOWN' NOT NULL,
	"seats_remaining" integer,
	"status" "snapshot_status" DEFAULT 'OBSERVED' NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_date_combinations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"search_id" uuid NOT NULL,
	"outbound_date" date NOT NULL,
	"return_date" date,
	"trip_days" integer,
	"priority_score" double precision DEFAULT 0 NOT NULL,
	"last_checked_at" timestamp with time zone,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text,
	"origin" varchar(3) NOT NULL,
	"destinations" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"cabin_class" "cabin_class" DEFAULT 'BUSINESS' NOT NULL,
	"departure_window_start" date NOT NULL,
	"departure_window_end" date NOT NULL,
	"min_trip_days" integer NOT NULL,
	"max_trip_days" integer NOT NULL,
	"max_price_cents" integer,
	"target_price_cents" integer,
	"currency" varchar(3) DEFAULT 'EUR' NOT NULL,
	"max_stops" integer DEFAULT 1 NOT NULL,
	"preferred_airlines" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"excluded_airlines" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"status" "search_status" DEFAULT 'ACTIVE' NOT NULL,
	"priority" "search_priority" DEFAULT 'MEDIUM' NOT NULL,
	"interval_seconds" integer DEFAULT 1800 NOT NULL,
	"next_run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"preferred_currency" varchar(3) DEFAULT 'EUR' NOT NULL,
	"timezone" text DEFAULT 'Europe/Paris' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "offer_provider_links" ADD CONSTRAINT "offer_provider_links_flight_offer_id_flight_offers_id_fk" FOREIGN KEY ("flight_offer_id") REFERENCES "public"."flight_offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_snapshots" ADD CONSTRAINT "price_snapshots_flight_offer_id_flight_offers_id_fk" FOREIGN KEY ("flight_offer_id") REFERENCES "public"."flight_offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_snapshots" ADD CONSTRAINT "price_snapshots_search_id_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."searches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_date_combinations" ADD CONSTRAINT "search_date_combinations_search_id_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."searches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "searches" ADD CONSTRAINT "searches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "flight_offers_route_idx" ON "flight_offers" USING btree ("origin","destination","outbound_date");--> statement-breakpoint
CREATE UNIQUE INDEX "offer_provider_links_unique" ON "offer_provider_links" USING btree ("flight_offer_id","provider");--> statement-breakpoint
CREATE INDEX "price_snapshots_offer_observed_idx" ON "price_snapshots" USING btree ("flight_offer_id","observed_at");--> statement-breakpoint
CREATE INDEX "price_snapshots_search_observed_idx" ON "price_snapshots" USING btree ("search_id","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "search_date_combinations_unique" ON "search_date_combinations" USING btree ("search_id","outbound_date","return_date");--> statement-breakpoint
CREATE INDEX "search_date_combinations_pick_idx" ON "search_date_combinations" USING btree ("search_id","enabled","priority_score");--> statement-breakpoint
CREATE INDEX "searches_due_idx" ON "searches" USING btree ("status","next_run_at");--> statement-breakpoint
INSERT INTO "users" ("id", "email", "display_name") VALUES ('00000000-0000-0000-0000-000000000001', 'dev@localhost', 'Dev User') ON CONFLICT ("email") DO NOTHING;
