CREATE TABLE `podcast_assets` (
	`id` varchar(64) NOT NULL,
	`episode_id` varchar(64) NOT NULL,
	`user_id` varchar(64) NOT NULL,
	`language` varchar(8) NOT NULL,
	`storage_provider` varchar(32) NOT NULL,
	`storage_key` varchar(1024) NOT NULL,
	`media_type` varchar(96) NOT NULL,
	`size_bytes` int NOT NULL,
	`duration_seconds` int,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `podcast_assets_id` PRIMARY KEY(`id`),
	CONSTRAINT `podcast_assets_episode_id_fk` FOREIGN KEY (`episode_id`) REFERENCES `podcast_episodes`(`id`),
	CONSTRAINT `podcast_assets_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE INDEX `podcast_assets_episode_idx` ON `podcast_assets` (`episode_id`);
