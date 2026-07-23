CREATE TABLE `outbox_events` (
	`id` varchar(36) NOT NULL,
	`topic` varchar(64) NOT NULL,
	`envelope` json NOT NULL,
	`key` varchar(128),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`sent_at` timestamp,
	CONSTRAINT `outbox_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` varchar(36) NOT NULL,
	`actor_type` varchar(20) NOT NULL,
	`email` varchar(255) NOT NULL,
	`phone` varchar(32),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE INDEX `sent_at_idx` ON `outbox_events` (`sent_at`);