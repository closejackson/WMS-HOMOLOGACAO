ALTER TABLE `inventory` MODIFY COLUMN `expiryDate` date;--> statement-breakpoint
ALTER TABLE `inventoryCountItems` MODIFY COLUMN `expiryDate` date;--> statement-breakpoint
ALTER TABLE `pickingInvoiceItems` MODIFY COLUMN `expiryDate` date;--> statement-breakpoint
ALTER TABLE `pickingOrderItems` MODIFY COLUMN `expiryDate` date;--> statement-breakpoint
ALTER TABLE `productBarcodes` MODIFY COLUMN `expiryDate` date;--> statement-breakpoint
ALTER TABLE `receivingOrderItems` MODIFY COLUMN `expiryDate` date;--> statement-breakpoint
ALTER TABLE `pickingInvoiceItems` ADD `quantityUM` enum('unit','box','pallet') DEFAULT 'unit' NOT NULL;--> statement-breakpoint
ALTER TABLE `receivingInvoiceItems` ADD `divergence` int;--> statement-breakpoint
ALTER TABLE `pickingInvoiceItems` DROP COLUMN `unitValue`;--> statement-breakpoint
ALTER TABLE `receivingInvoiceItems` DROP COLUMN `expiryDate`;--> statement-breakpoint
ALTER TABLE `receivingInvoiceItems` DROP COLUMN `unitValue`;