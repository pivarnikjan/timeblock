CREATE TABLE `task_reschedules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` integer NOT NULL,
	`block_id` integer NOT NULL,
	`from_starts_at` text NOT NULL,
	`to_starts_at` text,
	`minutes` integer NOT NULL,
	`reason` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_reschedules_slip_idx` ON `task_reschedules` (`task_id`,`block_id`,`from_starts_at`);--> statement-breakpoint
CREATE INDEX `task_reschedules_created_idx` ON `task_reschedules` (`created_at`);