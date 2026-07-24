CREATE TABLE `x_daily_tech_digest_cache` (
  `user_id` varchar(64) NOT NULL,
  `local_date` date NOT NULL,
  `digest` json NOT NULL,
  `generated_at` datetime NOT NULL,
  `expires_at` datetime NOT NULL,
  CONSTRAINT `x_daily_tech_digest_cache_user_date_pk`
    PRIMARY KEY (`user_id`, `local_date`),
  CONSTRAINT `x_daily_tech_digest_cache_user_id_users_id_fk`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX `x_daily_tech_digest_cache_expires_idx`
  ON `x_daily_tech_digest_cache` (`expires_at`);
