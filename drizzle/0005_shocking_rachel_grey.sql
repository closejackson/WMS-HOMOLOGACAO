-- Passo 1: Remover índices antigos
DROP INDEX `label_assoc_session_label_idx` ON `labelAssociations`;--> statement-breakpoint
DROP INDEX `label_assoc_session_idx` ON `labelAssociations`;--> statement-breakpoint

-- Passo 2: Adicionar uniqueCode como NULL temporariamente
ALTER TABLE `labelAssociations` ADD `uniqueCode` varchar(200) NULL;--> statement-breakpoint

-- Passo 3: Popular uniqueCode com SKU+Lote dos registros existentes
UPDATE `labelAssociations` la
JOIN `products` p ON la.productId = p.id
SET la.uniqueCode = CONCAT(p.sku, '-', COALESCE(la.batch, 'NO-BATCH'))
WHERE la.uniqueCode IS NULL;--> statement-breakpoint

-- Passo 4: Tornar uniqueCode NOT NULL
ALTER TABLE `labelAssociations` MODIFY `uniqueCode` varchar(200) NOT NULL;--> statement-breakpoint

-- Passo 5: Adicionar constraint UNIQUE e índices
ALTER TABLE `labelAssociations` ADD CONSTRAINT `labelAssociations_labelCode_unique` UNIQUE(`labelCode`);--> statement-breakpoint
CREATE INDEX `label_assoc_label_code_idx` ON `labelAssociations` (`labelCode`);--> statement-breakpoint
CREATE INDEX `label_assoc_unique_code_idx` ON `labelAssociations` (`uniqueCode`);--> statement-breakpoint

-- Passo 6: Remover colunas antigas
ALTER TABLE `labelAssociations` DROP COLUMN `sessionId`;--> statement-breakpoint
ALTER TABLE `labelAssociations` DROP COLUMN `packagesRead`;