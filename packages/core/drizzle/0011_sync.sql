CREATE TABLE `sync_meta` (
	`id` integer PRIMARY KEY NOT NULL,
	`device` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`clock` integer DEFAULT 0 NOT NULL,
	`applying` integer DEFAULT 0 NOT NULL,
	`file_id` text,
	`uploaded_hash` text,
	`last_sync_at` text,
	`last_error` text
);
--> statement-breakpoint
CREATE TABLE `sync_peers` (
	`file_id` text PRIMARY KEY NOT NULL,
	`device` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`md5` text,
	`clock` integer DEFAULT 0 NOT NULL,
	`written_at` text,
	`merged_at` text
);
--> statement-breakpoint
CREATE TABLE `sync_stamps` (
	`tbl` text NOT NULL,
	`row_id` text NOT NULL,
	`col` text NOT NULL,
	`stamp` text NOT NULL,
	PRIMARY KEY(`tbl`, `row_id`, `col`)
);
--> statement-breakpoint
CREATE TABLE `sync_tombstones` (
	`tbl` text NOT NULL,
	`row_id` text NOT NULL,
	`stamp` text NOT NULL,
	PRIMARY KEY(`tbl`, `row_id`)
);
