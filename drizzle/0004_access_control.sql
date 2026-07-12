ALTER TABLE `users` ADD `role` varchar(32) NOT NULL DEFAULT 'normal';
--> statement-breakpoint
ALTER TABLE `users` ADD `plan` varchar(32) NOT NULL DEFAULT 'free';
--> statement-breakpoint
CREATE TABLE `entitlements` (
	`id` varchar(96) NOT NULL,
	`description` varchar(255) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `entitlements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `plan_entitlements` (
	`plan_id` varchar(32) NOT NULL,
	`entitlement_id` varchar(96) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	CONSTRAINT `plan_entitlements_plan_id_entitlement_id_pk` PRIMARY KEY(`plan_id`,`entitlement_id`),
	CONSTRAINT `plan_entitlements_entitlement_id_fk` FOREIGN KEY (`entitlement_id`) REFERENCES `entitlements`(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_entitlement_overrides` (
	`user_id` varchar(64) NOT NULL,
	`entitlement_id` varchar(96) NOT NULL,
	`enabled` boolean NOT NULL,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_entitlement_overrides_user_id_entitlement_id_pk` PRIMARY KEY(`user_id`,`entitlement_id`),
	CONSTRAINT `user_entitlement_overrides_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`),
	CONSTRAINT `user_entitlement_overrides_entitlement_id_fk` FOREIGN KEY (`entitlement_id`) REFERENCES `entitlements`(`id`)
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` varchar(64) NOT NULL,
	`actor_user_id` varchar(64) NOT NULL,
	`action` varchar(96) NOT NULL,
	`target_type` varchar(48) NOT NULL,
	`target_id` varchar(96) NOT NULL,
	`metadata` json NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`),
	CONSTRAINT `audit_logs_actor_user_id_fk` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE INDEX `audit_logs_actor_idx` ON `audit_logs` (`actor_user_id`);
--> statement-breakpoint
CREATE INDEX `audit_logs_target_idx` ON `audit_logs` (`target_type`,`target_id`);
