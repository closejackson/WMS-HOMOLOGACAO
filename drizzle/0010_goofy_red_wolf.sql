ALTER TABLE `labelAssociations` ADD `status` enum('RECEIVING','AVAILABLE','BLOCKED','EXPIRED') DEFAULT 'AVAILABLE' NOT NULL;--> statement-breakpoint
ALTER TABLE `receivingOrderItems` ADD `tenantId` int NOT NULL;--> statement-breakpoint
ALTER TABLE `receivingOrderItems` ADD `blockedQuantity` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `receivingOrderItems` ADD `labelCode` varchar(100);