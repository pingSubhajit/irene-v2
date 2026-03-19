CREATE TABLE "financial_event_valuation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"financial_event_id" uuid NOT NULL,
	"target_currency" text NOT NULL,
	"valuation_kind" text NOT NULL,
	"normalized_amount_minor" bigint NOT NULL,
	"fx_rate" numeric(18, 8),
	"fx_rate_date" date,
	"provider" text,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_event_valuation_kind_check" CHECK ("financial_event_valuation"."valuation_kind" in ('identity', 'historical_reference', 'settlement_confirmed')),
	CONSTRAINT "financial_event_valuation_target_currency_check" CHECK ("financial_event_valuation"."target_currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "financial_event_valuation_amount_minor_check" CHECK ("financial_event_valuation"."normalized_amount_minor" >= 0),
	CONSTRAINT "financial_event_valuation_provider_check" CHECK ("financial_event_valuation"."provider" IS NULL OR "financial_event_valuation"."provider" in ('currencyapi'))
);
--> statement-breakpoint
CREATE TABLE "fx_rate_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"base_currency" text NOT NULL,
	"quote_currency" text NOT NULL,
	"rate_date" date NOT NULL,
	"rate" numeric(18, 8) NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fx_rate_daily_provider_check" CHECK ("fx_rate_daily"."provider" in ('currencyapi')),
	CONSTRAINT "fx_rate_daily_base_currency_check" CHECK ("fx_rate_daily"."base_currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "fx_rate_daily_quote_currency_check" CHECK ("fx_rate_daily"."quote_currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "fx_rate_daily_rate_positive" CHECK ("fx_rate_daily"."rate" > 0)
);
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "reporting_currency" text DEFAULT 'INR' NOT NULL;--> statement-breakpoint
ALTER TABLE "financial_event_valuation" ADD CONSTRAINT "financial_event_valuation_financial_event_id_financial_event_id_fk" FOREIGN KEY ("financial_event_id") REFERENCES "public"."financial_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "financial_event_valuation_active_unique" ON "financial_event_valuation" USING btree ("financial_event_id","target_currency") WHERE "financial_event_valuation"."superseded_at" IS NULL;--> statement-breakpoint
CREATE INDEX "financial_event_valuation_target_currency_idx" ON "financial_event_valuation" USING btree ("target_currency","financial_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fx_rate_daily_provider_pair_date_unique" ON "fx_rate_daily" USING btree ("provider","base_currency","quote_currency","rate_date");--> statement-breakpoint
CREATE INDEX "fx_rate_daily_pair_date_idx" ON "fx_rate_daily" USING btree ("base_currency","quote_currency","rate_date");--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_reporting_currency_check" CHECK ("user_settings"."reporting_currency" ~ '^[A-Z]{3}$');