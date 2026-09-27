CREATE TABLE `vacations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`windows` text DEFAULT '' NOT NULL,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `vacations_range_idx` ON `vacations` (`starts_at`,`ends_at`);