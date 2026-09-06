CREATE TYPE "public"."case_status" AS ENUM('open', 'open_emergency', 'assigned', 'acknowledged', 'in_progress', 'needs_follow_up', 'reassigned', 'escalated', 'escalated_up', 'resolved', 'closed', 'cancelled', 'duplicate');--> statement-breakpoint
CREATE TYPE "public"."channel_type" AS ENUM('pwa', 'ivr', 'whatsapp', 'ussd', 'sms', 'assisted', 'android');--> statement-breakpoint
CREATE TYPE "public"."file_kind" AS ENUM('audio', 'image', 'video', 'document');--> statement-breakpoint
CREATE TYPE "public"."interaction_status" AS ENUM('received', 'processing', 'completed', 'failed', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."language_code" AS ENUM('fr', 'ln', 'kg', 'sw', 'lua');--> statement-breakpoint
CREATE TYPE "public"."lifecycle_status" AS ENUM('draft', 'review', 'approved', 'canary', 'active', 'retired');--> statement-breakpoint
CREATE TYPE "public"."module_type" AS ENUM('health', 'agriculture', 'education', 'general');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('in_app', 'sms', 'whatsapp', 'email');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('queued', 'sent', 'failed', 'read');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('citizen', 'chw', 'agri_officer', 'teacher', 'ngo', 'gov_admin', 'platform_admin');--> statement-breakpoint
CREATE TYPE "public"."severity_level" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TABLE "acu_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"organisation_id" uuid,
	"interaction_id" uuid,
	"module" "module_type",
	"language" "language_code",
	"channel" "channel_type",
	"task" varchar(24) NOT NULL,
	"provider_key" varchar(32) NOT NULL,
	"units" real DEFAULT 0 NOT NULL,
	"acu" real DEFAULT 0 NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_config" (
	"key" varchar(96) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agri_clusters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"province" varchar(120),
	"territory" varchar(120),
	"crop" varchar(80),
	"issue" varchar(80) NOT NULL,
	"report_count" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"status" varchar(24) DEFAULT 'unverified' NOT NULL,
	"validated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agriculture_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"interaction_id" uuid NOT NULL,
	"case_id" uuid,
	"crop_type" varchar(80),
	"issue_type" varchar(80),
	"evidence_file_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"province" varchar(120),
	"ai_diagnosis" text,
	"recommendation" text,
	"confidence" real,
	"urgent" boolean DEFAULT false NOT NULL,
	"follow_up_status" varchar(32) DEFAULT 'none' NOT NULL,
	"territory" varchar(120),
	"season" varchar(32),
	"growth_stage" varchar(48),
	"affected_proportion" varchar(32),
	"recent_inputs" text,
	"candidates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"top_prob" real,
	"is_notifiable" boolean DEFAULT false NOT NULL,
	"evidence_quality" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"missing_evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"actions_to_avoid" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tiered_actions" jsonb DEFAULT '{"noCost":[],"lowCost":[],"purchase":[]}'::jsonb NOT NULL,
	"follow_up_outcome" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid,
	"interaction_id" uuid,
	"worker_id" uuid NOT NULL,
	"field" varchar(48) NOT NULL,
	"ai_value" text,
	"human_value" text,
	"reason_code" varchar(48),
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"interaction_id" uuid,
	"capability" varchar(32) NOT NULL,
	"provider_key" varchar(32) NOT NULL,
	"model" varchar(80),
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"audio_seconds" real DEFAULT 0 NOT NULL,
	"estimated_cost_usd" real DEFAULT 0 NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"success" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_request_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"method" varchar(8) NOT NULL,
	"path" varchar(240) NOT NULL,
	"user_id" uuid,
	"role" varchar(32),
	"status_code" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"ip" varchar(64),
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" varchar(96) NOT NULL,
	"actor_user_id" uuid,
	"actor_role" varchar(32),
	"entity_type" varchar(48),
	"entity_id" varchar(64),
	"before_value" jsonb,
	"after_value" jsonb,
	"system_event" varchar(96),
	"ai_summary" text,
	"ip" varchar(64),
	"tenant_id" uuid,
	"trace_id" varchar(64),
	"purpose" varchar(120),
	"prev_hash" varchar(64),
	"hash" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "autosave_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"client_key" varchar(120) NOT NULL,
	"module" "module_type" DEFAULT 'general' NOT NULL,
	"language" "language_code",
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "break_glass_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"justification" text NOT NULL,
	"scope" varchar(160) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"type" varchar(48) NOT NULL,
	"from_value" text,
	"to_value" text,
	"actor_user_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module" "module_type" NOT NULL,
	"user_id" uuid,
	"interaction_id" uuid,
	"title" varchar(240) NOT NULL,
	"severity" "severity_level" DEFAULT 'medium' NOT NULL,
	"status" "case_status" DEFAULT 'open' NOT NULL,
	"escalation_level" integer DEFAULT 0 NOT NULL,
	"assigned_to" uuid,
	"province" varchar(120),
	"notes" text,
	"follow_up_date" timestamp with time zone,
	"resolution" text,
	"outcome" varchar(120),
	"tenant_id" uuid,
	"organisation_id" uuid,
	"territory" varchar(120),
	"queue" varchar(160),
	"severity_level" integer DEFAULT 2 NOT NULL,
	"ai_severity_level" integer,
	"overridden_severity_level" integer,
	"override_reason" text,
	"sla_due_at" timestamp with time zone,
	"sla_breached" boolean DEFAULT false NOT NULL,
	"sla_paused_reason" varchar(120),
	"acknowledged_at" timestamp with time zone,
	"acknowledged_by" uuid,
	"resolved_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"action_taken" text,
	"citizen_reachability" varchar(32),
	"follow_up_decision" varchar(64),
	"safeguarding" boolean DEFAULT false NOT NULL,
	"is_notifiable" boolean DEFAULT false NOT NULL,
	"merged_into" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "citizen_identifiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" varchar(24) NOT NULL,
	"value_hash" varchar(128) NOT NULL,
	"value_last4" varchar(4),
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" varchar(32) NOT NULL,
	"status" varchar(16) NOT NULL,
	"version" varchar(16) DEFAULT '1.0' NOT NULL,
	"method" varchar(24) NOT NULL,
	"language" "language_code" DEFAULT 'fr' NOT NULL,
	"proxy" jsonb,
	"evidence_uri" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(16) NOT NULL,
	"status" varchar(16) DEFAULT 'open' NOT NULL,
	"method" varchar(24) DEFAULT 'voice' NOT NULL,
	"legal_hold" boolean DEFAULT false NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "education_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"interaction_id" uuid NOT NULL,
	"learner_age_group" varchar(32),
	"subject" varchar(80),
	"topic" varchar(160),
	"difficulty_level" varchar(32),
	"explanation" text,
	"quiz" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"progress_signal" varchar(32),
	"province" varchar(120),
	"mode" varchar(24) DEFAULT 'explain' NOT NULL,
	"objective" text,
	"score" real,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"mastery_signal" varchar(24),
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"suite" varchar(96) NOT NULL,
	"module" "module_type",
	"language" "language_code",
	"model_version" varchar(96),
	"prompt_version" varchar(48),
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"passed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_store" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"event_type" varchar(96) NOT NULL,
	"event_version" integer DEFAULT 1 NOT NULL,
	"aggregate_type" varchar(48),
	"aggregate_id" varchar(64),
	"aggregate_version" integer,
	"tenant_id" uuid,
	"actor" jsonb DEFAULT '{"type":"system"}'::jsonb NOT NULL,
	"trace_id" varchar(64),
	"correlation_id" varchar(64),
	"causation_id" varchar(64),
	"channel" "channel_type",
	"language" "language_code",
	"module" "module_type",
	"classification" varchar(24) DEFAULT 'internal' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_store_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"interaction_id" uuid,
	"user_id" uuid,
	"rating" integer,
	"useful" boolean,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"interaction_id" uuid,
	"kind" "file_kind" NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" varchar(120) NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follow_ups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"user_id" uuid,
	"scheduled_for" timestamp with time zone NOT NULL,
	"channel" "notification_channel" DEFAULT 'sms' NOT NULL,
	"status" varchar(16) DEFAULT 'scheduled' NOT NULL,
	"outcome" varchar(120),
	"outcome_text" text,
	"captured_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_triage_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"interaction_id" uuid NOT NULL,
	"case_id" uuid,
	"symptoms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"age_group" varchar(32),
	"pregnancy_status" varchar(32),
	"emergency_flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"topic" varchar(64),
	"recommendation" text,
	"referral_status" varchar(32) DEFAULT 'none' NOT NULL,
	"follow_up_status" varchar(32) DEFAULT 'none' NOT NULL,
	"province" varchar(120),
	"territory" varchar(120),
	"health_zone" varchar(120),
	"protocol_id" varchar(64),
	"protocol_version" varchar(24),
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"severity_level" integer,
	"risk_band" varchar(32),
	"triggered_rule_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"time_to_action" varchar(32),
	"care_destination_type" varchar(32),
	"referral_facility_id" uuid,
	"follow_up_at" timestamp with time zone,
	"follow_up_outcome" varchar(120),
	"safeguarding" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"key" varchar(160) PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"request_hash" varchar(64),
	"response_status" integer,
	"response_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "input_registry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"active_ingredient" varchar(160),
	"category" varchar(48) NOT NULL,
	"target_crops" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"target_issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"authorisation_status" varchar(32) DEFAULT 'unverified' NOT NULL,
	"label_instructions" text,
	"ppe" text,
	"pre_harvest_interval_days" integer,
	"re_entry_hours" integer,
	"source" varchar(160),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"user_role" "user_role" DEFAULT 'citizen' NOT NULL,
	"module" "module_type" DEFAULT 'general' NOT NULL,
	"channel" varchar(16) DEFAULT 'text' NOT NULL,
	"language" "language_code",
	"language_confidence" real,
	"province" varchar(120),
	"audio_file_id" uuid,
	"attachment_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"original_input" text,
	"transcript" text,
	"translation_fr" text,
	"intent" varchar(120),
	"understanding" text,
	"response" text,
	"response_language" "language_code",
	"structured" jsonb,
	"follow_up_questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence" real,
	"risk_score" real,
	"severity" "severity_level",
	"escalation_required" boolean DEFAULT false NOT NULL,
	"case_id" uuid,
	"status" "interaction_status" DEFAULT 'received' NOT NULL,
	"summary" text,
	"error_message" text,
	"latency_ms" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"audit_status" varchar(32) DEFAULT 'recorded' NOT NULL,
	"session_id" uuid,
	"seq" integer DEFAULT 1 NOT NULL,
	"idempotency_key" varchar(120),
	"transcript_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence_dimensions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"prompt_version" varchar(48),
	"protocol_version" varchar(48),
	"model_route" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"acu" real DEFAULT 0 NOT NULL,
	"failure_reason" varchar(64),
	"trace_id" varchar(64),
	"safeguarding" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kb_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"doc_id" varchar(96) NOT NULL,
	"module" "module_type" NOT NULL,
	"chunk_index" integer NOT NULL,
	"text" text NOT NULL,
	"language" "language_code" DEFAULT 'fr' NOT NULL,
	"checksum" varchar(64)
);
--> statement-breakpoint
CREATE TABLE "kb_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_id" varchar(96) NOT NULL,
	"module" "module_type" NOT NULL,
	"title" varchar(240) NOT NULL,
	"authority" varchar(160) NOT NULL,
	"source" varchar(240),
	"version" varchar(24) DEFAULT '1.0' NOT NULL,
	"language" "language_code" DEFAULT 'fr' NOT NULL,
	"geography" varchar(120) DEFAULT 'RDC' NOT NULL,
	"effective_from" timestamp with time zone,
	"review_date" timestamp with time zone,
	"evidence_grade" varchar(16) DEFAULT 'B' NOT NULL,
	"status" "lifecycle_status" DEFAULT 'approved' NOT NULL,
	"approved_by" varchar(160),
	"checksum" varchar(64),
	"supersedes" varchar(96),
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kb_documents_doc_id_unique" UNIQUE("doc_id")
);
--> statement-breakpoint
CREATE TABLE "language_corpus" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"interaction_id" uuid,
	"audio_file_id" uuid,
	"language" "language_code" NOT NULL,
	"source_text" text NOT NULL,
	"translation_fr" text,
	"corrected_source_text" text,
	"corrected_translation_fr" text,
	"corrected_language" "language_code",
	"province" varchar(120),
	"intent" varchar(120),
	"module" "module_type" DEFAULT 'general' NOT NULL,
	"system_confidence" real,
	"review_status" varchar(16) DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"citizen_flagged" boolean DEFAULT false NOT NULL,
	"speech_rating" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "language_lexicon" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"language" "language_code" NOT NULL,
	"term" varchar(160) NOT NULL,
	"meaning_fr" varchar(240) NOT NULL,
	"domain" "module_type" DEFAULT 'general' NOT NULL,
	"region" varchar(120),
	"pronunciation" varchar(160),
	"verified" boolean DEFAULT false NOT NULL,
	"added_by" uuid,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learner_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"age_band" varchar(16),
	"level" varchar(32),
	"instruction_language" "language_code" DEFAULT 'fr' NOT NULL,
	"explain_language" "language_code" DEFAULT 'fr' NOT NULL,
	"school_organisation_id" uuid,
	"exam_target" varchar(32),
	"exam_date" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"session_id" uuid,
	"subject" varchar(80) NOT NULL,
	"topic" varchar(160) NOT NULL,
	"objective" text,
	"rubric" varchar(160),
	"difficulty" varchar(24),
	"assistance_level" varchar(24),
	"response" text,
	"result" varchar(24) NOT NULL,
	"misconception" varchar(160),
	"model_version" varchar(64),
	"teacher_verified" boolean DEFAULT false NOT NULL,
	"territory" varchar(120),
	"province" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market" varchar(120) NOT NULL,
	"commodity" varchar(80) NOT NULL,
	"unit" varchar(32) NOT NULL,
	"price_cdf" real NOT NULL,
	"grade" varchar(48),
	"source" varchar(160) NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task" varchar(32) NOT NULL,
	"language" "language_code",
	"primary_provider" varchar(32) NOT NULL,
	"primary_model" varchar(96) NOT NULL,
	"fallback_provider" varchar(32),
	"fallback_model" varchar(96),
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"acu_rate" real DEFAULT 1 NOT NULL,
	"is_live" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(96) NOT NULL,
	"channel" "notification_channel" DEFAULT 'sms' NOT NULL,
	"language" "language_code" DEFAULT 'fr' NOT NULL,
	"module" "module_type" DEFAULT 'general' NOT NULL,
	"risk_level" varchar(16),
	"sensitivity" varchar(16) DEFAULT 'normal' NOT NULL,
	"title" varchar(240),
	"body" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" "lifecycle_status" DEFAULT 'approved' NOT NULL,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"channel" "notification_channel" DEFAULT 'in_app' NOT NULL,
	"type" varchar(48) NOT NULL,
	"title" varchar(240) NOT NULL,
	"body" text NOT NULL,
	"status" "notification_status" DEFAULT 'queued' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sent_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"template_key" varchar(96),
	"language" "language_code",
	"tenant_id" uuid,
	"to" varchar(160),
	"attempts" integer DEFAULT 0 NOT NULL,
	"scheduled_for" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"provider_message_id" varchar(160),
	"failure_reason" varchar(240),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organisations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"parent_id" uuid,
	"name" varchar(160) NOT NULL,
	"type" varchar(32) DEFAULT 'ngo' NOT NULL,
	"province_scope" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"territory_scope" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"routing_skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planting_calendars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"province" varchar(120) NOT NULL,
	"crop" varchar(80) NOT NULL,
	"sow_windows" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"source" varchar(160),
	"version" varchar(16) DEFAULT '1.0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(96) NOT NULL,
	"version" varchar(24) NOT NULL,
	"module" "module_type" DEFAULT 'general' NOT NULL,
	"body" text NOT NULL,
	"status" "lifecycle_status" DEFAULT 'draft' NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "protocol_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"protocol_id" varchar(64) NOT NULL,
	"version" varchar(24) NOT NULL,
	"module" "module_type" DEFAULT 'health' NOT NULL,
	"title" varchar(200) NOT NULL,
	"definition" jsonb NOT NULL,
	"status" "lifecycle_status" DEFAULT 'draft' NOT NULL,
	"approved_by" varchar(120),
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provinces" (
	"code" varchar(8) PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"capital" varchar(120),
	CONSTRAINT "provinces_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "report_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"type" varchar(64) NOT NULL,
	"format" varchar(8) DEFAULT 'pdf' NOT NULL,
	"cadence" varchar(16) DEFAULT 'weekly' NOT NULL,
	"scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"organisation_id" uuid,
	"recipients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" varchar(64) NOT NULL,
	"format" varchar(8) DEFAULT 'pdf' NOT NULL,
	"scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"period" jsonb,
	"status" varchar(16) DEFAULT 'queued' NOT NULL,
	"requested_by" uuid,
	"definition_id" uuid,
	"storage_key" text,
	"size_bytes" integer,
	"error" text,
	"purpose" varchar(120),
	"expires_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"interaction_id" uuid,
	"case_id" uuid,
	"rule_pack_version" varchar(32) NOT NULL,
	"triggered_rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dimensions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"band" varchar(32) NOT NULL,
	"severity_level" integer NOT NULL,
	"score" real NOT NULL,
	"escalate" boolean DEFAULT false NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"superseded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "safeguarding_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"interaction_id" uuid,
	"case_id" uuid,
	"category" varchar(48) NOT NULL,
	"is_child" boolean DEFAULT false NOT NULL,
	"owner_role" varchar(32) DEFAULT 'teacher' NOT NULL,
	"status" varchar(24) DEFAULT 'open' NOT NULL,
	"restricted_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"case_id" uuid,
	"kind" varchar(32) NOT NULL,
	"channel" "notification_channel" DEFAULT 'sms' NOT NULL,
	"language" "language_code" DEFAULT 'fr' NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(16) DEFAULT 'scheduled' NOT NULL,
	"fired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_directory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" varchar(32) NOT NULL,
	"name" varchar(200) NOT NULL,
	"province" varchar(120) NOT NULL,
	"territory" varchar(120),
	"health_zone" varchar(120),
	"phone" varchar(32),
	"notes" text,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"user_id" uuid,
	"channel" "channel_type" DEFAULT 'pwa' NOT NULL,
	"channel_ref" varchar(160),
	"language" "language_code",
	"module" "module_type",
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"province" varchar(120),
	"territory" varchar(120),
	"capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"proxy" jsonb,
	"consent_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"turn_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_turn_at" timestamp with time zone,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "stories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"language" "language_code" NOT NULL,
	"title" varchar(200) NOT NULL,
	"level" varchar(32) DEFAULT 'primaire' NOT NULL,
	"body" text NOT NULL,
	"licence" varchar(80) DEFAULT 'programme' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_events" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"device_id" varchar(96) NOT NULL,
	"user_id" uuid,
	"local_seq" integer NOT NULL,
	"client_timestamp" timestamp with time zone NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"type" varchar(64) NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(16) DEFAULT 'accepted' NOT NULL,
	"conflict_reason" varchar(240),
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"type" varchar(48) NOT NULL,
	"owner_user_id" uuid,
	"queue" varchar(160),
	"priority" varchar(16) DEFAULT 'normal' NOT NULL,
	"due_at" timestamp with time zone,
	"status" varchar(16) DEFAULT 'open' NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"type" varchar(32) DEFAULT 'programme' NOT NULL,
	"legal_name" varchar(240),
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"acu_monthly_cap" real,
	"entitlements" jsonb DEFAULT '["health","agriculture","education"]'::jsonb NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "territories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"province_code" varchar(8) NOT NULL,
	"name" varchar(120) NOT NULL,
	"type" varchar(24) DEFAULT 'territoire' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" varchar(32),
	"name" varchar(160),
	"is_anonymous" boolean DEFAULT false NOT NULL,
	"role" "user_role" DEFAULT 'citizen' NOT NULL,
	"language_preference" "language_code" DEFAULT 'fr' NOT NULL,
	"province" varchar(120),
	"territory" varchar(120),
	"region" varchar(120),
	"organisation" varchar(160),
	"consent_status" varchar(32) DEFAULT 'pending' NOT NULL,
	"pin_hash" text,
	"preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_activity_at" timestamp with time zone,
	"tenant_id" uuid,
	"organisation_id" uuid,
	"territories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"on_duty" boolean DEFAULT true NOT NULL,
	"pseudo_id" varchar(64),
	"age_band" varchar(16),
	"sex" varchar(16),
	"mfa_enabled" boolean DEFAULT false NOT NULL,
	"mfa_secret" text,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_unique" UNIQUE("phone"),
	CONSTRAINT "users_pseudo_id_unique" UNIQUE("pseudo_id")
);
--> statement-breakpoint
ALTER TABLE "agriculture_reports" ADD CONSTRAINT "agriculture_reports_interaction_id_interactions_id_fk" FOREIGN KEY ("interaction_id") REFERENCES "public"."interactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autosave_drafts" ADD CONSTRAINT "autosave_drafts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_events" ADD CONSTRAINT "case_events_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_interaction_id_interactions_id_fk" FOREIGN KEY ("interaction_id") REFERENCES "public"."interactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citizen_identifiers" ADD CONSTRAINT "citizen_identifiers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "education_sessions" ADD CONSTRAINT "education_sessions_interaction_id_interactions_id_fk" FOREIGN KEY ("interaction_id") REFERENCES "public"."interactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_interaction_id_interactions_id_fk" FOREIGN KEY ("interaction_id") REFERENCES "public"."interactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_triage_records" ADD CONSTRAINT "health_triage_records_interaction_id_interactions_id_fk" FOREIGN KEY ("interaction_id") REFERENCES "public"."interactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_chunks" ADD CONSTRAINT "kb_chunks_document_id_kb_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."kb_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_profiles" ADD CONSTRAINT "learner_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organisations" ADD CONSTRAINT "organisations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "territories" ADD CONSTRAINT "territories_province_code_provinces_code_fk" FOREIGN KEY ("province_code") REFERENCES "public"."provinces"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "acu_ledger_time_idx" ON "acu_ledger" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "acu_ledger_tenant_idx" ON "acu_ledger" USING btree ("tenant_id","occurred_at");--> statement-breakpoint
CREATE INDEX "api_logs_created_idx" ON "api_request_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "autosave_user_key_idx" ON "autosave_drafts" USING btree ("user_id","client_key");--> statement-breakpoint
CREATE INDEX "cases_queue_idx" ON "cases" USING btree ("queue");--> statement-breakpoint
CREATE INDEX "cases_sla_idx" ON "cases" USING btree ("sla_due_at");--> statement-breakpoint
CREATE INDEX "cases_status_idx" ON "cases" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cases_module_idx" ON "cases" USING btree ("module");--> statement-breakpoint
CREATE INDEX "cases_assigned_idx" ON "cases" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "citizen_identifiers_kind_hash_idx" ON "citizen_identifiers" USING btree ("kind","value_hash");--> statement-breakpoint
CREATE INDEX "consents_user_purpose_idx" ON "consents" USING btree ("user_id","purpose");--> statement-breakpoint
CREATE INDEX "event_store_type_idx" ON "event_store" USING btree ("event_type","occurred_at");--> statement-breakpoint
CREATE INDEX "event_store_aggregate_idx" ON "event_store" USING btree ("aggregate_type","aggregate_id");--> statement-breakpoint
CREATE INDEX "interactions_session_idx" ON "interactions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "interactions_user_idx" ON "interactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "interactions_module_idx" ON "interactions" USING btree ("module");--> statement-breakpoint
CREATE INDEX "interactions_created_idx" ON "interactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "interactions_status_idx" ON "interactions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "kb_chunks_doc_idx" ON "kb_chunks" USING btree ("doc_id","chunk_index");--> statement-breakpoint
CREATE INDEX "kb_documents_module_idx" ON "kb_documents" USING btree ("module","status");--> statement-breakpoint
CREATE INDEX "corpus_lang_status_idx" ON "language_corpus" USING btree ("language","review_status");--> statement-breakpoint
CREATE INDEX "corpus_interaction_idx" ON "language_corpus" USING btree ("interaction_id");--> statement-breakpoint
CREATE INDEX "lexicon_lang_term_idx" ON "language_lexicon" USING btree ("language","term");--> statement-breakpoint
CREATE INDEX "learning_evidence_user_idx" ON "learning_evidence" USING btree ("user_id","topic");--> statement-breakpoint
CREATE INDEX "market_prices_commodity_idx" ON "market_prices" USING btree ("commodity","observed_at");--> statement-breakpoint
CREATE INDEX "notification_templates_key_idx" ON "notification_templates" USING btree ("key","channel","language");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "notifications_scheduled_idx" ON "notifications" USING btree ("scheduled_for");--> statement-breakpoint
CREATE INDEX "prompt_versions_idx" ON "prompt_versions" USING btree ("name","version");--> statement-breakpoint
CREATE INDEX "protocol_versions_idx" ON "protocol_versions" USING btree ("protocol_id","version");--> statement-breakpoint
CREATE INDEX "schedules_due_idx" ON "schedules" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE INDEX "service_directory_geo_idx" ON "service_directory" USING btree ("province","type");--> statement-breakpoint
CREATE INDEX "sessions_channel_ref_idx" ON "sessions" USING btree ("channel","channel_ref");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sync_events_device_idx" ON "sync_events" USING btree ("device_id","local_seq");--> statement-breakpoint
CREATE INDEX "tasks_case_idx" ON "tasks" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "tasks_owner_idx" ON "tasks" USING btree ("owner_user_id","status");--> statement-breakpoint
CREATE INDEX "territories_province_idx" ON "territories" USING btree ("province_code");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "users_province_idx" ON "users" USING btree ("province");--> statement-breakpoint
CREATE INDEX "users_org_idx" ON "users" USING btree ("organisation_id");