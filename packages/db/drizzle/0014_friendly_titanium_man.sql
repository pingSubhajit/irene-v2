ALTER TABLE "extracted_signal" ADD COLUMN "backing_account_last4_hint" text;--> statement-breakpoint
ALTER TABLE "extracted_signal" ADD COLUMN "backing_account_name_hint" text;--> statement-breakpoint
ALTER TABLE "extracted_signal" ADD COLUMN "account_relationship_hint" text;--> statement-breakpoint
ALTER TABLE "extracted_signal" ADD COLUMN "balance_evidence_strength" text;--> statement-breakpoint
ALTER TABLE "extracted_signal" ADD CONSTRAINT "extracted_signal_account_relationship_hint_check" CHECK ("extracted_signal"."account_relationship_hint" IS NULL OR "extracted_signal"."account_relationship_hint" in ('direct_account', 'linked_card_account', 'unknown'));--> statement-breakpoint
ALTER TABLE "extracted_signal" ADD CONSTRAINT "extracted_signal_balance_evidence_strength_check" CHECK ("extracted_signal"."balance_evidence_strength" IS NULL OR "extracted_signal"."balance_evidence_strength" in ('explicit', 'strong', 'weak'));