ALTER TABLE `questions` ADD `scenario` text;
--> statement-breakpoint
ALTER TABLE `questions` ADD `artifacts` json NOT NULL DEFAULT (JSON_ARRAY());
--> statement-breakpoint
ALTER TABLE `questions` ADD `case_type` enum('basic_application','common_failure','design_tradeoff','debugging_performance','maintainability_safety');
--> statement-breakpoint
ALTER TABLE `questions` ADD `decision_criteria` json NOT NULL DEFAULT (JSON_ARRAY());
--> statement-breakpoint
ALTER TABLE `questions` ADD `practical_notes` json NOT NULL DEFAULT (JSON_ARRAY());
--> statement-breakpoint
ALTER TABLE `questions` ADD `check_question` text;
--> statement-breakpoint
UPDATE `questions`
SET `scenario` = '', `case_type` = 'basic_application', `check_question` = ''
WHERE `scenario` IS NULL OR `case_type` IS NULL OR `check_question` IS NULL;
--> statement-breakpoint
ALTER TABLE `questions` MODIFY `scenario` text NOT NULL;
--> statement-breakpoint
ALTER TABLE `questions` MODIFY `artifacts` json NOT NULL;
--> statement-breakpoint
ALTER TABLE `questions` MODIFY `case_type` enum('basic_application','common_failure','design_tradeoff','debugging_performance','maintainability_safety') NOT NULL;
--> statement-breakpoint
ALTER TABLE `questions` MODIFY `decision_criteria` json NOT NULL;
--> statement-breakpoint
ALTER TABLE `questions` MODIFY `practical_notes` json NOT NULL;
--> statement-breakpoint
ALTER TABLE `questions` MODIFY `check_question` text NOT NULL;
--> statement-breakpoint
ALTER TABLE `quiz_days` ADD `user_id` varchar(64);
--> statement-breakpoint
ALTER TABLE `answers` ADD `user_id` varchar(64);
--> statement-breakpoint
ALTER TABLE `scores` ADD `user_id` varchar(64);
--> statement-breakpoint
ALTER TABLE `self_assessments` ADD `user_id` varchar(64);
--> statement-breakpoint
UPDATE `quiz_days` SET `user_id` = 'user_local' WHERE `user_id` IS NULL;
--> statement-breakpoint
UPDATE `answers` SET `user_id` = 'user_local' WHERE `user_id` IS NULL;
--> statement-breakpoint
UPDATE `scores` SET `user_id` = 'user_local' WHERE `user_id` IS NULL;
--> statement-breakpoint
UPDATE `self_assessments` SET `user_id` = 'user_local' WHERE `user_id` IS NULL;
--> statement-breakpoint
DROP INDEX `quiz_days_quiz_date_idx` ON `quiz_days`;
--> statement-breakpoint
ALTER TABLE `quiz_days` MODIFY `user_id` varchar(64) NOT NULL;
--> statement-breakpoint
ALTER TABLE `answers` MODIFY `user_id` varchar(64) NOT NULL;
--> statement-breakpoint
ALTER TABLE `scores` MODIFY `user_id` varchar(64) NOT NULL;
--> statement-breakpoint
ALTER TABLE `self_assessments` MODIFY `user_id` varchar(64) NOT NULL;
--> statement-breakpoint
ALTER TABLE `quiz_days` ADD CONSTRAINT `quiz_days_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `answers` ADD CONSTRAINT `answers_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `scores` ADD CONSTRAINT `scores_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `self_assessments` ADD CONSTRAINT `self_assessments_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX `quiz_days_user_date_idx` ON `quiz_days` (`user_id`,`quiz_date`);
--> statement-breakpoint
CREATE INDEX `answers_user_quiz_day_idx` ON `answers` (`user_id`,`quiz_day_id`);
--> statement-breakpoint
CREATE INDEX `answers_user_question_idx` ON `answers` (`user_id`,`question_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `scores_user_subject_idx` ON `scores` (`user_id`,`subject_type`,`subject_id`);
--> statement-breakpoint
CREATE INDEX `self_assessments_user_subject_idx` ON `self_assessments` (`user_id`,`subject_type`,`subject_id`);
