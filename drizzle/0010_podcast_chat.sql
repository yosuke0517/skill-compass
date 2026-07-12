CREATE TABLE `podcast_chat_messages` (
	`id` varchar(64) NOT NULL,
	`episode_id` varchar(64) NOT NULL,
	`user_id` varchar(64) NOT NULL,
	`role` varchar(16) NOT NULL,
	`text` text NOT NULL,
	`provider` varchar(32),
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `podcast_chat_messages_id` PRIMARY KEY(`id`),
	CONSTRAINT `podcast_chat_messages_episode_id_fk` FOREIGN KEY (`episode_id`) REFERENCES `podcast_episodes`(`id`),
	CONSTRAINT `podcast_chat_messages_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE INDEX `podcast_chat_messages_episode_idx` ON `podcast_chat_messages` (`episode_id`,`created_at`);
--> statement-breakpoint
INSERT INTO `entitlements` (`id`, `description`) VALUES ('podcast.chat', 'Podcast内容について質問する') ON DUPLICATE KEY UPDATE `description` = VALUES(`description`);
--> statement-breakpoint
INSERT INTO `plan_entitlements` (`plan_id`, `entitlement_id`, `enabled`) VALUES ('pro', 'podcast.chat', true) ON DUPLICATE KEY UPDATE `enabled` = VALUES(`enabled`);
