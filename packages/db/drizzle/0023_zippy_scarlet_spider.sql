ALTER TABLE "job_run" DROP CONSTRAINT "job_run_status_check";--> statement-breakpoint
ALTER TABLE "job_run" ADD COLUMN "max_attempts" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "job_run" ADD COLUMN "retryable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "job_run" ADD COLUMN "last_error_code" text;--> statement-breakpoint
ALTER TABLE "job_run" ADD COLUMN "last_error_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "job_run" ADD COLUMN "dead_lettered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "job_run" ADD COLUMN "replayed_from_job_run_id" uuid;--> statement-breakpoint
ALTER TABLE "job_run" ADD COLUMN "recovery_group_key" text;--> statement-breakpoint
ALTER TABLE "job_run" ADD CONSTRAINT "job_run_replayed_from_job_run_id_job_run_id_fk" FOREIGN KEY ("replayed_from_job_run_id") REFERENCES "public"."job_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_run_replayed_from_idx" ON "job_run" USING btree ("replayed_from_job_run_id");--> statement-breakpoint
CREATE INDEX "job_run_recovery_group_idx" ON "job_run" USING btree ("recovery_group_key","created_at");--> statement-breakpoint
ALTER TABLE "job_run" ADD CONSTRAINT "job_run_attempt_count_check" CHECK ("job_run"."attempt_count" >= 0);--> statement-breakpoint
ALTER TABLE "job_run" ADD CONSTRAINT "job_run_max_attempts_check" CHECK ("job_run"."max_attempts" > 0);--> statement-breakpoint
ALTER TABLE "job_run" ADD CONSTRAINT "job_run_status_check" CHECK ("job_run"."status" in ('queued', 'running', 'succeeded', 'failed', 'dead_lettered'));