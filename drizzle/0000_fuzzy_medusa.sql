CREATE TABLE `answers` (
	`id` varchar(64) NOT NULL,
	`quiz_day_id` varchar(64) NOT NULL,
	`question_id` varchar(64) NOT NULL,
	`selected_choice_id` varchar(16) NOT NULL,
	`confidence` int NOT NULL,
	`reasoning` text NOT NULL,
	`correct` boolean,
	`reasoning_quality` varchar(32),
	`feedback` text,
	`score_delta` double,
	`next_review_on` date,
	`answered_at` datetime NOT NULL,
	CONSTRAINT `answers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` varchar(64) NOT NULL,
	`name` varchar(64) NOT NULL,
	`description` text,
	`display_order` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `categories_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `concept_sources` (
	`concept_id` varchar(64) NOT NULL,
	`source_id` varchar(64) NOT NULL,
	CONSTRAINT `concept_sources_concept_id_source_id_pk` PRIMARY KEY(`concept_id`,`source_id`)
);
--> statement-breakpoint
CREATE TABLE `concept_tags` (
	`concept_id` varchar(64) NOT NULL,
	`tag_id` varchar(64) NOT NULL,
	CONSTRAINT `concept_tags_concept_id_tag_id_pk` PRIMARY KEY(`concept_id`,`tag_id`)
);
--> statement-breakpoint
CREATE TABLE `concepts` (
	`id` varchar(64) NOT NULL,
	`title` varchar(160) NOT NULL,
	`summary` text,
	`current_understanding` text,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `concepts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `export_runs` (
	`id` varchar(64) NOT NULL,
	`status` enum('pending','running','succeeded','failed') NOT NULL,
	`output_path` varchar(1024),
	`error` text,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`finished_at` datetime,
	CONSTRAINT `export_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `job_runs` (
	`id` varchar(64) NOT NULL,
	`name` varchar(96) NOT NULL,
	`status` enum('pending','running','succeeded','failed') NOT NULL,
	`error` text,
	`started_at` datetime NOT NULL,
	`finished_at` datetime,
	CONSTRAINT `job_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `questions` (
	`id` varchar(64) NOT NULL,
	`concept_id` varchar(64) NOT NULL,
	`source_id` varchar(64),
	`prompt` text NOT NULL,
	`choices` json NOT NULL,
	`difficulty` enum('beginner','intermediate','advanced') NOT NULL,
	`rationale` text NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `questions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `quiz_day_questions` (
	`quiz_day_id` varchar(64) NOT NULL,
	`question_id` varchar(64) NOT NULL,
	`slot` int NOT NULL,
	`reason` varchar(64) NOT NULL,
	CONSTRAINT `quiz_day_questions_quiz_day_id_question_id_pk` PRIMARY KEY(`quiz_day_id`,`question_id`)
);
--> statement-breakpoint
CREATE TABLE `quiz_days` (
	`id` varchar(64) NOT NULL,
	`quiz_date` date NOT NULL,
	`prepared_at` datetime NOT NULL,
	CONSTRAINT `quiz_days_id` PRIMARY KEY(`id`),
	CONSTRAINT `quiz_days_quiz_date_idx` UNIQUE(`quiz_date`)
);
--> statement-breakpoint
CREATE TABLE `scores` (
	`id` varchar(64) NOT NULL,
	`subject_type` enum('category','tag','concept') NOT NULL,
	`subject_id` varchar(64) NOT NULL,
	`value` double NOT NULL,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `scores_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `self_assessments` (
	`id` varchar(64) NOT NULL,
	`subject_type` enum('category','tag') NOT NULL,
	`subject_id` varchar(64) NOT NULL,
	`rating` double NOT NULL,
	`note` text,
	`assessed_on` date NOT NULL,
	CONSTRAINT `self_assessments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` varchar(128) NOT NULL,
	`expires_at` datetime NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sources` (
	`id` varchar(64) NOT NULL,
	`title` varchar(240) NOT NULL,
	`url` varchar(1024) NOT NULL,
	`trust_tier` enum('tier1','tier2','tier3','tier4') NOT NULL,
	`official` boolean NOT NULL DEFAULT false,
	`status` enum('active','failed','pending') NOT NULL DEFAULT 'pending',
	`last_fetched_at` datetime,
	`failure_reason` text,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `sources_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` varchar(64) NOT NULL,
	`category_id` varchar(64) NOT NULL,
	`name` varchar(96) NOT NULL,
	`description` text,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `tags_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `answers` ADD CONSTRAINT `answers_quiz_day_id_quiz_days_id_fk` FOREIGN KEY (`quiz_day_id`) REFERENCES `quiz_days`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `answers` ADD CONSTRAINT `answers_question_id_questions_id_fk` FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `concept_sources` ADD CONSTRAINT `concept_sources_concept_id_concepts_id_fk` FOREIGN KEY (`concept_id`) REFERENCES `concepts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `concept_sources` ADD CONSTRAINT `concept_sources_source_id_sources_id_fk` FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `concept_tags` ADD CONSTRAINT `concept_tags_concept_id_concepts_id_fk` FOREIGN KEY (`concept_id`) REFERENCES `concepts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `concept_tags` ADD CONSTRAINT `concept_tags_tag_id_tags_id_fk` FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `questions` ADD CONSTRAINT `questions_concept_id_concepts_id_fk` FOREIGN KEY (`concept_id`) REFERENCES `concepts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `questions` ADD CONSTRAINT `questions_source_id_sources_id_fk` FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quiz_day_questions` ADD CONSTRAINT `quiz_day_questions_quiz_day_id_quiz_days_id_fk` FOREIGN KEY (`quiz_day_id`) REFERENCES `quiz_days`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quiz_day_questions` ADD CONSTRAINT `quiz_day_questions_question_id_questions_id_fk` FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tags` ADD CONSTRAINT `tags_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `answers_quiz_day_idx` ON `answers` (`quiz_day_id`);--> statement-breakpoint
CREATE INDEX `answers_question_idx` ON `answers` (`question_id`);--> statement-breakpoint
CREATE INDEX `questions_concept_idx` ON `questions` (`concept_id`);--> statement-breakpoint
CREATE INDEX `scores_subject_idx` ON `scores` (`subject_type`,`subject_id`);--> statement-breakpoint
CREATE INDEX `self_assessments_subject_idx` ON `self_assessments` (`subject_type`,`subject_id`);--> statement-breakpoint
CREATE INDEX `tags_category_idx` ON `tags` (`category_id`);