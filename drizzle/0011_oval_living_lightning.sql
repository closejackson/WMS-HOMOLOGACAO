ALTER TABLE `blindConferenceItems` ADD `unitsRead` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `labelAssociations` ADD `unitsPerBox` int NOT NULL;--> statement-breakpoint
ALTER TABLE `pickingWaveItems` ADD `labelCode` varchar(200);--> statement-breakpoint
ALTER TABLE `labelAssociations` DROP COLUMN `unitsPerPackage`;