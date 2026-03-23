ALTER TABLE "model_run" DROP CONSTRAINT "model_run_task_type_check";--> statement-breakpoint
ALTER TABLE "advice_item" ADD COLUMN "home_rank_score" numeric(5, 4);--> statement-breakpoint
ALTER TABLE "advice_item" ADD COLUMN "home_rank_position" integer;--> statement-breakpoint
ALTER TABLE "advice_item" ADD COLUMN "ranked_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "advice_item_user_status_home_rank_idx" ON "advice_item" USING btree ("user_id","status","home_rank_position","ranked_at");--> statement-breakpoint
ALTER TABLE "advice_item" ADD CONSTRAINT "advice_item_home_rank_position_check" CHECK ("advice_item"."home_rank_position" IS NULL OR "advice_item"."home_rank_position" between 1 and 3);--> statement-breakpoint
ALTER TABLE "advice_item" ADD CONSTRAINT "advice_item_home_rank_score_check" CHECK ("advice_item"."home_rank_score" IS NULL OR ("advice_item"."home_rank_score" >= 0 AND "advice_item"."home_rank_score" <= 1));--> statement-breakpoint
ALTER TABLE "model_run" ADD CONSTRAINT "model_run_task_type_check" CHECK ("model_run"."task_type" in ('finance_relevance_classification', 'document_extraction', 'balance_inference', 'memory_authoring', 'memory_summarization', 'classification_support', 'entity_resolution', 'merchant_resolution', 'category_resolution', 'reconciliation_resolution', 'advice_generation', 'advice_ranking', 'review_summary'));