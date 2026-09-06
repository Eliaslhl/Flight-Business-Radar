CREATE TABLE "provider_requests" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"search_id" uuid,
	"ok" boolean NOT NULL,
	"offer_count" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "provider_requests" ADD CONSTRAINT "provider_requests_search_id_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."searches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "provider_requests_provider_created_idx" ON "provider_requests" USING btree ("provider","created_at");--> statement-breakpoint
CREATE INDEX "provider_requests_search_created_idx" ON "provider_requests" USING btree ("search_id","created_at");