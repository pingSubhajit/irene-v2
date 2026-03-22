CREATE TABLE "advice_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"trigger_type" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"priority" integer DEFAULT 2 NOT NULL,
	"dedupe_key" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"detail" text NOT NULL,
	"related_merchant_id" uuid,
	"related_financial_goal_id" uuid,
	"evidence_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_model_run_id" uuid,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "advice_item_trigger_type_check" CHECK ("advice_item"."trigger_type" in ('low_cash_projection', 'rising_recurring_obligations', 'delayed_income', 'discretionary_overspending', 'goal_slippage', 'review_backlog')),
	CONSTRAINT "advice_item_status_check" CHECK ("advice_item"."status" in ('active', 'dismissed', 'done', 'expired')),
	CONSTRAINT "advice_item_priority_check" CHECK ("advice_item"."priority" between 1 and 3)
);
--> statement-breakpoint
CREATE TABLE "financial_goal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"goal_type" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"name" text NOT NULL,
	"target_amount_minor" bigint NOT NULL,
	"starting_amount_minor" bigint DEFAULT 0 NOT NULL,
	"currency" text NOT NULL,
	"target_date" date NOT NULL,
	"linked_category_id" uuid,
	"contribution_rule_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	CONSTRAINT "financial_goal_type_check" CHECK ("financial_goal"."goal_type" in ('emergency_fund', 'target_purchase', 'travel', 'debt_payoff', 'custom')),
	CONSTRAINT "financial_goal_status_check" CHECK ("financial_goal"."status" in ('active', 'completed', 'archived')),
	CONSTRAINT "financial_goal_target_amount_check" CHECK ("financial_goal"."target_amount_minor" > 0),
	CONSTRAINT "financial_goal_starting_amount_check" CHECK ("financial_goal"."starting_amount_minor" >= 0),
	CONSTRAINT "financial_goal_currency_check" CHECK ("financial_goal"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "goal_contribution_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"financial_goal_id" uuid NOT NULL,
	"snapshot_date" date NOT NULL,
	"saved_amount_minor" bigint NOT NULL,
	"projected_amount_minor" bigint NOT NULL,
	"gap_amount_minor" bigint NOT NULL,
	"confidence" numeric(5, 4) DEFAULT 0.5 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goal_contribution_snapshot_confidence_check" CHECK ("goal_contribution_snapshot"."confidence" >= 0 AND "goal_contribution_snapshot"."confidence" <= 1)
);
--> statement-breakpoint
ALTER TABLE "advice_item" ADD CONSTRAINT "advice_item_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advice_item" ADD CONSTRAINT "advice_item_related_merchant_id_merchant_id_fk" FOREIGN KEY ("related_merchant_id") REFERENCES "public"."merchant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advice_item" ADD CONSTRAINT "advice_item_related_financial_goal_id_financial_goal_id_fk" FOREIGN KEY ("related_financial_goal_id") REFERENCES "public"."financial_goal"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advice_item" ADD CONSTRAINT "advice_item_source_model_run_id_model_run_id_fk" FOREIGN KEY ("source_model_run_id") REFERENCES "public"."model_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_goal" ADD CONSTRAINT "financial_goal_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_goal" ADD CONSTRAINT "financial_goal_linked_category_id_category_id_fk" FOREIGN KEY ("linked_category_id") REFERENCES "public"."category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_contribution_snapshot" ADD CONSTRAINT "goal_contribution_snapshot_financial_goal_id_financial_goal_id_fk" FOREIGN KEY ("financial_goal_id") REFERENCES "public"."financial_goal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "advice_item_user_dedupe_key_unique" ON "advice_item" USING btree ("user_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "advice_item_user_status_priority_updated_idx" ON "advice_item" USING btree ("user_id","status","priority","updated_at");--> statement-breakpoint
CREATE INDEX "financial_goal_user_status_target_date_idx" ON "financial_goal" USING btree ("user_id","status","target_date");--> statement-breakpoint
CREATE UNIQUE INDEX "goal_contribution_snapshot_goal_date_unique" ON "goal_contribution_snapshot" USING btree ("financial_goal_id","snapshot_date");--> statement-breakpoint
CREATE INDEX "goal_contribution_snapshot_date_idx" ON "goal_contribution_snapshot" USING btree ("snapshot_date");