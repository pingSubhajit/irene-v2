ALTER TABLE "model_run" DROP CONSTRAINT "model_run_task_type_check";--> statement-breakpoint
ALTER TABLE "model_run" ADD CONSTRAINT "model_run_task_type_check" CHECK ("model_run"."task_type" in (
  'finance_relevance_classification',
  'document_extraction',
  'merchant_hint_extraction',
  'balance_inference',
  'memory_authoring',
  'memory_summarization',
  'classification_support',
  'entity_resolution',
  'merchant_resolution',
  'category_resolution',
  'reconciliation_resolution',
  'advice_generation',
  'advice_ranking',
  'review_summary'
));--> statement-breakpoint
