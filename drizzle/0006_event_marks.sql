CREATE TABLE `event_marks` (
	`key` text PRIMARY KEY NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`important` integer DEFAULT false NOT NULL,
	`placeholder` integer DEFAULT false NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')) NOT NULL
);
