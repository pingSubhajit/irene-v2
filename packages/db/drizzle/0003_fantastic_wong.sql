CREATE TABLE "extracted_signal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"raw_document_id" uuid NOT NULL,
	"model_run_id" uuid,
	"signal_type" text NOT NULL,
	"candidate_event_type" text,
	"amount_minor" bigint,
	"currency" text,
	"event_date" date,
	"merchant_raw" text,
	"merchant_hint" text,
	"payment_instrument_hint" text,
	"category_hint" text,
	"is_recurring_hint" boolean DEFAULT false NOT NULL,
	"is_emi_hint" boolean DEFAULT false NOT NULL,
	"confidence" numeric(5, 4) NOT NULL,
	"evidence_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "extracted_signal_signal_type_check" CHECK ("extracted_signal"."signal_type" in ('purchase_signal', 'income_signal', 'subscription_signal', 'emi_signal', 'bill_signal', 'refund_signal', 'transfer_signal', 'generic_finance_signal')),
	CONSTRAINT "extracted_signal_candidate_event_type_check" CHECK ("extracted_signal"."candidate_event_type" IS NULL OR "extracted_signal"."candidate_event_type" in ('purchase', 'income', 'subscription_charge', 'emi_payment', 'bill_payment', 'refund', 'transfer')),
	CONSTRAINT "extracted_signal_status_check" CHECK ("extracted_signal"."status" in ('pending', 'reconciled', 'ignored', 'needs_review', 'failed')),
	CONSTRAINT "extracted_signal_confidence_check" CHECK ("extracted_signal"."confidence" >= 0 AND "extracted_signal"."confidence" <= 1),
	CONSTRAINT "extracted_signal_currency_check" CHECK ("extracted_signal"."currency" IS NULL OR "extracted_signal"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "extracted_signal_amount_minor_check" CHECK ("extracted_signal"."amount_minor" IS NULL OR "extracted_signal"."amount_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "model_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"raw_document_id" uuid,
	"task_type" text NOT NULL,
	"provider" text NOT NULL,
	"model_name" text NOT NULL,
	"prompt_version" text NOT NULL,
	"input_tokens" numeric,
	"output_tokens" numeric,
	"status" text NOT NULL,
	"latency_ms" numeric,
	"request_id" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "model_run_task_type_check" CHECK ("model_run"."task_type" in ('document_extraction', 'classification_support', 'advice_generation', 'review_summary')),
	CONSTRAINT "model_run_status_check" CHECK ("model_run"."status" in ('queued', 'running', 'succeeded', 'failed')),
	CONSTRAINT "model_run_input_tokens_check" CHECK ("model_run"."input_tokens" IS NULL OR "model_run"."input_tokens" >= 0),
	CONSTRAINT "model_run_output_tokens_check" CHECK ("model_run"."output_tokens" IS NULL OR "model_run"."output_tokens" >= 0),
	CONSTRAINT "model_run_latency_ms_check" CHECK ("model_run"."latency_ms" IS NULL OR "model_run"."latency_ms" >= 0)
);
--> statement-breakpoint
ALTER TABLE "extracted_signal" ADD CONSTRAINT "extracted_signal_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracted_signal" ADD CONSTRAINT "extracted_signal_raw_document_id_raw_document_id_fk" FOREIGN KEY ("raw_document_id") REFERENCES "public"."raw_document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracted_signal" ADD CONSTRAINT "extracted_signal_model_run_id_model_run_id_fk" FOREIGN KEY ("model_run_id") REFERENCES "public"."model_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_run" ADD CONSTRAINT "model_run_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_run" ADD CONSTRAINT "model_run_raw_document_id_raw_document_id_fk" FOREIGN KEY ("raw_document_id") REFERENCES "public"."raw_document"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "extracted_signal_raw_document_created_at_idx" ON "extracted_signal" USING btree ("raw_document_id","created_at");--> statement-breakpoint
CREATE INDEX "extracted_signal_user_status_created_at_idx" ON "extracted_signal" USING btree ("user_id","status","created_at");--> statement-breakpoint
CREATE INDEX "extracted_signal_candidate_status_idx" ON "extracted_signal" USING btree ("candidate_event_type","status");--> statement-breakpoint
CREATE INDEX "extracted_signal_model_run_idx" ON "extracted_signal" USING btree ("model_run_id");--> statement-breakpoint
CREATE INDEX "model_run_user_created_at_idx" ON "model_run" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "model_run_raw_document_created_at_idx" ON "model_run" USING btree ("raw_document_id","created_at");--> statement-breakpoint
CREATE INDEX "model_run_task_status_created_at_idx" ON "model_run" USING btree ("task_type","status","created_at");