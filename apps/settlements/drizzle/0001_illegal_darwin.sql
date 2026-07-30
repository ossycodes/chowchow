CREATE TABLE `rider_earnings` (
	`id` varchar(36) NOT NULL,
	`order_id` varchar(36) NOT NULL,
	`rider_id` varchar(36) NOT NULL,
	`amount_kobo` int NOT NULL,
	`settlement_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `rider_earnings_id` PRIMARY KEY(`id`),
	CONSTRAINT `rider_earnings_order_id_unique` UNIQUE(`order_id`)
);
--> statement-breakpoint
CREATE TABLE `rider_settlements` (
	`id` varchar(36) NOT NULL,
	`rider_id` varchar(36) NOT NULL,
	`amount_kobo` int NOT NULL,
	`earnings_count` int NOT NULL,
	`status` varchar(16) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `rider_settlements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `rider_unsettled_idx` ON `rider_earnings` (`rider_id`,`settlement_id`);--> statement-breakpoint
CREATE INDEX `rs_rider_id_idx` ON `rider_settlements` (`rider_id`);