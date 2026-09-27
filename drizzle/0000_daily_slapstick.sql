CREATE TABLE `blocks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` integer NOT NULL,
	`date` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`google_event_id` text,
	`state` text DEFAULT 'draft' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `blocks_date_idx` ON `blocks` (`date`,`state`);--> statement-breakpoint
CREATE INDEX `blocks_task_idx` ON `blocks` (`task_id`);--> statement-breakpoint
CREATE TABLE `horizons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`level` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`parent_id` integer,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `horizons_level_period_idx` ON `horizons` (`level`,`period_start`);--> statement-breakpoint
CREATE INDEX `horizons_parent_idx` ON `horizons` (`parent_id`);--> statement-breakpoint
CREATE TABLE `ritual_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`for_period` text NOT NULL,
	`completed_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ritual_log_kind_period_idx` ON `ritual_log` (`kind`,`for_period`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`timezone` text DEFAULT 'Europe/Vienna' NOT NULL,
	`day_start` text DEFAULT '06:00' NOT NULL,
	`day_end` text DEFAULT '18:00' NOT NULL,
	`buffer_min` integer DEFAULT 15 NOT NULL,
	`max_focus_block_min` integer DEFAULT 90 NOT NULL,
	`min_block_min` integer DEFAULT 30 NOT NULL,
	`lunch_start` text DEFAULT '12:00' NOT NULL,
	`lunch_min` integer DEFAULT 30 NOT NULL,
	`deep_work_before` text DEFAULT '12:00' NOT NULL,
	`target_calendar_id` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`notes` text,
	`horizon_id` integer,
	`estimate_min` integer DEFAULT 60 NOT NULL,
	`priority` integer DEFAULT 3 NOT NULL,
	`energy` text DEFAULT 'deep' NOT NULL,
	`due_date` text,
	`status` text DEFAULT 'backlog' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')) NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
CREATE INDEX `tasks_status_idx` ON `tasks` (`status`);--> statement-breakpoint
CREATE INDEX `tasks_horizon_idx` ON `tasks` (`horizon_id`);