CREATE TABLE `earnings` (
	`id` varchar(36) NOT NULL,
	`payment_id` varchar(36) NOT NULL,
	`vendor_id` varchar(36) NOT NULL,
	`amount_kobo` int NOT NULL,
	`settlement_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `earnings_id` PRIMARY KEY(`id`),
	CONSTRAINT `earnings_payment_id_unique` UNIQUE(`payment_id`)
);
--> statement-breakpoint
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
CREATE TABLE `settlements` (
	`id` varchar(36) NOT NULL,
	`vendor_id` varchar(36) NOT NULL,
	`amount_kobo` int NOT NULL,
	`earnings_count` int NOT NULL,
	`status` varchar(16) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `settlements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `vendor_unsettled_idx` ON `earnings` (`vendor_id`,`settlement_id`);--> statement-breakpoint
CREATE INDEX `sent_at_idx` ON `outbox_events` (`sent_at`);--> statement-breakpoint
CREATE INDEX `vendor_id_idx` ON `settlements` (`vendor_id`);