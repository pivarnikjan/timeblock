ALTER TABLE `settings` ADD `calendar_start` text DEFAULT '05:00' NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `calendar_end` text DEFAULT '00:00' NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `calendar_view` text DEFAULT 'day' NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `calendar_filters` text DEFAULT '{}' NOT NULL;