CREATE TABLE `answers` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`quiz_day_id` text NOT NULL,
	`question_id` text NOT NULL,
	`selected_choice_id` text NOT NULL,
	`confidence` integer,
	`reasoning` text NOT NULL,
	`correct` integer,
	`reasoning_quality` text,
	`feedback` text,
	`score_delta` real,
	`next_review_on` integer,
	`answered_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`quiz_day_id`) REFERENCES `quiz_days`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `answers_user_quiz_day_idx` ON `answers` (`user_id`,`quiz_day_id`);--> statement-breakpoint
CREATE INDEX `answers_user_question_idx` ON `answers` (`user_id`,`question_id`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`metadata` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_logs_actor_idx` ON `audit_logs` (`actor_user_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_target_idx` ON `audit_logs` (`target_type`,`target_id`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`display_order` integer NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_name_unique` ON `categories` (`name`);--> statement-breakpoint
CREATE TABLE `concept_sources` (
	`concept_id` text NOT NULL,
	`source_id` text NOT NULL,
	PRIMARY KEY(`concept_id`, `source_id`),
	FOREIGN KEY (`concept_id`) REFERENCES `concepts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `concept_tags` (
	`concept_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`concept_id`, `tag_id`),
	FOREIGN KEY (`concept_id`) REFERENCES `concepts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `concepts` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`summary` text,
	`current_understanding` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `entitlements` (
	`id` text PRIMARY KEY NOT NULL,
	`description` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `export_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`output_path` text,
	`error` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`finished_at` integer
);
--> statement-breakpoint
CREATE TABLE `invites` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`token_hash` text NOT NULL,
	`invited_by_user_id` text,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`invited_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invites_token_hash_idx` ON `invites` (`token_hash`);--> statement-breakpoint
CREATE INDEX `invites_email_idx` ON `invites` (`email`);--> statement-breakpoint
CREATE TABLE `job_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`started_at` integer NOT NULL,
	`finished_at` integer
);
--> statement-breakpoint
CREATE TABLE `mcp_access_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`family_id` text,
	`client_id` text NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `mcp_oauth_clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `mcp_access_tokens_user_idx` ON `mcp_access_tokens` (`user_id`);--> statement-breakpoint
CREATE TABLE `mcp_authorization_codes` (
	`code_hash` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`user_id` text NOT NULL,
	`redirect_uri` text NOT NULL,
	`code_challenge` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	FOREIGN KEY (`client_id`) REFERENCES `mcp_oauth_clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `mcp_authorization_codes_user_idx` ON `mcp_authorization_codes` (`user_id`);--> statement-breakpoint
CREATE TABLE `mcp_oauth_clients` (
	`id` text PRIMARY KEY NOT NULL,
	`redirect_uris` text NOT NULL,
	`client_name` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mcp_refresh_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`client_id` text NOT NULL,
	`user_id` text NOT NULL,
	`family_expires_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`replacement_token_hash` text,
	`revoked_at` integer,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `mcp_oauth_clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `mcp_refresh_tokens_family_idx` ON `mcp_refresh_tokens` (`family_id`);--> statement-breakpoint
CREATE INDEX `mcp_refresh_tokens_user_idx` ON `mcp_refresh_tokens` (`user_id`);--> statement-breakpoint
CREATE TABLE `oauth_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`access_token_ciphertext` text NOT NULL,
	`refresh_token_ciphertext` text,
	`token_type` text,
	`scope` text,
	`expires_at` integer,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_connections_user_provider_idx` ON `oauth_connections` (`user_id`,`provider`);--> statement-breakpoint
CREATE TABLE `plan_entitlements` (
	`plan_id` text NOT NULL,
	`entitlement_id` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	PRIMARY KEY(`plan_id`, `entitlement_id`),
	FOREIGN KEY (`entitlement_id`) REFERENCES `entitlements`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `podcast_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`episode_id` text NOT NULL,
	`user_id` text NOT NULL,
	`language` text NOT NULL,
	`storage_provider` text NOT NULL,
	`storage_key` text NOT NULL,
	`media_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`duration_seconds` integer,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`episode_id`) REFERENCES `podcast_episodes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `podcast_assets_episode_idx` ON `podcast_assets` (`episode_id`);--> statement-breakpoint
CREATE TABLE `podcast_audio_chunks` (
	`episode_id` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`status` text NOT NULL,
	`storage_provider` text,
	`storage_key` text,
	`media_type` text,
	`size_bytes` integer,
	`attempts` integer DEFAULT 0 NOT NULL,
	`error_code` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`episode_id`, `chunk_index`),
	FOREIGN KEY (`episode_id`) REFERENCES `podcast_episodes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `podcast_chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`episode_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`text` text NOT NULL,
	`provider` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`episode_id`) REFERENCES `podcast_episodes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `podcast_chat_messages_episode_idx` ON `podcast_chat_messages` (`episode_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `podcast_episodes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`local_date` integer NOT NULL,
	`title` text NOT NULL,
	`language` text NOT NULL,
	`status` text NOT NULL,
	`source_snapshot` text NOT NULL,
	`script` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `podcast_episodes_user_idx` ON `podcast_episodes` (`user_id`,`local_date`);--> statement-breakpoint
CREATE TABLE `podcast_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`episode_id` text NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`idempotency_key` text NOT NULL,
	`next_run_at` integer NOT NULL,
	`lease_owner` text,
	`lease_expires_at` integer,
	`error_code` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`episode_id`) REFERENCES `podcast_episodes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `podcast_jobs_idempotency_idx` ON `podcast_jobs` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `podcast_jobs_claim_idx` ON `podcast_jobs` (`status`,`next_run_at`);--> statement-breakpoint
CREATE TABLE `podcast_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`generation_frequency` text DEFAULT 'daily' NOT NULL,
	`timezone` text DEFAULT 'Asia/Tokyo' NOT NULL,
	`duration_minutes` integer DEFAULT 10 NOT NULL,
	`language` text DEFAULT 'ja' NOT NULL,
	`use_sources` integer DEFAULT true NOT NULL,
	`include_news` integer DEFAULT true NOT NULL,
	`include_calendar` integer DEFAULT false NOT NULL,
	`include_x_public` integer DEFAULT false NOT NULL,
	`include_x_personal` integer DEFAULT false NOT NULL,
	`calendar_read_mode` text DEFAULT 'time_title' NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `questions` (
	`id` text PRIMARY KEY NOT NULL,
	`concept_id` text NOT NULL,
	`source_id` text,
	`scenario` text NOT NULL,
	`artifacts` text NOT NULL,
	`case_type` text NOT NULL,
	`decision_criteria` text NOT NULL,
	`practical_notes` text NOT NULL,
	`check_question` text NOT NULL,
	`prompt` text NOT NULL,
	`choices` text NOT NULL,
	`difficulty` text NOT NULL,
	`rationale` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`concept_id`) REFERENCES `concepts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `questions_concept_idx` ON `questions` (`concept_id`);--> statement-breakpoint
CREATE TABLE `quiz_day_questions` (
	`quiz_day_id` text NOT NULL,
	`question_id` text NOT NULL,
	`slot` integer NOT NULL,
	`reason` text NOT NULL,
	PRIMARY KEY(`quiz_day_id`, `question_id`),
	FOREIGN KEY (`quiz_day_id`) REFERENCES `quiz_days`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `quiz_days` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`quiz_date` integer NOT NULL,
	`prepared_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quiz_days_user_date_idx` ON `quiz_days` (`user_id`,`quiz_date`);--> statement-breakpoint
CREATE TABLE `scores` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`subject_type` text NOT NULL,
	`subject_id` text NOT NULL,
	`value` real NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scores_user_subject_idx` ON `scores` (`user_id`,`subject_type`,`subject_id`);--> statement-breakpoint
CREATE TABLE `self_assessments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`subject_type` text NOT NULL,
	`subject_id` text NOT NULL,
	`rating` real NOT NULL,
	`note` text,
	`assessed_on` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `self_assessments_user_subject_idx` ON `self_assessments` (`user_id`,`subject_type`,`subject_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `source_podcast_settings` (
	`user_id` text NOT NULL,
	`source_id` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`frequency` text DEFAULT 'daily' NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`user_id`, `source_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`trust_tier` text NOT NULL,
	`official` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`last_fetched_at` integer,
	`failure_reason` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`category_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tags_category_idx` ON `tags` (`category_id`);--> statement-breakpoint
CREATE TABLE `translation_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`source_hash` text NOT NULL,
	`source_text` text NOT NULL,
	`source_locale` text NOT NULL,
	`target_locale` text NOT NULL,
	`purpose` text NOT NULL,
	`translated_text` text NOT NULL,
	`provider` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_used_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `translation_cache_source_hash_idx` ON `translation_cache` (`source_hash`);--> statement-breakpoint
CREATE TABLE `user_entitlement_overrides` (
	`user_id` text NOT NULL,
	`entitlement_id` text NOT NULL,
	`enabled` integer NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`user_id`, `entitlement_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`entitlement_id`) REFERENCES `entitlements`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text,
	`password_hash` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`role` text DEFAULT 'normal' NOT NULL,
	`plan` text DEFAULT 'free' NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_idx` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `x_daily_tech_digest_cache` (
	`user_id` text NOT NULL,
	`local_date` integer NOT NULL,
	`digest` text NOT NULL,
	`generated_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `local_date`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `x_daily_tech_digest_cache_expires_idx` ON `x_daily_tech_digest_cache` (`expires_at`);--> statement-breakpoint
CREATE TABLE `x_public_post_cache` (
	`post_id` text PRIMARY KEY NOT NULL,
	`snapshot` text NOT NULL,
	`fetched_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `x_public_post_cache_expires_idx` ON `x_public_post_cache` (`expires_at`);