CREATE TABLE `assignments` (
	`id` varchar(36) NOT NULL,
	`order_id` varchar(36) NOT NULL,
	`vendor_id` varchar(36) NOT NULL,
	`rider_id` varchar(36),
	`status` varchar(16) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `assignments_id` PRIMARY KEY(`id`),
	CONSTRAINT `assignments_order_id_unique` UNIQUE(`order_id`)
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
CREATE TABLE `riders` (
	`id` varchar(36) NOT NULL,
	`name` varchar(120) NOT NULL,
	`status` varchar(16) NOT NULL,
	`lat` double,
	`lng` double,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `riders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `rider_id_idx` ON `assignments` (`rider_id`);--> statement-breakpoint
CREATE INDEX `sent_at_idx` ON `outbox_events` (`sent_at`);