CREATE TABLE "pwa_mutation_receipt" (
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "idempotency_key" text NOT NULL,
  "mutation_id" text NOT NULL,
  "kind" text NOT NULL,
  "request_payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "response_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "pwa_mutation_receipt_status_check" CHECK ("status" in ('succeeded', 'failed_retryable', 'failed_terminal', 'blocked_auth')),
  CONSTRAINT "pwa_mutation_receipt_pk" PRIMARY KEY("user_id","idempotency_key")
);

CREATE INDEX "pwa_mutation_receipt_user_created_idx"
  ON "pwa_mutation_receipt" ("user_id", "created_at");
