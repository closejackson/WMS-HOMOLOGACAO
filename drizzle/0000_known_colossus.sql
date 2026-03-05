CREATE TABLE `auditLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int,
	`userId` int NOT NULL,
	`action` varchar(100) NOT NULL,
	`entityType` varchar(50) NOT NULL,
	`entityId` int,
	`oldValue` text,
	`newValue` text,
	`ipAddress` varchar(45),
	`userAgent` text,
	`signature` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auditLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `blindConferenceAdjustments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`associationId` int NOT NULL,
	`previousQuantity` int NOT NULL,
	`newQuantity` int NOT NULL,
	`reason` text,
	`adjustedBy` int NOT NULL,
	`adjustedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `blindConferenceAdjustments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `blindConferenceSessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int,
	`receivingOrderId` int NOT NULL,
	`startedBy` int NOT NULL,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`finishedAt` timestamp,
	`finishedBy` int,
	`status` enum('active','completed','cancelled') NOT NULL DEFAULT 'active',
	CONSTRAINT `blindConferenceSessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `clientPortalSessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`systemUserId` int NOT NULL,
	`token` varchar(128) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`ipAddress` varchar(45),
	`userAgent` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `clientPortalSessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `clientPortalSessions_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `contracts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`contractNumber` varchar(50) NOT NULL,
	`startDate` timestamp NOT NULL,
	`endDate` timestamp,
	`slaReceivingHours` int DEFAULT 24,
	`slaPickingHours` int DEFAULT 4,
	`slaShippingHours` int DEFAULT 2,
	`pickingStrategy` enum('FEFO','FIFO','LIFO') NOT NULL DEFAULT 'FEFO',
	`expiryDaysThreshold` int DEFAULT 90,
	`status` enum('active','inactive','expired') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contracts_id` PRIMARY KEY(`id`),
	CONSTRAINT `contracts_contractNumber_unique` UNIQUE(`contractNumber`)
);
--> statement-breakpoint
CREATE TABLE `divergenceApprovals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`receivingOrderItemId` int NOT NULL,
	`requestedBy` int NOT NULL,
	`divergenceType` enum('quantity','code_mismatch','expiry_date','multiple') NOT NULL,
	`divergenceDetails` text NOT NULL,
	`justification` text NOT NULL,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`approvedBy` int,
	`approvalJustification` text,
	`approvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `divergenceApprovals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inventory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int,
	`productId` int NOT NULL,
	`locationId` int NOT NULL,
	`batch` varchar(50),
	`expiryDate` timestamp,
	`uniqueCode` varchar(200),
	`serialNumber` varchar(100),
	`quantity` int NOT NULL DEFAULT 0,
	`reservedQuantity` int NOT NULL DEFAULT 0,
	`status` enum('available','quarantine','blocked','damaged','expired') NOT NULL DEFAULT 'available',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inventory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inventoryCountItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`inventoryCountId` int NOT NULL,
	`locationId` int NOT NULL,
	`productId` int,
	`batch` varchar(50),
	`expiryDate` timestamp,
	`serialNumber` varchar(100),
	`systemQuantity` int NOT NULL DEFAULT 0,
	`countedQuantity` int,
	`variance` int NOT NULL DEFAULT 0,
	`countedBy` int,
	`countedAt` timestamp,
	`adjustmentReason` text,
	`adjustedBy` int,
	`adjustedAt` timestamp,
	`status` enum('pending','counted','variance','adjusted') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inventoryCountItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inventoryCounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`countNumber` varchar(50) NOT NULL,
	`countType` enum('full_blind','cyclic','spot') NOT NULL,
	`status` enum('scheduled','in_progress','completed','cancelled') NOT NULL DEFAULT 'scheduled',
	`scheduledDate` timestamp,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inventoryCounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `inventoryCounts_countNumber_unique` UNIQUE(`countNumber`)
);
--> statement-breakpoint
CREATE TABLE `inventoryMovements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int,
	`productId` int NOT NULL,
	`batch` varchar(50),
	`uniqueCode` varchar(200),
	`serialNumber` varchar(100),
	`fromLocationId` int,
	`toLocationId` int,
	`quantity` int NOT NULL,
	`movementType` enum('receiving','put_away','picking','transfer','adjustment','return','disposal','quality') NOT NULL,
	`referenceType` varchar(50),
	`referenceId` int,
	`performedBy` int NOT NULL,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inventoryMovements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`invoiceNumber` varchar(20) NOT NULL,
	`series` varchar(5) NOT NULL,
	`invoiceKey` varchar(44) NOT NULL,
	`customerId` int NOT NULL,
	`customerName` varchar(255),
	`customerCity` varchar(100),
	`customerState` varchar(2),
	`pickingOrderId` int,
	`xmlData` json,
	`volumes` int,
	`pesoB` decimal(10,3),
	`totalValue` decimal(15,2),
	`issueDate` timestamp,
	`status` enum('imported','linked','in_manifest','shipped') NOT NULL DEFAULT 'imported',
	`importedBy` int NOT NULL,
	`importedAt` timestamp NOT NULL DEFAULT (now()),
	`linkedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `invoices_id` PRIMARY KEY(`id`),
	CONSTRAINT `invoices_invoiceKey_unique` UNIQUE(`invoiceKey`)
);
--> statement-breakpoint
CREATE TABLE `labelAssociations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` varchar(20) NOT NULL,
	`labelCode` varchar(100) NOT NULL,
	`productId` int NOT NULL,
	`batch` varchar(100),
	`expiryDate` date,
	`unitsPerPackage` int NOT NULL,
	`packagesRead` int NOT NULL DEFAULT 0,
	`totalUnits` int NOT NULL DEFAULT 0,
	`associatedBy` int NOT NULL,
	`associatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `labelAssociations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `labelPrintHistory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int,
	`userId` int NOT NULL,
	`receivingOrderId` int NOT NULL,
	`nfeNumber` varchar(50),
	`labelCount` int NOT NULL,
	`labelData` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `labelPrintHistory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `labelReadings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` varchar(20) NOT NULL,
	`associationId` int NOT NULL,
	`labelCode` varchar(100) NOT NULL,
	`readBy` int NOT NULL,
	`readAt` timestamp NOT NULL DEFAULT (now()),
	`unitsAdded` int NOT NULL,
	CONSTRAINT `labelReadings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(100) NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`module` varchar(50) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `permissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `permissions_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `pickingAllocations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pickingOrderId` int NOT NULL,
	`productId` int NOT NULL,
	`productSku` varchar(100) NOT NULL,
	`locationId` int NOT NULL,
	`locationCode` varchar(50) NOT NULL,
	`batch` varchar(100),
	`expiryDate` date,
	`uniqueCode` varchar(200),
	`quantity` int NOT NULL,
	`isFractional` boolean NOT NULL DEFAULT false,
	`sequence` int NOT NULL,
	`status` enum('pending','in_progress','picked','short_picked') NOT NULL DEFAULT 'pending',
	`pickedQuantity` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pickingAllocations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pickingAuditLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pickingOrderId` int NOT NULL,
	`tenantId` int NOT NULL,
	`pickingRule` enum('FIFO','FEFO','Direcionado') NOT NULL,
	`productId` int NOT NULL,
	`requestedQuantity` int NOT NULL,
	`allocatedLocations` json NOT NULL,
	`userId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pickingAuditLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pickingInvoiceItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoiceId` int NOT NULL,
	`productId` int,
	`sku` varchar(100) NOT NULL,
	`productName` varchar(255) NOT NULL,
	`batch` varchar(50),
	`expiryDate` timestamp,
	`uniqueCode` varchar(200),
	`quantity` int NOT NULL,
	`unitValue` decimal(15,4),
	`totalValue` decimal(15,2),
	`ncm` varchar(10),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pickingInvoiceItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pickingOrderItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pickingOrderId` int NOT NULL,
	`productId` int NOT NULL,
	`requestedQuantity` int NOT NULL,
	`requestedUM` enum('unit','box','pallet') NOT NULL DEFAULT 'unit',
	`unit` enum('unit','box') NOT NULL DEFAULT 'unit',
	`unitsPerBox` int,
	`pickedQuantity` int NOT NULL DEFAULT 0,
	`pickedUM` enum('unit','box','pallet') NOT NULL DEFAULT 'unit',
	`batch` varchar(50),
	`expiryDate` timestamp,
	`uniqueCode` varchar(200),
	`serialNumber` varchar(100),
	`fromLocationId` int,
	`inventoryId` int,
	`status` enum('pending','picking','picked','short_picked','exception','cancelled') NOT NULL DEFAULT 'pending',
	`pickedBy` int,
	`pickedAt` timestamp,
	`exceptionReason` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pickingOrderItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pickingOrders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`orderNumber` varchar(50) NOT NULL,
	`customerOrderNumber` varchar(100),
	`customerId` int,
	`customerName` varchar(255),
	`deliveryAddress` text,
	`priority` enum('emergency','urgent','normal','low') NOT NULL DEFAULT 'normal',
	`status` enum('pending','validated','in_wave','in_progress','paused','picking','picked','divergent','checking','packed','staged','invoiced','shipped','cancelled') NOT NULL DEFAULT 'pending',
	`shippingStatus` enum('awaiting_invoice','invoice_linked','in_manifest','shipped'),
	`totalItems` int NOT NULL DEFAULT 0,
	`totalQuantity` int NOT NULL DEFAULT 0,
	`scheduledDate` timestamp,
	`assignedTo` int,
	`pickedBy` int,
	`pickedAt` timestamp,
	`checkedBy` int,
	`checkedAt` timestamp,
	`packedBy` int,
	`packedAt` timestamp,
	`shippedAt` timestamp,
	`waveId` int,
	`notes` text,
	`nfeNumber` varchar(20),
	`nfeKey` varchar(44),
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pickingOrders_id` PRIMARY KEY(`id`),
	CONSTRAINT `pickingOrders_orderNumber_unique` UNIQUE(`orderNumber`)
);
--> statement-breakpoint
CREATE TABLE `pickingProgress` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pickingOrderId` int NOT NULL,
	`currentSequence` int NOT NULL DEFAULT 1,
	`currentLocationId` int,
	`scannedItems` json,
	`pausedAt` timestamp,
	`pausedBy` int,
	`resumedAt` timestamp,
	`resumedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pickingProgress_id` PRIMARY KEY(`id`),
	CONSTRAINT `pickingProgress_pickingOrderId_unique` UNIQUE(`pickingOrderId`)
);
--> statement-breakpoint
CREATE TABLE `pickingReservations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pickingOrderId` int NOT NULL,
	`productId` int NOT NULL,
	`inventoryId` int NOT NULL,
	`batch` varchar(50),
	`uniqueCode` varchar(200),
	`quantity` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pickingReservations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pickingWaveItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`waveId` int NOT NULL,
	`pickingOrderId` int NOT NULL,
	`productId` int NOT NULL,
	`productSku` varchar(100) NOT NULL,
	`productName` varchar(255) NOT NULL,
	`totalQuantity` int NOT NULL,
	`pickedQuantity` int NOT NULL DEFAULT 0,
	`unit` enum('unit','box') NOT NULL DEFAULT 'unit',
	`unitsPerBox` int,
	`locationId` int NOT NULL,
	`locationCode` varchar(50) NOT NULL,
	`batch` varchar(100),
	`expiryDate` date,
	`uniqueCode` varchar(200),
	`status` enum('pending','picking','picked') NOT NULL DEFAULT 'pending',
	`pickedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pickingWaveItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pickingWaves` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`waveNumber` varchar(50) NOT NULL,
	`status` enum('pending','picking','picked','staged','completed','cancelled') NOT NULL DEFAULT 'pending',
	`totalOrders` int NOT NULL DEFAULT 0,
	`totalItems` int NOT NULL DEFAULT 0,
	`totalQuantity` int NOT NULL DEFAULT 0,
	`pickingRule` enum('FIFO','FEFO','Direcionado') NOT NULL,
	`assignedTo` int,
	`pickedBy` int,
	`pickedAt` timestamp,
	`stagedBy` int,
	`stagedAt` timestamp,
	`notes` text,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pickingWaves_id` PRIMARY KEY(`id`),
	CONSTRAINT `pickingWaves_waveNumber_unique` UNIQUE(`waveNumber`)
);
--> statement-breakpoint
CREATE TABLE `printSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`defaultFormat` enum('zpl','pdf') NOT NULL DEFAULT 'zpl',
	`defaultCopies` int NOT NULL DEFAULT 1,
	`labelSize` varchar(50) NOT NULL DEFAULT '4x2',
	`printerDpi` int NOT NULL DEFAULT 203,
	`autoPrint` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `printSettings_id` PRIMARY KEY(`id`),
	CONSTRAINT `printSettings_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `productBarcodes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`barcode` varchar(100) NOT NULL,
	`batch` varchar(50),
	`expiryDate` timestamp,
	`locationId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `productBarcodes_id` PRIMARY KEY(`id`),
	CONSTRAINT `productBarcodes_barcode_unique` UNIQUE(`barcode`)
);
--> statement-breakpoint
CREATE TABLE `productLabels` (
	`id` int AUTO_INCREMENT NOT NULL,
	`labelCode` varchar(200) NOT NULL,
	`productId` int NOT NULL,
	`productSku` varchar(100) NOT NULL,
	`batch` varchar(100) NOT NULL,
	`expiryDate` date,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `productLabels_id` PRIMARY KEY(`id`),
	CONSTRAINT `productLabels_labelCode_unique` UNIQUE(`labelCode`)
);
--> statement-breakpoint
CREATE TABLE `productLocationMapping` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int,
	`productId` int NOT NULL,
	`suggestedLocationId` int NOT NULL,
	`priority` int NOT NULL DEFAULT 1,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `productLocationMapping_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`sku` varchar(100) NOT NULL,
	`supplierCode` varchar(100),
	`customerCode` varchar(100),
	`description` text NOT NULL,
	`gtin` varchar(14),
	`anvisaRegistry` varchar(100),
	`therapeuticClass` varchar(100),
	`manufacturer` varchar(255),
	`unitOfMeasure` varchar(20) NOT NULL DEFAULT 'UN',
	`unitsPerBox` int,
	`category` varchar(100),
	`costPrice` decimal(10,2),
	`salePrice` decimal(10,2),
	`minQuantity` int DEFAULT 0,
	`dispensingQuantity` int DEFAULT 1,
	`requiresBatchControl` boolean NOT NULL DEFAULT true,
	`requiresExpiryControl` boolean NOT NULL DEFAULT true,
	`requiresSerialControl` boolean NOT NULL DEFAULT false,
	`storageCondition` enum('ambient','refrigerated_2_8','frozen_minus_20','controlled') NOT NULL DEFAULT 'ambient',
	`minTemperature` decimal(5,2),
	`maxTemperature` decimal(5,2),
	`requiresHumidityControl` boolean NOT NULL DEFAULT false,
	`isControlledSubstance` boolean NOT NULL DEFAULT false,
	`isPsychotropic` boolean NOT NULL DEFAULT false,
	`status` enum('active','inactive','discontinued') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `products_id` PRIMARY KEY(`id`),
	CONSTRAINT `products_tenantId_sku_unique` UNIQUE(`tenantId`,`sku`)
);
--> statement-breakpoint
CREATE TABLE `recalls` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`recallNumber` varchar(50) NOT NULL,
	`productId` int NOT NULL,
	`affectedBatches` text NOT NULL,
	`reason` text NOT NULL,
	`severity` enum('critical','high','medium','low') NOT NULL DEFAULT 'high',
	`status` enum('active','in_progress','completed','cancelled') NOT NULL DEFAULT 'active',
	`initiatedBy` int NOT NULL,
	`initiatedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `recalls_id` PRIMARY KEY(`id`),
	CONSTRAINT `recalls_recallNumber_unique` UNIQUE(`recallNumber`)
);
--> statement-breakpoint
CREATE TABLE `receivingConferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`receivingOrderItemId` int NOT NULL,
	`batch` varchar(50),
	`uniqueCode` varchar(200),
	`quantityConferenced` int NOT NULL,
	`conferencedBy` int NOT NULL,
	`conferencedAt` timestamp NOT NULL DEFAULT (now()),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `receivingConferences_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `receivingDivergences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`receivingOrderItemId` int NOT NULL,
	`divergenceType` enum('shortage','surplus') NOT NULL,
	`expectedQuantity` int NOT NULL,
	`receivedQuantity` int NOT NULL,
	`differenceQuantity` int NOT NULL,
	`batch` varchar(50),
	`uniqueCode` varchar(200),
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`reportedBy` int NOT NULL,
	`reportedAt` timestamp NOT NULL DEFAULT (now()),
	`approvedBy` int,
	`approvedAt` timestamp,
	`justification` text,
	`fiscalAdjustment` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `receivingDivergences_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `receivingInvoiceItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`receivingOrderId` int NOT NULL,
	`nfeKey` varchar(44),
	`nfeNumber` varchar(20),
	`productId` int,
	`sku` varchar(100) NOT NULL,
	`productName` varchar(255) NOT NULL,
	`batch` varchar(50),
	`expiryDate` timestamp,
	`uniqueCode` varchar(200),
	`quantity` int NOT NULL,
	`unitValue` decimal(15,4),
	`totalValue` decimal(15,2),
	`ncm` varchar(10),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `receivingInvoiceItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `receivingOrderItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`receivingOrderId` int NOT NULL,
	`productId` int NOT NULL,
	`expectedQuantity` int NOT NULL,
	`receivedQuantity` int NOT NULL DEFAULT 0,
	`addressedQuantity` int NOT NULL DEFAULT 0,
	`expectedGtin` varchar(14),
	`expectedSupplierCode` varchar(50),
	`expectedInternalCode` varchar(50),
	`scannedGtin` varchar(14),
	`scannedSupplierCode` varchar(50),
	`scannedInternalCode` varchar(50),
	`batch` varchar(50),
	`expiryDate` timestamp,
	`serialNumber` varchar(100),
	`uniqueCode` varchar(200),
	`status` enum('pending','in_quarantine','approved','rejected','awaiting_approval') NOT NULL DEFAULT 'pending',
	`rejectionReason` text,
	`approvedBy` int,
	`approvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `receivingOrderItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `receivingOrders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`orderNumber` varchar(50) NOT NULL,
	`nfeKey` varchar(44),
	`nfeNumber` varchar(20),
	`supplierName` varchar(255),
	`supplierCnpj` varchar(18),
	`scheduledDate` timestamp,
	`receivedDate` timestamp,
	`receivingLocationId` int,
	`addressingPlan` json,
	`status` enum('scheduled','in_progress','in_quarantine','addressing','completed','cancelled') NOT NULL DEFAULT 'scheduled',
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `receivingOrders_id` PRIMARY KEY(`id`),
	CONSTRAINT `receivingOrders_orderNumber_unique` UNIQUE(`orderNumber`)
);
--> statement-breakpoint
CREATE TABLE `receivingPreallocations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`receivingOrderId` int NOT NULL,
	`productId` int NOT NULL,
	`locationId` int NOT NULL,
	`batch` varchar(50),
	`quantity` int NOT NULL,
	`uniqueCode` varchar(200),
	`status` enum('pending','allocated','cancelled') NOT NULL DEFAULT 'pending',
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `receivingPreallocations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reportFavorites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`reportType` varchar(100) NOT NULL,
	`favoriteName` varchar(255) NOT NULL,
	`filters` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reportFavorites_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reportLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int,
	`userId` int NOT NULL,
	`reportType` varchar(100) NOT NULL,
	`reportCategory` enum('stock','operational','shipping','audit') NOT NULL,
	`filters` json,
	`exportFormat` enum('screen','excel','pdf','csv'),
	`recordCount` int,
	`executionTime` int,
	`generatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reportLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `returns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`returnNumber` varchar(50) NOT NULL,
	`shipmentId` int,
	`returnReason` text,
	`status` enum('pending','received','inspected','approved','rejected','disposed') NOT NULL DEFAULT 'pending',
	`inspectedBy` int,
	`inspectedAt` timestamp,
	`disposition` enum('restock','quarantine','dispose'),
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `returns_id` PRIMARY KEY(`id`),
	CONSTRAINT `returns_returnNumber_unique` UNIQUE(`returnNumber`)
);
--> statement-breakpoint
CREATE TABLE `rolePermissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roleId` int NOT NULL,
	`permissionId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `rolePermissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `rolePermissions_roleId_permissionId_unique` UNIQUE(`roleId`,`permissionId`)
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(50) NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`isSystemRole` boolean NOT NULL DEFAULT false,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `roles_id` PRIMARY KEY(`id`),
	CONSTRAINT `roles_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `shipmentManifestItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`manifestId` int NOT NULL,
	`pickingOrderId` int NOT NULL,
	`invoiceId` int NOT NULL,
	`volumes` int,
	`addedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `shipmentManifestItems_id` PRIMARY KEY(`id`),
	CONSTRAINT `shipmentManifestItems_manifestId_pickingOrderId_unique` UNIQUE(`manifestId`,`pickingOrderId`)
);
--> statement-breakpoint
CREATE TABLE `shipmentManifests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`manifestNumber` varchar(50) NOT NULL,
	`carrierId` int,
	`carrierName` varchar(255),
	`totalOrders` int NOT NULL DEFAULT 0,
	`totalInvoices` int NOT NULL DEFAULT 0,
	`totalVolumes` int NOT NULL DEFAULT 0,
	`status` enum('draft','ready','collected','shipped') NOT NULL DEFAULT 'draft',
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`collectedAt` timestamp,
	`shippedAt` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `shipmentManifests_id` PRIMARY KEY(`id`),
	CONSTRAINT `shipmentManifests_manifestNumber_unique` UNIQUE(`manifestNumber`)
);
--> statement-breakpoint
CREATE TABLE `shipments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`shipmentNumber` varchar(50) NOT NULL,
	`pickingOrderId` int,
	`carrierName` varchar(255),
	`vehiclePlate` varchar(20),
	`driverName` varchar(255),
	`trackingNumber` varchar(100),
	`shippedAt` timestamp,
	`deliveredAt` timestamp,
	`status` enum('pending','loaded','in_transit','delivered','returned') NOT NULL DEFAULT 'pending',
	`requiresColdChain` boolean NOT NULL DEFAULT false,
	`temperatureLoggerSerial` varchar(100),
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `shipments_id` PRIMARY KEY(`id`),
	CONSTRAINT `shipments_shipmentNumber_unique` UNIQUE(`shipmentNumber`)
);
--> statement-breakpoint
CREATE TABLE `stageCheckItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`stageCheckId` int NOT NULL,
	`productId` int NOT NULL,
	`productSku` varchar(100) NOT NULL,
	`productName` varchar(255) NOT NULL,
	`batch` varchar(100),
	`uniqueCode` varchar(200),
	`expectedQuantity` int NOT NULL,
	`checkedQuantity` int NOT NULL DEFAULT 0,
	`divergence` int NOT NULL DEFAULT 0,
	`scannedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stageCheckItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stageChecks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`pickingOrderId` int NOT NULL,
	`customerOrderNumber` varchar(100) NOT NULL,
	`operatorId` int NOT NULL,
	`status` enum('in_progress','completed','divergent') NOT NULL DEFAULT 'in_progress',
	`hasDivergence` boolean NOT NULL DEFAULT false,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `stageChecks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `systemUsers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`fullName` varchar(255) NOT NULL,
	`login` varchar(100) NOT NULL,
	`email` varchar(320) NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`approvalStatus` enum('pending','approved','rejected') NOT NULL DEFAULT 'approved',
	`approvedBy` int,
	`approvedAt` timestamp,
	`failedLoginAttempts` int NOT NULL DEFAULT 0,
	`lockedUntil` timestamp,
	`lastLogin` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdBy` int,
	CONSTRAINT `systemUsers_id` PRIMARY KEY(`id`),
	CONSTRAINT `systemUsers_tenantId_login_unique` UNIQUE(`tenantId`,`login`)
);
--> statement-breakpoint
CREATE TABLE `tenants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`tradeName` varchar(255),
	`cnpj` varchar(18) NOT NULL,
	`afe` varchar(50),
	`ae` varchar(50),
	`licenseNumber` varchar(100),
	`address` text,
	`city` varchar(100),
	`state` varchar(2),
	`zipCode` varchar(10),
	`phone` varchar(20),
	`email` varchar(320),
	`pickingRule` enum('FIFO','FEFO','Direcionado') NOT NULL DEFAULT 'FIFO',
	`shippingAddress` varchar(50),
	`status` enum('active','inactive','suspended') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tenants_id` PRIMARY KEY(`id`),
	CONSTRAINT `tenants_cnpj_unique` UNIQUE(`cnpj`)
);
--> statement-breakpoint
CREATE TABLE `userPermissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`permissionId` int NOT NULL,
	`granted` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`createdBy` int,
	CONSTRAINT `userPermissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `userPermissions_userId_permissionId_unique` UNIQUE(`userId`,`permissionId`)
);
--> statement-breakpoint
CREATE TABLE `userRoles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`roleId` int NOT NULL,
	`isPrimary` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`createdBy` int,
	CONSTRAINT `userRoles_id` PRIMARY KEY(`id`),
	CONSTRAINT `userRoles_userId_roleId_unique` UNIQUE(`userId`,`roleId`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin','operator','quality','manager') NOT NULL DEFAULT 'user',
	`tenantId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
