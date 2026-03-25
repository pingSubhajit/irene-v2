CREATE TABLE "advice_refresh_state" (
  "user_id" text PRIMARY KEY NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "generation_input_hash" text,
  "generation_prompt_version" text,
  "generation_model_name" text,
  "generation_last_model_run_id" uuid REFERENCES "model_run"("id") ON DELETE set null,
  "generation_last_evaluated_at" timestamp with time zone,
  "ranking_input_hash" text,
  "ranking_prompt_version" text,
  "ranking_model_name" text,
  "ranking_last_model_run_id" uuid REFERENCES "model_run"("id") ON DELETE set null,
  "ranking_last_evaluated_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "memory_fact"
  ADD COLUMN "content_hash" text,
  ADD COLUMN "summary_source_hash" text,
  ADD COLUMN "summary_model_run_id" uuid REFERENCES "model_run"("id") ON DELETE set null,
  ADD COLUMN "summarized_at" timestamp with time zone;

CREATE TABLE "gmail_message_relevance_cache" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "oauth_connection_id" uuid NOT NULL REFERENCES "oauth_connection"("id") ON DELETE cascade,
  "provider_message_id" text NOT NULL,
  "message_timestamp" timestamp with time zone NOT NULL,
  "input_hash" text NOT NULL,
  "classification" text NOT NULL,
  "stage" text NOT NULL,
  "score" bigint NOT NULL,
  "reasons_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "prompt_version" text NOT NULL,
  "model_name" text NOT NULL,
  "provider" text NOT NULL,
  "model_run_id" uuid,
  "last_evaluated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "gmail_message_relevance_cache_classification_check" CHECK ("classification" in ('transactional_finance', 'obligation_finance', 'marketing_finance', 'non_finance')),
  CONSTRAINT "gmail_message_relevance_cache_stage_check" CHECK ("stage" in ('heuristic', 'model'))
);

CREATE UNIQUE INDEX "gmail_message_relevance_cache_connection_message_unique"
  ON "gmail_message_relevance_cache" ("oauth_connection_id", "provider_message_id");
CREATE INDEX "gmail_message_relevance_cache_connection_timestamp_idx"
  ON "gmail_message_relevance_cache" ("oauth_connection_id", "message_timestamp");
CREATE INDEX "gmail_message_relevance_cache_user_timestamp_idx"
  ON "gmail_message_relevance_cache" ("user_id", "message_timestamp");
