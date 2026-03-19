CREATE TABLE "merchant_observation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"financial_event_id" uuid,
	"raw_document_id" uuid,
	"extracted_signal_id" uuid,
	"merchant_id" uuid,
	"payment_processor_id" uuid,
	"observation_source_kind" text NOT NULL,
	"issuer_hint" text,
	"merchant_descriptor_raw" text,
	"merchant_name_hint" text,
	"processor_name_hint" text,
	"sender_alias_hint" text,
	"channel_hint" text,
	"confidence" numeric(5, 4) DEFAULT 0 NOT NULL,
	"evidence_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resolution_status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchant_observation_source_kind_check" CHECK ("merchant_observation"."observation_source_kind" in ('bank_alert', 'statement', 'merchant_receipt', 'merchant_order', 'subscription_notice', 'processor_receipt', 'other')),
	CONSTRAINT "merchant_observation_resolution_status_check" CHECK ("merchant_observation"."resolution_status" in ('pending', 'linked', 'needs_review', 'ignored')),
	CONSTRAINT "merchant_observation_confidence_check" CHECK ("merchant_observation"."confidence" >= 0 AND "merchant_observation"."confidence" <= 1),
	CONSTRAINT "merchant_observation_channel_hint_check" CHECK ("merchant_observation"."channel_hint" IS NULL OR "merchant_observation"."channel_hint" in ('card', 'wallet', 'upi', 'bank_transfer', 'other')),
	CONSTRAINT "merchant_observation_reference_check" CHECK ("merchant_observation"."financial_event_id" IS NOT NULL OR "merchant_observation"."raw_document_id" IS NOT NULL OR "merchant_observation"."extracted_signal_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "payment_processor_alias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_processor_id" uuid NOT NULL,
	"alias_text" text NOT NULL,
	"alias_hash" text NOT NULL,
	"source" text NOT NULL,
	"confidence" numeric(5, 4) DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_processor_alias_confidence_check" CHECK ("payment_processor_alias"."confidence" >= 0 AND "payment_processor_alias"."confidence" <= 1)
);
--> statement-breakpoint
CREATE TABLE "payment_processor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"display_name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "model_run" DROP CONSTRAINT "model_run_task_type_check";--> statement-breakpoint
ALTER TABLE "review_queue_item" DROP CONSTRAINT "review_queue_item_type_check";--> statement-breakpoint
ALTER TABLE "extracted_signal" ADD COLUMN "issuer_name_hint" text;--> statement-breakpoint
ALTER TABLE "extracted_signal" ADD COLUMN "instrument_last4_hint" text;--> statement-breakpoint
ALTER TABLE "extracted_signal" ADD COLUMN "merchant_descriptor_raw" text;--> statement-breakpoint
ALTER TABLE "extracted_signal" ADD COLUMN "merchant_name_candidate" text;--> statement-breakpoint
ALTER TABLE "extracted_signal" ADD COLUMN "processor_name_candidate" text;--> statement-breakpoint
ALTER TABLE "extracted_signal" ADD COLUMN "channel_hint" text;--> statement-breakpoint
ALTER TABLE "financial_event" ADD COLUMN "payment_processor_id" uuid;--> statement-breakpoint
ALTER TABLE "financial_event" ADD COLUMN "merchant_descriptor_raw" text;--> statement-breakpoint
ALTER TABLE "merchant_observation" ADD CONSTRAINT "merchant_observation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_observation" ADD CONSTRAINT "merchant_observation_financial_event_id_financial_event_id_fk" FOREIGN KEY ("financial_event_id") REFERENCES "public"."financial_event"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_observation" ADD CONSTRAINT "merchant_observation_raw_document_id_raw_document_id_fk" FOREIGN KEY ("raw_document_id") REFERENCES "public"."raw_document"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_observation" ADD CONSTRAINT "merchant_observation_extracted_signal_id_extracted_signal_id_fk" FOREIGN KEY ("extracted_signal_id") REFERENCES "public"."extracted_signal"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_observation" ADD CONSTRAINT "merchant_observation_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_observation" ADD CONSTRAINT "merchant_observation_payment_processor_id_payment_processor_id_fk" FOREIGN KEY ("payment_processor_id") REFERENCES "public"."payment_processor"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_processor_alias" ADD CONSTRAINT "payment_processor_alias_payment_processor_id_payment_processor_id_fk" FOREIGN KEY ("payment_processor_id") REFERENCES "public"."payment_processor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_processor" ADD CONSTRAINT "payment_processor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "merchant_observation_user_status_idx" ON "merchant_observation" USING btree ("user_id","resolution_status");--> statement-breakpoint
CREATE INDEX "merchant_observation_financial_event_idx" ON "merchant_observation" USING btree ("financial_event_id");--> statement-breakpoint
CREATE INDEX "merchant_observation_raw_document_idx" ON "merchant_observation" USING btree ("raw_document_id");--> statement-breakpoint
CREATE INDEX "merchant_observation_extracted_signal_idx" ON "merchant_observation" USING btree ("extracted_signal_id");--> statement-breakpoint
CREATE INDEX "merchant_observation_merchant_idx" ON "merchant_observation" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "merchant_observation_payment_processor_idx" ON "merchant_observation" USING btree ("payment_processor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_processor_alias_unique" ON "payment_processor_alias" USING btree ("payment_processor_id","alias_hash");--> statement-breakpoint
CREATE INDEX "payment_processor_alias_hash_idx" ON "payment_processor_alias" USING btree ("alias_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_processor_user_normalized_name_unique" ON "payment_processor" USING btree ("user_id","normalized_name");--> statement-breakpoint
CREATE INDEX "payment_processor_user_display_name_idx" ON "payment_processor" USING btree ("user_id","display_name");--> statement-breakpoint
ALTER TABLE "financial_event" ADD CONSTRAINT "financial_event_payment_processor_id_payment_processor_id_fk" FOREIGN KEY ("payment_processor_id") REFERENCES "public"."payment_processor"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "financial_event_payment_processor_occurred_at_idx" ON "financial_event" USING btree ("payment_processor_id","event_occurred_at");--> statement-breakpoint
ALTER TABLE "extracted_signal" ADD CONSTRAINT "extracted_signal_channel_hint_check" CHECK ("extracted_signal"."channel_hint" IS NULL OR "extracted_signal"."channel_hint" in ('card', 'wallet', 'upi', 'bank_transfer', 'other'));--> statement-breakpoint
ALTER TABLE "model_run" ADD CONSTRAINT "model_run_task_type_check" CHECK ("model_run"."task_type" in ('document_extraction', 'classification_support', 'entity_resolution', 'merchant_resolution', 'category_resolution', 'advice_generation', 'review_summary'));--> statement-breakpoint
ALTER TABLE "review_queue_item" ADD CONSTRAINT "review_queue_item_type_check" CHECK ("review_queue_item"."item_type" in ('signal_reconciliation', 'duplicate_match', 'merchant_conflict', 'instrument_conflict', 'payment_instrument_resolution', 'merchant_resolution', 'category_resolution', 'recurring_obligation_ambiguity', 'emi_plan_ambiguity', 'income_stream_ambiguity'));