--> statement-breakpoint
CREATE TABLE `warehouseLocations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`zoneId` int NOT NULL,
	`tenantId` int NOT NULL,
	`code` varchar(50) NOT NULL,
	`aisle` varchar(10),
	`rack` varchar(10),
	`level` varchar(10),
	`position` varchar(10),
	`locationType` enum('whole','fraction') NOT NULL DEFAULT 'whole',
	`storageRule` enum('single','multi') NOT NULL DEFAULT 'single',
	`status` enum('livre','available','occupied','blocked','counting') NOT NULL DEFAULT 'livre',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `warehouseLocations_id` PRIMARY KEY(`id`),
	CONSTRAINT `warehouseLocations_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `warehouseZones` (
	`id` int AUTO_INCREMENT NOT NULL,
	`warehouseId` int NOT NULL,
	`code` varchar(50) NOT NULL,
	`name` varchar(255) NOT NULL,
	`storageCondition` enum('ambient','refrigerated_2_8','frozen_minus_20','controlled','quarantine') NOT NULL DEFAULT 'ambient',
	`hasTemperatureControl` boolean NOT NULL DEFAULT false,
	`status` enum('active','inactive') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `warehouseZones_id` PRIMARY KEY(`id`),
	CONSTRAINT `warehouseZones_warehouseId_code_unique` UNIQUE(`warehouseId`,`code`)
);
--> statement-breakpoint
CREATE TABLE `warehouses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(50) NOT NULL,
	`name` varchar(255) NOT NULL,
	`address` text,
	`city` varchar(100),
	`state` varchar(2),
	`zipCode` varchar(10),
	`status` enum('active','inactive') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `warehouses_id` PRIMARY KEY(`id`),
	CONSTRAINT `warehouses_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE INDEX `tenant_user_idx` ON `auditLogs` (`tenantId`,`userId`);--> statement-breakpoint
