CREATE TABLE "balance_anchor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"payment_instrument_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"anchored_at" timestamp with time zone NOT NULL,
	"source_observation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "balance_anchor_amount_check" CHECK ("balance_anchor"."amount_minor" >= 0),
	CONSTRAINT "balance_anchor_currency_check" CHECK ("balance_anchor"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "balance_observation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"payment_instrument_id" uuid NOT NULL,
	"observation_kind" text NOT NULL,
	"source" text DEFAULT 'email' NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"raw_document_id" uuid,
	"extracted_signal_id" uuid,
	"confidence" numeric(5, 4) DEFAULT 0.5 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "balance_observation_kind_check" CHECK ("balance_observation"."observation_kind" in ('available_balance', 'available_credit_limit')),
	CONSTRAINT "balance_observation_source_check" CHECK ("balance_observation"."source" in ('email', 'manual')),
	CONSTRAINT "balance_observation_confidence_check" CHECK ("balance_observation"."confidence" >= 0 AND "balance_observation"."confidence" <= 1),
	CONSTRAINT "balance_observation_amount_check" CHECK ("balance_observation"."amount_minor" >= 0),
	CONSTRAINT "balance_observation_currency_check" CHECK ("balance_observation"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "balance_observation_reference_check" CHECK ("balance_observation"."raw_document_id" IS NOT NULL OR "balance_observation"."extracted_signal_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "forecast_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"run_type" text NOT NULL,
	"horizon_days" integer NOT NULL,
	"baseline_date" date NOT NULL,
	"status" text NOT NULL,
	"inputs_hash" text NOT NULL,
	"explanation" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "forecast_run_type_check" CHECK ("forecast_run"."run_type" in ('anchored', 'net_only')),
	CONSTRAINT "forecast_run_status_check" CHECK ("forecast_run"."status" in ('queued', 'running', 'succeeded', 'failed')),
	CONSTRAINT "forecast_run_horizon_positive" CHECK ("forecast_run"."horizon_days" > 0)
);
--> statement-breakpoint
CREATE TABLE "forecast_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"forecast_run_id" uuid NOT NULL,
	"snapshot_date" date NOT NULL,
	"projected_balance_minor" bigint,
	"projected_income_minor" bigint DEFAULT 0 NOT NULL,
	"projected_fixed_outflow_minor" bigint DEFAULT 0 NOT NULL,
	"projected_variable_outflow_minor" bigint DEFAULT 0 NOT NULL,
	"projected_emi_outflow_minor" bigint DEFAULT 0 NOT NULL,
	"safe_to_spend_minor" bigint,
	"confidence_band_low_minor" bigint,
	"confidence_band_high_minor" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "extracted_signal" ADD COLUMN "available_balance_minor" bigint;--> statement-breakpoint
ALTER TABLE "extracted_signal" ADD COLUMN "available_credit_limit_minor" bigint;--> statement-breakpoint
ALTER TABLE "extracted_signal" ADD COLUMN "balance_as_of_date" date;--> statement-breakpoint
ALTER TABLE "extracted_signal" ADD COLUMN "balance_instrument_last4_hint" text;--> statement-breakpoint
ALTER TABLE "income_stream" ADD COLUMN "cadence" text DEFAULT 'monthly' NOT NULL;--> statement-breakpoint
ALTER TABLE "income_stream" ADD COLUMN "interval_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "income_stream" ADD COLUMN "secondary_day_of_month" integer;--> statement-breakpoint
ALTER TABLE "payment_instrument" ADD COLUMN "backing_payment_instrument_id" uuid;--> statement-breakpoint
ALTER TABLE "balance_anchor" ADD CONSTRAINT "balance_anchor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "balance_anchor" ADD CONSTRAINT "balance_anchor_payment_instrument_id_payment_instrument_id_fk" FOREIGN KEY ("payment_instrument_id") REFERENCES "public"."payment_instrument"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "balance_anchor" ADD CONSTRAINT "balance_anchor_source_observation_id_balance_observation_id_fk" FOREIGN KEY ("source_observation_id") REFERENCES "public"."balance_observation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "balance_observation" ADD CONSTRAINT "balance_observation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "balance_observation" ADD CONSTRAINT "balance_observation_payment_instrument_id_payment_instrument_id_fk" FOREIGN KEY ("payment_instrument_id") REFERENCES "public"."payment_instrument"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "balance_observation" ADD CONSTRAINT "balance_observation_raw_document_id_raw_document_id_fk" FOREIGN KEY ("raw_document_id") REFERENCES "public"."raw_document"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "balance_observation" ADD CONSTRAINT "balance_observation_extracted_signal_id_extracted_signal_id_fk" FOREIGN KEY ("extracted_signal_id") REFERENCES "public"."extracted_signal"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecast_run" ADD CONSTRAINT "forecast_run_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecast_snapshot" ADD CONSTRAINT "forecast_snapshot_forecast_run_id_forecast_run_id_fk" FOREIGN KEY ("forecast_run_id") REFERENCES "public"."forecast_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "balance_anchor_user_instrument_unique" ON "balance_anchor" USING btree ("user_id","payment_instrument_id");--> statement-breakpoint
CREATE INDEX "balance_anchor_user_anchored_at_idx" ON "balance_anchor" USING btree ("user_id","anchored_at");--> statement-breakpoint
CREATE INDEX "balance_observation_user_instrument_observed_at_idx" ON "balance_observation" USING btree ("user_id","payment_instrument_id","observed_at");--> statement-breakpoint
CREATE INDEX "forecast_run_user_created_at_idx" ON "forecast_run" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "forecast_run_user_status_created_at_idx" ON "forecast_run" USING btree ("user_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "forecast_run_user_run_type_baseline_hash_unique" ON "forecast_run" USING btree ("user_id","run_type","baseline_date","inputs_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "forecast_snapshot_run_date_unique" ON "forecast_snapshot" USING btree ("forecast_run_id","snapshot_date");--> statement-breakpoint
CREATE INDEX "forecast_snapshot_date_idx" ON "forecast_snapshot" USING btree ("snapshot_date");--> statement-breakpoint
ALTER TABLE "payment_instrument" ADD CONSTRAINT "payment_instrument_backing_payment_instrument_id_payment_instrument_id_fk" FOREIGN KEY ("backing_payment_instrument_id") REFERENCES "public"."payment_instrument"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_instrument_backing_instrument_idx" ON "payment_instrument" USING btree ("backing_payment_instrument_id");--> statement-breakpoint
ALTER TABLE "extracted_signal" ADD CONSTRAINT "extracted_signal_available_balance_minor_check" CHECK ("extracted_signal"."available_balance_minor" IS NULL OR "extracted_signal"."available_balance_minor" >= 0);--> statement-breakpoint
ALTER TABLE "extracted_signal" ADD CONSTRAINT "extracted_signal_available_credit_limit_minor_check" CHECK ("extracted_signal"."available_credit_limit_minor" IS NULL OR "extracted_signal"."available_credit_limit_minor" >= 0);--> statement-breakpoint
ALTER TABLE "income_stream" ADD CONSTRAINT "income_stream_secondary_day_of_month_check" CHECK ("income_stream"."secondary_day_of_month" IS NULL OR "income_stream"."secondary_day_of_month" BETWEEN 1 AND 31);--> statement-breakpoint
ALTER TABLE "income_stream" ADD CONSTRAINT "income_stream_cadence_check" CHECK ("income_stream"."cadence" in ('weekly', 'monthly', 'quarterly', 'yearly', 'irregular'));--> statement-breakpoint
ALTER TABLE "income_stream" ADD CONSTRAINT "income_stream_interval_count_check" CHECK ("income_stream"."interval_count" > 0);--> statement-breakpoint
ALTER TABLE "payment_instrument" ADD CONSTRAINT "payment_instrument_backing_payment_instrument_self_check" CHECK ("payment_instrument"."backing_payment_instrument_id" IS NULL OR "payment_instrument"."backing_payment_instrument_id" <> "payment_instrument"."id");