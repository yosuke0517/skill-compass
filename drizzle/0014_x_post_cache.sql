CREATE TABLE `x_public_post_cache` (
  `post_id` varchar(32) NOT NULL,
  `snapshot` json NOT NULL,
  `fetched_at` datetime NOT NULL,
  `expires_at` datetime NOT NULL,
  CONSTRAINT `x_public_post_cache_post_id` PRIMARY KEY (`post_id`)
);
--> statement-breakpoint
CREATE INDEX `x_public_post_cache_expires_idx`
  ON `x_public_post_cache` (`expires_at`);
