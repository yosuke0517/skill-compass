CREATE TABLE `oauth_connections` (
	`id` varchar(64) NOT NULL,
	`user_id` varchar(64) NOT NULL,
	`provider` varchar(32) NOT NULL,
	`access_token_ciphertext` text NOT NULL,
	`refresh_token_ciphertext` text,
	`token_type` varchar(32),
	`scope` text,
	`expires_at` datetime,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `oauth_connections_id` PRIMARY KEY(`id`),
	CONSTRAINT `oauth_connections_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_connections_user_provider_idx` ON `oauth_connections` (`user_id`,`provider`);