CREATE INDEX `entity_idx` ON `auditLogs` (`entityType`,`entityId`);--> statement-breakpoint
CREATE INDEX `audit_created_at_idx` ON `auditLogs` (`createdAt`);--> statement-breakpoint
CREATE INDEX `blind_adj_session_idx` ON `blindConferenceAdjustments` (`sessionId`);--> statement-breakpoint
CREATE INDEX `blind_conf_order_idx` ON `blindConferenceSessions` (`receivingOrderId`);--> statement-breakpoint
CREATE INDEX `blind_conf_status_idx` ON `blindConferenceSessions` (`status`);--> statement-breakpoint
CREATE INDEX `cps_tenant_idx` ON `clientPortalSessions` (`tenantId`);--> statement-breakpoint
CREATE INDEX `cps_user_idx` ON `clientPortalSessions` (`systemUserId`);--> statement-breakpoint
CREATE INDEX `cps_expires_idx` ON `clientPortalSessions` (`expiresAt`);--> statement-breakpoint
CREATE INDEX `tenant_product_idx` ON `inventory` (`tenantId`,`productId`);--> statement-breakpoint
CREATE INDEX `location_idx` ON `inventory` (`locationId`);--> statement-breakpoint
CREATE INDEX `tenant_product_movement_idx` ON `inventoryMovements` (`tenantId`,`productId`);--> statement-breakpoint
CREATE INDEX `created_at_idx` ON `inventoryMovements` (`createdAt`);--> statement-breakpoint
CREATE INDEX `label_assoc_session_label_idx` ON `labelAssociations` (`sessionId`,`labelCode`);--> statement-breakpoint
CREATE INDEX `label_assoc_session_idx` ON `labelAssociations` (`sessionId`);--> statement-breakpoint
CREATE INDEX `label_print_tenant_user_idx` ON `labelPrintHistory` (`tenantId`,`userId`);--> statement-breakpoint
CREATE INDEX `label_print_order_idx` ON `labelPrintHistory` (`receivingOrderId`);--> statement-breakpoint
CREATE INDEX `label_print_created_at_idx` ON `labelPrintHistory` (`createdAt`);--> statement-breakpoint
CREATE INDEX `label_read_session_idx` ON `labelReadings` (`sessionId`);--> statement-breakpoint
CREATE INDEX `label_read_assoc_idx` ON `labelReadings` (`associationId`);--> statement-breakpoint
CREATE INDEX `allocation_order_idx` ON `pickingAllocations` (`pickingOrderId`);--> statement-breakpoint
CREATE INDEX `allocation_location_idx` ON `pickingAllocations` (`locationId`);--> statement-breakpoint
CREATE INDEX `allocation_sequence_idx` ON `pickingAllocations` (`pickingOrderId`,`sequence`);--> statement-breakpoint
CREATE INDEX `picking_audit_order_idx` ON `pickingAuditLogs` (`pickingOrderId`);--> statement-breakpoint
CREATE INDEX `picking_audit_tenant_idx` ON `pickingAuditLogs` (`tenantId`);--> statement-breakpoint
CREATE INDEX `picking_audit_rule_idx` ON `pickingAuditLogs` (`pickingRule`);--> statement-breakpoint
CREATE INDEX `picking_invoice_items_invoice_idx` ON `pickingInvoiceItems` (`invoiceId`);--> statement-breakpoint
CREATE INDEX `picking_invoice_items_product_idx` ON `pickingInvoiceItems` (`productId`);--> statement-breakpoint
CREATE INDEX `picking_invoice_items_unique_code_idx` ON `pickingInvoiceItems` (`uniqueCode`);--> statement-breakpoint
CREATE INDEX `wave_item_wave_idx` ON `pickingWaveItems` (`waveId`);--> statement-breakpoint
CREATE INDEX `wave_item_product_idx` ON `pickingWaveItems` (`productId`);--> statement-breakpoint
CREATE INDEX `wave_item_location_idx` ON `pickingWaveItems` (`locationId`);--> statement-breakpoint
CREATE INDEX `wave_item_order_idx` ON `pickingWaveItems` (`pickingOrderId`);--> statement-breakpoint
CREATE INDEX `wave_tenant_idx` ON `pickingWaves` (`tenantId`);--> statement-breakpoint
CREATE INDEX `wave_status_idx` ON `pickingWaves` (`status`);--> statement-breakpoint
CREATE INDEX `product_label_code_idx` ON `productLabels` (`labelCode`);--> statement-breakpoint
CREATE INDEX `product_label_product_idx` ON `productLabels` (`productId`);--> statement-breakpoint
CREATE INDEX `product_label_sku_batch_idx` ON `productLabels` (`productSku`,`batch`);--> statement-breakpoint
CREATE INDEX `product_idx` ON `productLocationMapping` (`productId`);--> statement-breakpoint
CREATE INDEX `tenant_product_idx` ON `productLocationMapping` (`tenantId`,`productId`);--> statement-breakpoint
CREATE INDEX `receiving_invoice_items_order_idx` ON `receivingInvoiceItems` (`receivingOrderId`);--> statement-breakpoint
CREATE INDEX `receiving_invoice_items_product_idx` ON `receivingInvoiceItems` (`productId`);--> statement-breakpoint
CREATE INDEX `receiving_invoice_items_unique_code_idx` ON `receivingInvoiceItems` (`uniqueCode`);--> statement-breakpoint
CREATE INDEX `receiving_invoice_items_nfe_key_idx` ON `receivingInvoiceItems` (`nfeKey`);--> statement-breakpoint
CREATE INDEX `reportFavorites_userId_idx` ON `reportFavorites` (`userId`);--> statement-breakpoint
CREATE INDEX `reportFavorites_reportType_idx` ON `reportFavorites` (`reportType`);--> statement-breakpoint
CREATE INDEX `reportLogs_tenantId_idx` ON `reportLogs` (`tenantId`);--> statement-breakpoint
CREATE INDEX `reportLogs_userId_idx` ON `reportLogs` (`userId`);--> statement-breakpoint
CREATE INDEX `reportLogs_reportType_idx` ON `reportLogs` (`reportType`);--> statement-breakpoint
CREATE INDEX `reportLogs_generatedAt_idx` ON `reportLogs` (`generatedAt`);--> statement-breakpoint
CREATE INDEX `stage_item_check_idx` ON `stageCheckItems` (`stageCheckId`);--> statement-breakpoint
CREATE INDEX `stage_item_product_idx` ON `stageCheckItems` (`productId`);--> statement-breakpoint
CREATE INDEX `stage_check_tenant_idx` ON `stageChecks` (`tenantId`);--> statement-breakpoint
CREATE INDEX `stage_check_order_idx` ON `stageChecks` (`pickingOrderId`);--> statement-breakpoint
CREATE INDEX `stage_check_status_idx` ON `stageChecks` (`status`);--> statement-breakpoint
CREATE INDEX `zone_status_idx` ON `warehouseLocations` (`zoneId`,`status`);--> statement-breakpoint
CREATE INDEX `tenant_status_idx` ON `warehouseLocations` (`tenantId`,`status`);--> statement-breakpoint
CREATE INDEX `location_status_idx` ON `warehouseLocations` (`status`);