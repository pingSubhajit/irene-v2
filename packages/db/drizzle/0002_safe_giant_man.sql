ALTER TABLE "raw_document" ADD COLUMN "relevance_label" text;--> statement-breakpoint
ALTER TABLE "raw_document" ADD COLUMN "relevance_stage" text;--> statement-breakpoint
ALTER TABLE "raw_document" ADD COLUMN "relevance_score" bigint;--> statement-breakpoint
ALTER TABLE "raw_document" ADD COLUMN "relevance_reasons_json" jsonb;--> statement-breakpoint
ALTER TABLE "raw_document" ADD CONSTRAINT "raw_document_relevance_label_check" CHECK ("raw_document"."relevance_label" IS NULL OR "raw_document"."relevance_label" in ('transactional_finance', 'obligation_finance', 'marketing_finance', 'non_finance'));--> statement-breakpoint
ALTER TABLE "raw_document" ADD CONSTRAINT "raw_document_relevance_stage_check" CHECK ("raw_document"."relevance_stage" IS NULL OR "raw_document"."relevance_stage" in ('heuristic', 'model'));