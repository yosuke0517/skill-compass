ALTER TABLE `mcp_access_tokens`
  ADD COLUMN `family_id` varchar(64) NULL AFTER `token_hash`;
--> statement-breakpoint
CREATE TABLE `mcp_refresh_tokens` (
  `token_hash` varchar(64) NOT NULL,
  `family_id` varchar(64) NOT NULL,
  `client_id` varchar(191) NOT NULL,
  `user_id` varchar(64) NOT NULL,
  `family_expires_at` datetime NOT NULL,
  `expires_at` datetime NOT NULL,
  `consumed_at` datetime,
  `replacement_token_hash` varchar(64),
  `revoked_at` datetime,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `mcp_refresh_tokens_token_hash` PRIMARY KEY (`token_hash`),
  CONSTRAINT `mcp_refresh_tokens_client_id_mcp_oauth_clients_id_fk`
    FOREIGN KEY (`client_id`) REFERENCES `mcp_oauth_clients` (`id`)
    ON DELETE no action ON UPDATE no action,
  CONSTRAINT `mcp_refresh_tokens_user_id_users_id_fk`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX `mcp_refresh_tokens_family_idx`
  ON `mcp_refresh_tokens` (`family_id`);
--> statement-breakpoint
CREATE INDEX `mcp_refresh_tokens_user_idx`
  ON `mcp_refresh_tokens` (`user_id`);
