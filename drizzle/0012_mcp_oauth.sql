CREATE TABLE `mcp_oauth_clients` (
	`id` varchar(191) NOT NULL,
	`redirect_uris` json NOT NULL,
	`client_name` varchar(191) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `mcp_oauth_clients_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mcp_authorization_codes` (
	`code_hash` varchar(64) NOT NULL,
	`client_id` varchar(191) NOT NULL,
	`user_id` varchar(64) NOT NULL,
	`redirect_uri` text NOT NULL,
	`code_challenge` varchar(191) NOT NULL,
	`expires_at` datetime NOT NULL,
	`used_at` datetime,
	CONSTRAINT `mcp_authorization_codes_code_hash` PRIMARY KEY(`code_hash`),
	CONSTRAINT `mcp_authorization_codes_client_id_fk` FOREIGN KEY (`client_id`) REFERENCES `mcp_oauth_clients`(`id`),
	CONSTRAINT `mcp_authorization_codes_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE INDEX `mcp_authorization_codes_user_idx` ON `mcp_authorization_codes` (`user_id`);
--> statement-breakpoint
CREATE TABLE `mcp_access_tokens` (
	`token_hash` varchar(64) NOT NULL,
	`client_id` varchar(191) NOT NULL,
	`user_id` varchar(64) NOT NULL,
	`expires_at` datetime NOT NULL,
	`revoked_at` datetime,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `mcp_access_tokens_token_hash` PRIMARY KEY(`token_hash`),
	CONSTRAINT `mcp_access_tokens_client_id_fk` FOREIGN KEY (`client_id`) REFERENCES `mcp_oauth_clients`(`id`),
	CONSTRAINT `mcp_access_tokens_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE INDEX `mcp_access_tokens_user_idx` ON `mcp_access_tokens` (`user_id`);
