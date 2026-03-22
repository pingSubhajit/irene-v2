CREATE TABLE "memory_fact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"fact_type" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid,
	"key" text NOT NULL,
	"value_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confidence" numeric(5, 4) DEFAULT 1 NOT NULL,
	"source" text NOT NULL,
	"source_reference_id" uuid,
	"is_user_pinned" boolean DEFAULT false NOT NULL,
	"first_observed_at" timestamp with time zone,
	"last_confirmed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memory_fact_fact_type_check" CHECK ("memory_fact"."fact_type" in (
        'merchant_category_default',
        'merchant_alias',
        'merchant_recurring_hint',
        'merchant_preferred_processor',
        'merchant_preferred_event_type',
        'sender_institution_alias',
        'instrument_type_preference',
        'instrument_backing_account_link',
        'income_timing_expectation'
      )),
	CONSTRAINT "memory_fact_subject_type_check" CHECK ("memory_fact"."subject_type" in (
        'merchant',
        'payment_instrument',
        'financial_institution',
        'sender_alias',
        'income_stream',
        'user'
      )),
	CONSTRAINT "memory_fact_source_check" CHECK ("memory_fact"."source" in ('feedback', 'review', 'automation', 'system_rebuild')),
	CONSTRAINT "memory_fact_confidence_check" CHECK ("memory_fact"."confidence" >= 0 AND "memory_fact"."confidence" <= 1)
);
--> statement-breakpoint
ALTER TABLE "feedback_event" DROP CONSTRAINT "feedback_event_target_type_check";--> statement-breakpoint
ALTER TABLE "memory_fact" ADD CONSTRAINT "memory_fact_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "memory_fact_user_fact_type_key_unique" ON "memory_fact" USING btree ("user_id","fact_type","key");--> statement-breakpoint
CREATE INDEX "memory_fact_user_fact_type_key_idx" ON "memory_fact" USING btree ("user_id","fact_type","key");--> statement-breakpoint
CREATE INDEX "memory_fact_subject_idx" ON "memory_fact" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "memory_fact_user_pinned_expiry_idx" ON "memory_fact" USING btree ("user_id","is_user_pinned","expires_at");--> statement-breakpoint
ALTER TABLE "feedback_event" ADD CONSTRAINT "feedback_event_target_type_check" CHECK ("feedback_event"."target_type" in (
        'financial_event',
        'merchant',
        'payment_instrument',
        'memory_fact',
        'balance_anchor',
        'balance_observation',
        'recurring_obligation',
        'income_stream',
        'emi_plan',
        'review_queue_item'
      ));