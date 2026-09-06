CREATE TYPE "public"."alert_type" AS ENUM('TARGET_PRICE', 'PRICE_DROP', 'FLASH_DROP', 'RECORD_LOW', 'UNUSUAL_PRICE');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('CONSOLE', 'EMAIL', 'TELEGRAM', 'DISCORD', 'PUSH');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('PENDING', 'SENT', 'FAILED', 'SUPPRESSED');--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"search_id" uuid NOT NULL,
	"type" "alert_type" NOT NULL,
	"threshold_eur_cents" integer,
	"enabled" boolean DEFAULT true NOT NULL,
	"cooldown_seconds" integer DEFAULT 3600 NOT NULL,
	"last_triggered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"search_id" uuid,
	"alert_id" uuid,
	"price_event_id" uuid,
	"channel" "notification_channel" NOT NULL,
	"status" "notification_status" DEFAULT 'PENDING' NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"payload" jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_search_id_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."searches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_search_id_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."searches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_price_event_id_price_events_id_fk" FOREIGN KEY ("price_event_id") REFERENCES "public"."price_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alerts_search_enabled_idx" ON "alerts" USING btree ("search_id","enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_channel_idx" ON "notifications" USING btree ("dedupe_key","channel");--> statement-breakpoint
CREATE INDEX "notifications_search_created_idx" ON "notifications" USING btree ("search_id","created_at");