CREATE TABLE `podcast_settings` (
	`user_id` varchar(64) NOT NULL,
	`generation_frequency` varchar(32) NOT NULL DEFAULT 'daily',
	`timezone` varchar(64) NOT NULL DEFAULT 'Asia/Tokyo',
	`duration_minutes` int NOT NULL DEFAULT 10,
	`language` varchar(8) NOT NULL DEFAULT 'ja',
	`use_sources` boolean NOT NULL DEFAULT true,
	`include_news` boolean NOT NULL DEFAULT true,
	`include_calendar` boolean NOT NULL DEFAULT false,
	`include_x_public` boolean NOT NULL DEFAULT false,
	`include_x_personal` boolean NOT NULL DEFAULT false,
	`calendar_read_mode` varchar(32) NOT NULL DEFAULT 'time_title',
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `podcast_settings_user_id` PRIMARY KEY(`user_id`),
	CONSTRAINT `podcast_settings_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE TABLE `source_podcast_settings` (
	`user_id` varchar(64) NOT NULL,
	`source_id` varchar(64) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`frequency` varchar(32) NOT NULL DEFAULT 'daily',
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `source_podcast_settings_user_id_source_id_pk` PRIMARY KEY(`user_id`,`source_id`),
	CONSTRAINT `source_podcast_settings_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`),
	CONSTRAINT `source_podcast_settings_source_id_fk` FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`)
);
