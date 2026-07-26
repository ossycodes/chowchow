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
CREATE TABLE `payments` (
	`id` varchar(36) NOT NULL,
	`order_id` varchar(36) NOT NULL,
	`customer_id` varchar(36) NOT NULL,
	`vendor_id` varchar(36) NOT NULL,
	`amount_kobo` int NOT NULL,
	`status` varchar(16) NOT NULL,
	`provider_ref` varchar(128),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payments_id` PRIMARY KEY(`id`),
	CONSTRAINT `payments_order_id_unique` UNIQUE(`order_id`)
);
--> statement-breakpoint
CREATE INDEX `sent_at_idx` ON `outbox_events` (`sent_at`);--> statement-breakpoint
CREATE INDEX `customer_id_idx` ON `payments` (`customer_id`);