CREATE TABLE "feedback_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"correction_type" text NOT NULL,
	"source_surface" text NOT NULL,
	"previous_value_json" jsonb,
	"new_value_json" jsonb,
	"metadata_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_event_target_type_check" CHECK ("feedback_event"."target_type" in (
        'financial_event',
        'merchant',
        'payment_instrument',
        'balance_anchor',
        'balance_observation',
        'recurring_obligation',
        'income_stream',
        'emi_plan',
        'review_queue_item'
      )),
	CONSTRAINT "feedback_event_source_surface_check" CHECK ("feedback_event"."source_surface" in ('activity_detail', 'activity_recurring', 'review', 'settings', 'system'))
);
--> statement-breakpoint
ALTER TABLE "balance_observation" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "feedback_event" ADD CONSTRAINT "feedback_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_event" ADD CONSTRAINT "feedback_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_event_user_target_idx" ON "feedback_event" USING btree ("user_id","target_type","target_id");--> statement-breakpoint
CREATE INDEX "feedback_event_user_created_at_idx" ON "feedback_event" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "balance_observation" ADD CONSTRAINT "balance_observation_status_check" CHECK ("balance_observation"."status" in ('active', 'ignored'));