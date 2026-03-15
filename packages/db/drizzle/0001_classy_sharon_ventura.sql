CREATE TABLE "document_attachment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"raw_document_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"storage_key" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256_hash" text NOT NULL,
	"parse_status" text DEFAULT 'pending' NOT NULL,
	"parsed_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_attachment_size_bytes_check" CHECK ("document_attachment"."size_bytes" >= 0),
	CONSTRAINT "document_attachment_parse_status_check" CHECK ("document_attachment"."parse_status" in ('pending', 'processing', 'completed', 'failed', 'skipped'))
);
--> statement-breakpoint
CREATE TABLE "email_sync_cursor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oauth_connection_id" uuid NOT NULL,
	"folder_name" text NOT NULL,
	"provider_cursor" text,
	"backfill_started_at" timestamp with time zone,
	"backfill_completed_at" timestamp with time zone,
	"last_seen_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_connection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_email" text NOT NULL,
	"access_token_encrypted" text NOT NULL,
	"refresh_token_encrypted" text,
	"token_expires_at" timestamp with time zone,
	"scope" text,
	"status" text NOT NULL,
	"last_successful_sync_at" timestamp with time zone,
	"last_failed_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_connection_provider_check" CHECK ("oauth_connection"."provider" = 'gmail'),
	CONSTRAINT "oauth_connection_status_check" CHECK ("oauth_connection"."status" in ('active', 'expired', 'revoked', 'error'))
);
--> statement-breakpoint
CREATE TABLE "raw_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"oauth_connection_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"provider_message_id" text NOT NULL,
	"thread_id" text,
	"message_timestamp" timestamp with time zone NOT NULL,
	"from_address" text,
	"to_address" text,
	"subject" text,
	"body_text" text,
	"body_html_storage_key" text,
	"snippet" text,
	"has_attachments" boolean DEFAULT false NOT NULL,
	"document_hash" text NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "raw_document_source_type_check" CHECK ("raw_document"."source_type" in ('email', 'attachment_email', 'forwarded_email'))
);
--> statement-breakpoint
ALTER TABLE "document_attachment" ADD CONSTRAINT "document_attachment_raw_document_id_raw_document_id_fk" FOREIGN KEY ("raw_document_id") REFERENCES "public"."raw_document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_sync_cursor" ADD CONSTRAINT "email_sync_cursor_oauth_connection_id_oauth_connection_id_fk" FOREIGN KEY ("oauth_connection_id") REFERENCES "public"."oauth_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_connection" ADD CONSTRAINT "oauth_connection_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_document" ADD CONSTRAINT "raw_document_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_document" ADD CONSTRAINT "raw_document_oauth_connection_id_oauth_connection_id_fk" FOREIGN KEY ("oauth_connection_id") REFERENCES "public"."oauth_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_attachment_raw_document_idx" ON "document_attachment" USING btree ("raw_document_id");--> statement-breakpoint
CREATE INDEX "document_attachment_parse_status_created_at_idx" ON "document_attachment" USING btree ("parse_status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "document_attachment_raw_document_sha256_unique" ON "document_attachment" USING btree ("raw_document_id","sha256_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "email_sync_cursor_connection_folder_unique" ON "email_sync_cursor" USING btree ("oauth_connection_id","folder_name");--> statement-breakpoint
CREATE INDEX "email_sync_cursor_last_seen_idx" ON "email_sync_cursor" USING btree ("last_seen_message_at");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_connection_user_provider_email_unique" ON "oauth_connection" USING btree ("user_id","provider","provider_account_email");--> statement-breakpoint
CREATE INDEX "oauth_connection_user_status_idx" ON "oauth_connection" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "raw_document_connection_message_unique" ON "raw_document" USING btree ("oauth_connection_id","provider_message_id");--> statement-breakpoint
CREATE INDEX "raw_document_user_message_timestamp_idx" ON "raw_document" USING btree ("user_id","message_timestamp");--> statement-breakpoint
CREATE INDEX "raw_document_user_thread_idx" ON "raw_document" USING btree ("user_id","thread_id");--> statement-breakpoint
CREATE INDEX "raw_document_document_hash_idx" ON "raw_document" USING btree ("document_hash");