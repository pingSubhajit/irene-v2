CREATE TABLE "emi_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"recurring_obligation_id" uuid NOT NULL,
	"merchant_id" uuid,
	"payment_instrument_id" uuid,
	"principal_minor" bigint,
	"installment_amount_minor" bigint,
	"currency" text,
	"tenure_months" integer,
	"installments_paid" integer DEFAULT 0 NOT NULL,
	"interest_rate_bps" integer,
	"start_date" date,
	"end_date" date,
	"next_due_at" timestamp with time zone,
	"status" text DEFAULT 'suspected' NOT NULL,
	"confidence" numeric(5, 4) DEFAULT 0.5 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "emi_plan_status_check" CHECK ("emi_plan"."status" in ('suspected', 'active', 'completed', 'cancelled')),
	CONSTRAINT "emi_plan_installments_paid_check" CHECK ("emi_plan"."installments_paid" >= 0),
	CONSTRAINT "emi_plan_tenure_months_check" CHECK ("emi_plan"."tenure_months" IS NULL OR "emi_plan"."tenure_months" > 0),
	CONSTRAINT "emi_plan_interest_rate_bps_check" CHECK ("emi_plan"."interest_rate_bps" IS NULL OR "emi_plan"."interest_rate_bps" >= 0),
	CONSTRAINT "emi_plan_confidence_check" CHECK ("emi_plan"."confidence" >= 0 AND "emi_plan"."confidence" <= 1),
	CONSTRAINT "emi_plan_currency_check" CHECK ("emi_plan"."currency" IS NULL OR "emi_plan"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "income_stream" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"income_type" text NOT NULL,
	"source_merchant_id" uuid,
	"payment_instrument_id" uuid,
	"expected_amount_minor" bigint,
	"currency" text,
	"expected_day_of_month" integer,
	"variability_score" numeric(5, 4) DEFAULT 0 NOT NULL,
	"last_received_at" timestamp with time zone,
	"next_expected_at" timestamp with time zone,
	"confidence" numeric(5, 4) DEFAULT 0.5 NOT NULL,
	"status" text DEFAULT 'suspected' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "income_stream_type_check" CHECK ("income_stream"."income_type" in ('salary', 'freelance', 'reimbursement', 'transfer_in', 'other')),
	CONSTRAINT "income_stream_status_check" CHECK ("income_stream"."status" in ('suspected', 'active', 'inactive')),
	CONSTRAINT "income_stream_expected_day_of_month_check" CHECK ("income_stream"."expected_day_of_month" IS NULL OR "income_stream"."expected_day_of_month" BETWEEN 1 AND 31),
	CONSTRAINT "income_stream_variability_score_check" CHECK ("income_stream"."variability_score" >= 0 AND "income_stream"."variability_score" <= 1),
	CONSTRAINT "income_stream_confidence_check" CHECK ("income_stream"."confidence" >= 0 AND "income_stream"."confidence" <= 1),
	CONSTRAINT "income_stream_currency_check" CHECK ("income_stream"."currency" IS NULL OR "income_stream"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "recurring_obligation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"obligation_type" text NOT NULL,
	"status" text DEFAULT 'suspected' NOT NULL,
	"merchant_id" uuid,
	"payment_instrument_id" uuid,
	"category_id" uuid,
	"name" text NOT NULL,
	"amount_minor" bigint,
	"currency" text,
	"cadence" text NOT NULL,
	"interval_count" integer DEFAULT 1 NOT NULL,
	"day_of_month" integer,
	"next_due_at" timestamp with time zone,
	"last_charged_at" timestamp with time zone,
	"detection_confidence" numeric(5, 4) DEFAULT 0.5 NOT NULL,
	"source_event_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_obligation_type_check" CHECK ("recurring_obligation"."obligation_type" in ('subscription', 'bill', 'emi')),
	CONSTRAINT "recurring_obligation_status_check" CHECK ("recurring_obligation"."status" in ('suspected', 'active', 'paused', 'closed')),
	CONSTRAINT "recurring_obligation_cadence_check" CHECK ("recurring_obligation"."cadence" in ('weekly', 'monthly', 'quarterly', 'yearly', 'irregular')),
	CONSTRAINT "recurring_obligation_interval_count_check" CHECK ("recurring_obligation"."interval_count" > 0),
	CONSTRAINT "recurring_obligation_day_of_month_check" CHECK ("recurring_obligation"."day_of_month" IS NULL OR "recurring_obligation"."day_of_month" BETWEEN 1 AND 31),
	CONSTRAINT "recurring_obligation_detection_confidence_check" CHECK ("recurring_obligation"."detection_confidence" >= 0 AND "recurring_obligation"."detection_confidence" <= 1),
	CONSTRAINT "recurring_obligation_currency_check" CHECK ("recurring_obligation"."currency" IS NULL OR "recurring_obligation"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "review_queue_item" DROP CONSTRAINT "review_queue_item_type_check";--> statement-breakpoint
ALTER TABLE "emi_plan" ADD CONSTRAINT "emi_plan_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emi_plan" ADD CONSTRAINT "emi_plan_recurring_obligation_id_recurring_obligation_id_fk" FOREIGN KEY ("recurring_obligation_id") REFERENCES "public"."recurring_obligation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emi_plan" ADD CONSTRAINT "emi_plan_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emi_plan" ADD CONSTRAINT "emi_plan_payment_instrument_id_payment_instrument_id_fk" FOREIGN KEY ("payment_instrument_id") REFERENCES "public"."payment_instrument"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income_stream" ADD CONSTRAINT "income_stream_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income_stream" ADD CONSTRAINT "income_stream_source_merchant_id_merchant_id_fk" FOREIGN KEY ("source_merchant_id") REFERENCES "public"."merchant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income_stream" ADD CONSTRAINT "income_stream_payment_instrument_id_payment_instrument_id_fk" FOREIGN KEY ("payment_instrument_id") REFERENCES "public"."payment_instrument"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_obligation" ADD CONSTRAINT "recurring_obligation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_obligation" ADD CONSTRAINT "recurring_obligation_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_obligation" ADD CONSTRAINT "recurring_obligation_payment_instrument_id_payment_instrument_id_fk" FOREIGN KEY ("payment_instrument_id") REFERENCES "public"."payment_instrument"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_obligation" ADD CONSTRAINT "recurring_obligation_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_obligation" ADD CONSTRAINT "recurring_obligation_source_event_id_financial_event_id_fk" FOREIGN KEY ("source_event_id") REFERENCES "public"."financial_event"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "emi_plan_recurring_obligation_unique" ON "emi_plan" USING btree ("recurring_obligation_id");--> statement-breakpoint
CREATE INDEX "emi_plan_user_status_next_due_idx" ON "emi_plan" USING btree ("user_id","status","next_due_at");--> statement-breakpoint
CREATE INDEX "income_stream_user_status_next_expected_idx" ON "income_stream" USING btree ("user_id","status","next_expected_at");--> statement-breakpoint
CREATE INDEX "income_stream_source_merchant_status_idx" ON "income_stream" USING btree ("source_merchant_id","status");--> statement-breakpoint
CREATE INDEX "recurring_obligation_user_status_next_due_idx" ON "recurring_obligation" USING btree ("user_id","status","next_due_at");--> statement-breakpoint
CREATE INDEX "recurring_obligation_merchant_status_idx" ON "recurring_obligation" USING btree ("merchant_id","status");--> statement-breakpoint
CREATE INDEX "recurring_obligation_payment_instrument_status_idx" ON "recurring_obligation" USING btree ("payment_instrument_id","status");--> statement-breakpoint
ALTER TABLE "review_queue_item" ADD CONSTRAINT "review_queue_item_type_check" CHECK ("review_queue_item"."item_type" in ('signal_reconciliation', 'duplicate_match', 'merchant_conflict', 'instrument_conflict', 'recurring_obligation_ambiguity', 'emi_plan_ambiguity', 'income_stream_ambiguity'));