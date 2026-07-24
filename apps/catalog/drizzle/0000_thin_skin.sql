CREATE TABLE `menu_items` (
	`id` varchar(36) NOT NULL,
	`vendor_id` varchar(36) NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` varchar(500),
	`price_kobo` int NOT NULL,
	`is_available` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `menu_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vendors` (
	`id` varchar(36) NOT NULL,
	`name` varchar(120) NOT NULL,
	`slug` varchar(140) NOT NULL,
	`description` varchar(500),
	`is_open` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `vendors_id` PRIMARY KEY(`id`),
	CONSTRAINT `vendors_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE INDEX `vendor_id_idx` ON `menu_items` (`vendor_id`);