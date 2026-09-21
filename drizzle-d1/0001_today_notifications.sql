CREATE TABLE IF NOT EXISTS `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`time` text DEFAULT '09:00' NOT NULL,
	`next_run_at` integer NOT NULL,
	`last_error` text,
	`last_sent_date` text,
	`last_test_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `push_subscriptions_endpoint_idx` ON `push_subscriptions` (`endpoint`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `push_subscriptions_due_idx` ON `push_subscriptions` (`enabled`,`next_run_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `push_subscriptions_user_idx` ON `push_subscriptions` (`user_id`);
