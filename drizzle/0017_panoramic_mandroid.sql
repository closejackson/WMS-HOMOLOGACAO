ALTER TABLE `nonConformities` ADD `locationId` int;--> statement-breakpoint
ALTER TABLE `nonConformities` ADD `shippingId` int;--> statement-breakpoint
CREATE INDEX `ncg_location_idx` ON `nonConformities` (`locationId`);--> statement-breakpoint
CREATE INDEX `ncg_shipping_idx` ON `nonConformities` (`shippingId`);