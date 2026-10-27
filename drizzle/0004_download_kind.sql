CREATE TYPE "public"."download_kind" AS ENUM('file', 'preview');--> statement-breakpoint
ALTER TABLE "downloads" ADD COLUMN "kind" "download_kind" DEFAULT 'file' NOT NULL;