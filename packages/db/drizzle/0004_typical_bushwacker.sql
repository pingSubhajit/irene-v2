CREATE TABLE "category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"parent_category_id" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"kind" text NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "category_kind_check" CHECK ("category"."kind" in ('income', 'expense', 'transfer', 'refund', 'debt', 'uncategorized'))
);
--> statement-breakpoint
CREATE TABLE "financial_event_source" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"financial_event_id" uuid NOT NULL,
	"raw_document_id" uuid,
	"extracted_signal_id" uuid,
	"link_reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_event_source_reference_check" CHECK ("financial_event_source"."raw_document_id" IS NOT NULL OR "financial_event_source"."extracted_signal_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "financial_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"event_type" text NOT NULL,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"direction" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"event_occurred_at" timestamp with time zone NOT NULL,
	"posted_at" timestamp with time zone,
	"merchant_id" uuid,
	"payment_instrument_id" uuid,
	"category_id" uuid,
	"description" text,
	"notes" text,
	"confidence" numeric(5, 4) DEFAULT 1 NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	"is_recurring_candidate" boolean DEFAULT false NOT NULL,
	"is_transfer" boolean DEFAULT false NOT NULL,
	"source_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_event_type_check" CHECK ("financial_event"."event_type" in ('purchase', 'income', 'subscription_charge', 'emi_payment', 'bill_payment', 'refund', 'transfer')),
	CONSTRAINT "financial_event_status_check" CHECK ("financial_event"."status" in ('confirmed', 'needs_review', 'ignored', 'reversed')),
	CONSTRAINT "financial_event_direction_check" CHECK ("financial_event"."direction" in ('inflow', 'outflow', 'neutral')),
	CONSTRAINT "financial_event_confidence_check" CHECK ("financial_event"."confidence" >= 0 AND "financial_event"."confidence" <= 1),
	CONSTRAINT "financial_event_source_count_check" CHECK ("financial_event"."source_count" >= 0),
	CONSTRAINT "financial_event_amount_minor_check" CHECK ("financial_event"."amount_minor" >= 0),
	CONSTRAINT "financial_event_currency_check" CHECK ("financial_event"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "merchant_alias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"alias_text" text NOT NULL,
	"alias_hash" text NOT NULL,
	"source" text NOT NULL,
	"confidence" numeric(5, 4) DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchant_alias_confidence_check" CHECK ("merchant_alias"."confidence" >= 0 AND "merchant_alias"."confidence" <= 1)
);
--> statement-breakpoint
CREATE TABLE "merchant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"display_name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"default_category" text,
	"merchant_type" text DEFAULT 'unknown' NOT NULL,
	"country_code" text,
	"is_subscription_prone" boolean DEFAULT false NOT NULL,
	"is_emi_lender" boolean DEFAULT false NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchant_type_check" CHECK ("merchant"."merchant_type" in ('merchant', 'bank', 'employer', 'platform', 'individual', 'unknown')),
	CONSTRAINT "merchant_country_code_check" CHECK ("merchant"."country_code" IS NULL OR "merchant"."country_code" ~ '^[A-Z]{2}$')
);
--> statement-breakpoint
CREATE TABLE "payment_instrument" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"instrument_type" text NOT NULL,
	"provider_name" text,
	"display_name" text NOT NULL,
	"masked_identifier" text,
	"billing_cycle_day" integer,
	"payment_due_day" integer,
	"credit_limit_minor" bigint,
	"currency" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_instrument_type_check" CHECK ("payment_instrument"."instrument_type" in ('credit_card', 'debit_card', 'bank_account', 'upi', 'wallet', 'unknown')),
	CONSTRAINT "payment_instrument_status_check" CHECK ("payment_instrument"."status" in ('active', 'inactive')),
	CONSTRAINT "payment_instrument_billing_cycle_day_check" CHECK ("payment_instrument"."billing_cycle_day" IS NULL OR "payment_instrument"."billing_cycle_day" BETWEEN 1 AND 31),
	CONSTRAINT "payment_instrument_payment_due_day_check" CHECK ("payment_instrument"."payment_due_day" IS NULL OR "payment_instrument"."payment_due_day" BETWEEN 1 AND 31),
	CONSTRAINT "payment_instrument_credit_limit_minor_check" CHECK ("payment_instrument"."credit_limit_minor" IS NULL OR "payment_instrument"."credit_limit_minor" >= 0),
	CONSTRAINT "payment_instrument_currency_check" CHECK ("payment_instrument"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "review_queue_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"item_type" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"priority" integer DEFAULT 3 NOT NULL,
	"raw_document_id" uuid,
	"extracted_signal_id" uuid,
	"financial_event_id" uuid,
	"title" text NOT NULL,
	"explanation" text NOT NULL,
	"proposed_resolution_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "review_queue_item_type_check" CHECK ("review_queue_item"."item_type" in ('signal_reconciliation', 'duplicate_match', 'merchant_conflict', 'instrument_conflict')),
	CONSTRAINT "review_queue_item_status_check" CHECK ("review_queue_item"."status" in ('open', 'resolved', 'ignored')),
	CONSTRAINT "review_queue_item_priority_check" CHECK ("review_queue_item"."priority" BETWEEN 1 AND 5),
	CONSTRAINT "review_queue_item_reference_check" CHECK ("review_queue_item"."raw_document_id" IS NOT NULL OR "review_queue_item"."extracted_signal_id" IS NOT NULL OR "review_queue_item"."financial_event_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_event_source" ADD CONSTRAINT "financial_event_source_financial_event_id_financial_event_id_fk" FOREIGN KEY ("financial_event_id") REFERENCES "public"."financial_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_event_source" ADD CONSTRAINT "financial_event_source_raw_document_id_raw_document_id_fk" FOREIGN KEY ("raw_document_id") REFERENCES "public"."raw_document"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_event_source" ADD CONSTRAINT "financial_event_source_extracted_signal_id_extracted_signal_id_fk" FOREIGN KEY ("extracted_signal_id") REFERENCES "public"."extracted_signal"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_event" ADD CONSTRAINT "financial_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_event" ADD CONSTRAINT "financial_event_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_event" ADD CONSTRAINT "financial_event_payment_instrument_id_payment_instrument_id_fk" FOREIGN KEY ("payment_instrument_id") REFERENCES "public"."payment_instrument"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_event" ADD CONSTRAINT "financial_event_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_alias" ADD CONSTRAINT "merchant_alias_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant" ADD CONSTRAINT "merchant_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_instrument" ADD CONSTRAINT "payment_instrument_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_queue_item" ADD CONSTRAINT "review_queue_item_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_queue_item" ADD CONSTRAINT "review_queue_item_raw_document_id_raw_document_id_fk" FOREIGN KEY ("raw_document_id") REFERENCES "public"."raw_document"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_queue_item" ADD CONSTRAINT "review_queue_item_extracted_signal_id_extracted_signal_id_fk" FOREIGN KEY ("extracted_signal_id") REFERENCES "public"."extracted_signal"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_queue_item" ADD CONSTRAINT "review_queue_item_financial_event_id_financial_event_id_fk" FOREIGN KEY ("financial_event_id") REFERENCES "public"."financial_event"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "category_user_slug_unique" ON "category" USING btree ("user_id","slug");--> statement-breakpoint
CREATE INDEX "category_user_kind_idx" ON "category" USING btree ("user_id","kind");--> statement-breakpoint
CREATE INDEX "category_parent_idx" ON "category" USING btree ("parent_category_id");--> statement-breakpoint
CREATE INDEX "financial_event_source_event_idx" ON "financial_event_source" USING btree ("financial_event_id");--> statement-breakpoint
CREATE INDEX "financial_event_source_raw_document_idx" ON "financial_event_source" USING btree ("raw_document_id");--> statement-breakpoint
CREATE INDEX "financial_event_source_extracted_signal_idx" ON "financial_event_source" USING btree ("extracted_signal_id");--> statement-breakpoint
CREATE INDEX "financial_event_user_occurred_at_idx" ON "financial_event" USING btree ("user_id","event_occurred_at");--> statement-breakpoint
CREATE INDEX "financial_event_user_type_occurred_at_idx" ON "financial_event" USING btree ("user_id","event_type","event_occurred_at");--> statement-breakpoint
CREATE INDEX "financial_event_merchant_occurred_at_idx" ON "financial_event" USING btree ("merchant_id","event_occurred_at");--> statement-breakpoint
CREATE INDEX "financial_event_payment_instrument_occurred_at_idx" ON "financial_event" USING btree ("payment_instrument_id","event_occurred_at");--> statement-breakpoint
CREATE INDEX "financial_event_category_occurred_at_idx" ON "financial_event" USING btree ("category_id","event_occurred_at");--> statement-breakpoint
CREATE INDEX "financial_event_status_needs_review_idx" ON "financial_event" USING btree ("status","needs_review");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_alias_merchant_alias_hash_unique" ON "merchant_alias" USING btree ("merchant_id","alias_hash");--> statement-breakpoint
CREATE INDEX "merchant_alias_hash_idx" ON "merchant_alias" USING btree ("alias_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_user_normalized_name_unique" ON "merchant" USING btree ("user_id","normalized_name");--> statement-breakpoint
CREATE INDEX "merchant_user_type_idx" ON "merchant" USING btree ("user_id","merchant_type");--> statement-breakpoint
CREATE INDEX "merchant_last_seen_at_idx" ON "merchant" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "payment_instrument_user_type_status_idx" ON "payment_instrument" USING btree ("user_id","instrument_type","status");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_instrument_user_identity_unique" ON "payment_instrument" USING btree ("user_id","instrument_type","provider_name","masked_identifier");--> statement-breakpoint
CREATE INDEX "review_queue_item_user_status_priority_created_at_idx" ON "review_queue_item" USING btree ("user_id","status","priority","created_at");--> statement-breakpoint
CREATE INDEX "review_queue_item_raw_document_idx" ON "review_queue_item" USING btree ("raw_document_id");--> statement-breakpoint
CREATE INDEX "review_queue_item_extracted_signal_idx" ON "review_queue_item" USING btree ("extracted_signal_id");--> statement-breakpoint
CREATE INDEX "review_queue_item_financial_event_idx" ON "review_queue_item" USING btree ("financial_event_id");