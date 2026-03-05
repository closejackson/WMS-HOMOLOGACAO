-- Migration: Renomear warehouseZones.code para zoneCode
ALTER TABLE warehouseZones CHANGE COLUMN code zoneCode VARCHAR(50) NOT NULL;
