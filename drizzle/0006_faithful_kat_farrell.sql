CREATE TABLE `blindConferenceItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conferenceId` int NOT NULL,
	`productId` int NOT NULL,
	`batch` varchar(100) NOT NULL,
	`expiryDate` date,
	`packagesRead` int NOT NULL DEFAULT 0,
	`expectedQuantity` int NOT NULL DEFAULT 0,
	`tenantId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `blindConferenceItems_id` PRIMARY KEY(`id`),
	CONSTRAINT `conf_product_batch_idx` UNIQUE(`conferenceId`,`productId`,`batch`)
);
--> statement-breakpoint
CREATE INDEX `blind_conf_items_conf_idx` ON `blindConferenceItems` (`conferenceId`);--> statement-breakpoint
CREATE INDEX `blind_conf_items_product_idx` ON `blindConferenceItems` (`productId`);