CREATE TABLE `podcast_episodes` (
	`id` varchar(64) NOT NULL,
	`user_id` varchar(64) NOT NULL,
	`local_date` date NOT NULL,
	`title` varchar(240) NOT NULL,
	`language` varchar(8) NOT NULL,
	`status` varchar(32) NOT NULL,
	`source_snapshot` json NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `podcast_episodes_id` PRIMARY KEY(`id`),
	CONSTRAINT `podcast_episodes_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE INDEX `podcast_episodes_user_idx` ON `podcast_episodes` (`user_id`,`local_date`);
--> statement-breakpoint
CREATE TABLE `podcast_jobs` (
	`id` varchar(64) NOT NULL,
	`episode_id` varchar(64) NOT NULL,
	`user_id` varchar(64) NOT NULL,
	`kind` varchar(48) NOT NULL,
	`status` varchar(32) NOT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	`idempotency_key` varchar(160) NOT NULL,
	`next_run_at` datetime NOT NULL,
	`lease_owner` varchar(96),
	`lease_expires_at` datetime,
	`error_code` varchar(96),
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `podcast_jobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `podcast_jobs_episode_id_fk` FOREIGN KEY (`episode_id`) REFERENCES `podcast_episodes`(`id`),
	CONSTRAINT `podcast_jobs_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`),
	CONSTRAINT `podcast_jobs_idempotency_idx` UNIQUE(`idempotency_key`)
);
--> statement-breakpoint
CREATE INDEX `podcast_jobs_claim_idx` ON `podcast_jobs` (`status`,`next_run_at`);
