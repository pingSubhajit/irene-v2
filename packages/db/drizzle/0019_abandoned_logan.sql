ALTER TABLE "model_run" DROP CONSTRAINT "model_run_task_type_check";--> statement-breakpoint
ALTER TABLE "memory_fact" ADD COLUMN "summary_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "memory_fact" ADD COLUMN "detail_text" text;--> statement-breakpoint
ALTER TABLE "memory_fact" ADD COLUMN "authored_text" text;--> statement-breakpoint
ALTER TABLE "model_run" ADD CONSTRAINT "model_run_task_type_check" CHECK ("model_run"."task_type" in ('finance_relevance_classification', 'document_extraction', 'balance_inference', 'memory_authoring', 'memory_summarization', 'classification_support', 'entity_resolution', 'merchant_resolution', 'category_resolution', 'reconciliation_resolution', 'advice_generation', 'review_summary'));