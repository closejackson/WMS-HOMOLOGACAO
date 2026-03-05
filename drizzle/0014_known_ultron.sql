CREATE TABLE `nonConformities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`labelCode` varchar(100) NOT NULL,
	`conferenceId` int NOT NULL,
	`description` text NOT NULL,
	`photoUrl` varchar(500),
	`registeredBy` int NOT NULL,
	`registeredAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `nonConformities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `labelAssociations` ADD `ncgStatus` enum('OK','NCG') DEFAULT 'OK' NOT NULL;--> statement-breakpoint
CREATE INDEX `ncg_label_code_idx` ON `nonConformities` (`labelCode`);--> statement-breakpoint
CREATE INDEX `ncg_conference_idx` ON `nonConformities` (`conferenceId`);--> statement-breakpoint
CREATE INDEX `ncg_tenant_id_idx` ON `nonConformities` (`tenantId`);