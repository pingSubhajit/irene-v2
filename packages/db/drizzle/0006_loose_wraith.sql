CREATE TABLE "financial_institution_alias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"financial_institution_id" uuid NOT NULL,
	"alias_text" text NOT NULL,
	"alias_hash" text NOT NULL,
	"source" text NOT NULL,
	"confidence" numeric(5, 4) DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_institution_alias_confidence_check" CHECK ("financial_institution_alias"."confidence" >= 0 AND "financial_institution_alias"."confidence" <= 1)
);
--> statement-breakpoint
CREATE TABLE "financial_institution" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"display_name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_instrument_observation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"financial_event_id" uuid,
	"raw_document_id" uuid,
	"extracted_signal_id" uuid,
	"payment_instrument_id" uuid,
	"observation_source_kind" text NOT NULL,
	"masked_identifier" text,
	"instrument_type_hint" text,
	"issuer_hint" text,
	"issuer_alias_hint" text,
	"counterparty_hint" text,
	"network_hint" text,
	"confidence" numeric(5, 4) DEFAULT 0 NOT NULL,
	"evidence_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resolution_status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_instrument_observation_source_kind_check" CHECK ("payment_instrument_observation"."observation_source_kind" in ('bank_alert', 'statement', 'merchant_receipt', 'merchant_order', 'subscription_notice', 'other')),
	CONSTRAINT "payment_instrument_observation_resolution_status_check" CHECK ("payment_instrument_observation"."resolution_status" in ('pending', 'linked', 'needs_review', 'ignored')),
	CONSTRAINT "payment_instrument_observation_confidence_check" CHECK ("payment_instrument_observation"."confidence" >= 0 AND "payment_instrument_observation"."confidence" <= 1),
	CONSTRAINT "payment_instrument_observation_reference_check" CHECK ("payment_instrument_observation"."financial_event_id" IS NOT NULL OR "payment_instrument_observation"."raw_document_id" IS NOT NULL OR "payment_instrument_observation"."extracted_signal_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "model_run" DROP CONSTRAINT "model_run_task_type_check";--> statement-breakpoint
ALTER TABLE "review_queue_item" DROP CONSTRAINT "review_queue_item_type_check";--> statement-breakpoint
DROP INDEX "payment_instrument_user_identity_unique";--> statement-breakpoint
ALTER TABLE "payment_instrument" ADD COLUMN "financial_institution_id" uuid;--> statement-breakpoint
ALTER TABLE "financial_institution_alias" ADD CONSTRAINT "financial_institution_alias_financial_institution_id_financial_institution_id_fk" FOREIGN KEY ("financial_institution_id") REFERENCES "public"."financial_institution"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_institution" ADD CONSTRAINT "financial_institution_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_instrument_observation" ADD CONSTRAINT "payment_instrument_observation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_instrument_observation" ADD CONSTRAINT "payment_instrument_observation_financial_event_id_financial_event_id_fk" FOREIGN KEY ("financial_event_id") REFERENCES "public"."financial_event"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_instrument_observation" ADD CONSTRAINT "payment_instrument_observation_raw_document_id_raw_document_id_fk" FOREIGN KEY ("raw_document_id") REFERENCES "public"."raw_document"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_instrument_observation" ADD CONSTRAINT "payment_instrument_observation_extracted_signal_id_extracted_signal_id_fk" FOREIGN KEY ("extracted_signal_id") REFERENCES "public"."extracted_signal"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_instrument_observation" ADD CONSTRAINT "payment_instrument_observation_payment_instrument_id_payment_instrument_id_fk" FOREIGN KEY ("payment_instrument_id") REFERENCES "public"."payment_instrument"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "financial_institution_alias_unique" ON "financial_institution_alias" USING btree ("financial_institution_id","alias_hash");--> statement-breakpoint
CREATE INDEX "financial_institution_alias_hash_idx" ON "financial_institution_alias" USING btree ("alias_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "financial_institution_user_normalized_name_unique" ON "financial_institution" USING btree ("user_id","normalized_name");--> statement-breakpoint
CREATE INDEX "financial_institution_user_display_name_idx" ON "financial_institution" USING btree ("user_id","display_name");--> statement-breakpoint
CREATE INDEX "payment_instrument_observation_user_masked_status_idx" ON "payment_instrument_observation" USING btree ("user_id","masked_identifier","resolution_status");--> statement-breakpoint
CREATE INDEX "payment_instrument_observation_financial_event_idx" ON "payment_instrument_observation" USING btree ("financial_event_id");--> statement-breakpoint
CREATE INDEX "payment_instrument_observation_raw_document_idx" ON "payment_instrument_observation" USING btree ("raw_document_id");--> statement-breakpoint
CREATE INDEX "payment_instrument_observation_extracted_signal_idx" ON "payment_instrument_observation" USING btree ("extracted_signal_id");--> statement-breakpoint
CREATE INDEX "payment_instrument_observation_payment_instrument_idx" ON "payment_instrument_observation" USING btree ("payment_instrument_id");--> statement-breakpoint
ALTER TABLE "payment_instrument" ADD CONSTRAINT "payment_instrument_financial_institution_id_financial_institution_id_fk" FOREIGN KEY ("financial_institution_id") REFERENCES "public"."financial_institution"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_instrument_user_identity_unique" ON "payment_instrument" USING btree ("user_id","financial_institution_id","instrument_type","masked_identifier");--> statement-breakpoint
ALTER TABLE "model_run" ADD CONSTRAINT "model_run_task_type_check" CHECK ("model_run"."task_type" in ('document_extraction', 'classification_support', 'entity_resolution', 'advice_generation', 'review_summary'));--> statement-breakpoint
ALTER TABLE "review_queue_item" ADD CONSTRAINT "review_queue_item_type_check" CHECK ("review_queue_item"."item_type" in ('signal_reconciliation', 'duplicate_match', 'merchant_conflict', 'instrument_conflict', 'payment_instrument_resolution', 'recurring_obligation_ambiguity', 'emi_plan_ambiguity', 'income_stream_ambiguity'));