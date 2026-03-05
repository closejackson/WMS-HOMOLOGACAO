-- Migration 0009: Adicionar tenantId em labelAssociations para suporte multi-tenant

-- Passo 1: Adicionar coluna tenantId com DEFAULT 1 (tenant principal)
ALTER TABLE `labelAssociations` ADD `tenantId` int NOT NULL DEFAULT 1;--> statement-breakpoint

-- Passo 2: Criar índice para otimizar queries por tenant
CREATE INDEX `label_assoc_tenant_id_idx` ON `labelAssociations` (`tenantId`);
