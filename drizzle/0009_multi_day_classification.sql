ALTER TABLE `event_marks` ADD `not_vacation` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `vacations` ADD `source_event` text;