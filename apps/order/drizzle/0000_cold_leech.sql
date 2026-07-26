CREATE TABLE `order_items` (
	`id` varchar(36) NOT NULL,
	`order_id` varchar(36) NOT NULL,
	`item_id` varchar(36) NOT NULL,
	`name` varchar(120) NOT NULL,
	`unit_price_kobo` int NOT NULL,
	`quantity` int NOT NULL,
	`line_total_kobo` int NOT NULL,
	CONSTRAINT `order_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` varchar(36) NOT NULL,
	`customer_id` varchar(36) NOT NULL,
	`vendor_id` varchar(36) NOT NULL,
	`status` varchar(24) NOT NULL,
	`total_kobo` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`)
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
CREATE INDEX `order_id_idx` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE INDEX `customer_id_idx` ON `orders` (`customer_id`);--> statement-breakpoint
CREATE INDEX `sent_at_idx` ON `outbox_events` (`sent_at`);