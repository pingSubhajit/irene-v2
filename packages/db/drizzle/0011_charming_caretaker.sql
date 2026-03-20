ALTER TABLE "model_run" DROP CONSTRAINT "model_run_task_type_check";--> statement-breakpoint
ALTER TABLE "model_run" ADD COLUMN "financial_event_id" uuid;--> statement-breakpoint
ALTER TABLE "model_run" ADD COLUMN "result_json" jsonb;--> statement-breakpoint
ALTER TABLE "model_run" ADD CONSTRAINT "model_run_financial_event_id_financial_event_id_fk" FOREIGN KEY ("financial_event_id") REFERENCES "public"."financial_event"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "model_run_financial_event_created_at_idx" ON "model_run" USING btree ("financial_event_id","created_at");--> statement-breakpoint
ALTER TABLE "model_run" ADD CONSTRAINT "model_run_task_type_check" CHECK ("model_run"."task_type" in ('finance_relevance_classification', 'document_extraction', 'classification_support', 'entity_resolution', 'merchant_resolution', 'category_resolution', 'reconciliation_resolution', 'advice_generation', 'review_summary'));