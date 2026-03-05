-- Migration: Renomear warehouseLocations.code para locationCode
ALTER TABLE warehouseLocations CHANGE COLUMN code locationCode VARCHAR(50) NOT NULL;
