CREATE TABLE `accounts` (
	`id` varchar(36) NOT NULL,
	`code` varchar(128) NOT NULL,
	`type` varchar(16) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `accounts_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `entry_lines` (
	`id` varchar(36) NOT NULL,
	`journal_id` varchar(36) NOT NULL,
	`account_code` varchar(128) NOT NULL,
	`direction` varchar(6) NOT NULL,
	`amount_kobo` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `entry_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `journals` (
	`id` varchar(36) NOT NULL,
	`reference` varchar(128) NOT NULL,
	`memo` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `journals_id` PRIMARY KEY(`id`),
	CONSTRAINT `journals_reference_unique` UNIQUE(`reference`)
);
--> statement-breakpoint
CREATE INDEX `journal_id_idx` ON `entry_lines` (`journal_id`);--> statement-breakpoint
CREATE INDEX `account_code_idx` ON `entry_lines` (`account_code`);