ALTER TABLE `labelAssociations` ADD `tenantId` int NOT NULL;--> statement-breakpoint
CREATE INDEX `label_assoc_tenant_id_idx` ON `labelAssociations` (`tenantId`);