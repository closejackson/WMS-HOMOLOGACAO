import { createConnection } from 'mysql2/promise';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

// Carregar variável de ambiente
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL não definida');
  process.exit(1);
}

// Mapeamento de clientes para tenantId
const TENANT_MAP = {
  'AESC - Mãe de Deus': 30001,
  'AESC - Mãe de Deus - UCG': 30002,
};

// Zona de armazenagem
const STORAGE_ZONE_ID = 4;
const STORAGE_ZONE_CODE = 'STORAGE';

function toDateStr(val) {
  if (!val) return null;
  if (val instanceof Date) {
    return val.toISOString().split('T')[0];
  }
  // Converter número serial do Excel para data
  if (typeof val === 'number') {
    // Excel usa 1900-01-01 como dia 1 (com bug do ano bissexto 1900)
    const excelEpoch = new Date(1899, 11, 30); // 30/12/1899
    const date = new Date(excelEpoch.getTime() + val * 86400000);
    return date.toISOString().split('T')[0];
  }
  return String(val).split('T')[0];
}

async function main() {
  const wb = XLSX.readFile('/home/ubuntu/upload/ESTOQUE.xlsx');
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null });

  console.log(`Total de linhas no XLSX: ${rows.length}`);

  const conn = await createConnection(DATABASE_URL);
  console.log('Conectado ao banco.');

  let productsCreated = 0;
  let productsExisting = 0;
  let locationsCreated = 0;
  let locationsExisting = 0;
  let inventoryCreated = 0;
  let inventoryUpdated = 0;
  let errors = 0;

  // Cache de produtos por (tenantId, sku)
  const productCache = new Map();
  // Cache de endereços por (tenantId, code)
  const locationCache = new Map();

  for (const row of rows) {
    const sku = String(row['SKU'] || '').trim();
    const descricao = String(row['Produto'] || '').trim();
    const lote = String(row['Lote'] || '').trim();
    const quantidade = Number(row['Quantidade']) || 0;
    const unidade = String(row['Unidade'] || 'UN').trim();
    const enderecoCode = String(row['Endereço'] || '').trim();
    const zona = String(row['Zona'] || 'Armazenagem').trim();
    const validadeRaw = row['Validade'];
    const cliente = String(row['Cliente'] || '').trim();

    if (!sku || !enderecoCode || !cliente) {
      console.warn(`Linha ignorada (dados incompletos): SKU=${sku}, Endereço=${enderecoCode}, Cliente=${cliente}`);
      errors++;
      continue;
    }

    const tenantId = TENANT_MAP[cliente];
    if (!tenantId) {
      console.warn(`Cliente não mapeado: "${cliente}"`);
      errors++;
      continue;
    }

    const validade = toDateStr(validadeRaw);

    try {
      // 1. Upsert produto
      const prodKey = `${tenantId}:${sku}`;
      let productId = productCache.get(prodKey);

      if (!productId) {
        const [existing] = await conn.execute(
          'SELECT id FROM products WHERE tenantId = ? AND sku = ? LIMIT 1',
          [tenantId, sku]
        );
        if (existing.length > 0) {
          productId = existing[0].id;
          productCache.set(prodKey, productId);
          productsExisting++;
        } else {
          const [result] = await conn.execute(
            `INSERT INTO products (tenantId, sku, description, unitOfMeasure, requiresBatchControl, requiresExpiryControl, status, createdAt, updatedAt)
             VALUES (?, ?, ?, ?, 1, 1, 'active', NOW(), NOW())`,
            [tenantId, sku, descricao, unidade]
          );
          productId = result.insertId;
          productCache.set(prodKey, productId);
          productsCreated++;
          console.log(`  Produto criado: SKU=${sku} | ID=${productId} | Tenant=${tenantId}`);
        }
      }

      // 2. Buscar/criar endereço
      const locKey = `${tenantId}:${enderecoCode}`;
      let locationId = locationCache.get(locKey);

      if (!locationId) {
        const [existingLoc] = await conn.execute(
          'SELECT id FROM warehouseLocations WHERE tenantId = ? AND code = ? LIMIT 1',
          [tenantId, enderecoCode]
        );
        if (existingLoc.length > 0) {
          locationId = existingLoc[0].id;
          locationCache.set(locKey, locationId);
          locationsExisting++;
        } else {
          // Criar endereço novo na zona de armazenagem
          const [result] = await conn.execute(
            `INSERT INTO warehouseLocations (tenantId, zoneId, zoneCode, code, locationType, storageRule, status, createdAt, updatedAt)
             VALUES (?, ?, ?, ?, 'whole', 'multi', 'livre', NOW(), NOW())`,
            [tenantId, STORAGE_ZONE_ID, STORAGE_ZONE_CODE, enderecoCode]
          );
          locationId = result.insertId;
          locationCache.set(locKey, locationId);
          locationsCreated++;
          console.log(`  Endereço criado: ${enderecoCode} | ID=${locationId} | Tenant=${tenantId}`);
        }
      }

      // 3. Upsert inventory (por productId + locationId + batch + tenantId)
      const [existingInv] = await conn.execute(
        `SELECT id, quantity FROM inventory 
         WHERE tenantId = ? AND productId = ? AND locationId = ? AND batch = ? LIMIT 1`,
        [tenantId, productId, locationId, lote]
      );

      if (existingInv.length > 0) {
        // Atualizar quantidade (somar)
        const newQty = existingInv[0].quantity + quantidade;
        await conn.execute(
          `UPDATE inventory SET quantity = ?, expiryDate = ?, updatedAt = NOW() WHERE id = ?`,
          [newQty, validade, existingInv[0].id]
        );
        inventoryUpdated++;
      } else {
        // Inserir novo registro
        const uniqueCode = `IMP-${tenantId}-${sku}-${lote}-${enderecoCode}`.replace(/[^a-zA-Z0-9\-]/g, '_');
        await conn.execute(
          `INSERT INTO inventory (tenantId, productId, locationId, batch, expiryDate, uniqueCode, serialNumber, quantity, reservedQuantity, status, locationZone, labelCode, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 0, 'available', ?, NULL, NOW(), NOW())`,
          [tenantId, productId, locationId, lote, validade, uniqueCode, quantidade, STORAGE_ZONE_CODE]
        );
        inventoryCreated++;
      }

      // 4. Atualizar status do endereço para 'occupied'
      await conn.execute(
        `UPDATE warehouseLocations SET status = 'occupied', updatedAt = NOW() WHERE id = ?`,
        [locationId]
      );

    } catch (err) {
      console.error(`ERRO na linha SKU=${sku} Endereço=${enderecoCode}:`, err.message);
      errors++;
    }
  }

  await conn.end();

  console.log('\n========== RESULTADO DA IMPORTAÇÃO ==========');
  console.log(`Produtos criados:     ${productsCreated}`);
  console.log(`Produtos existentes:  ${productsExisting}`);
  console.log(`Endereços criados:    ${locationsCreated}`);
  console.log(`Endereços existentes: ${locationsExisting}`);
  console.log(`Inventory inseridos:  ${inventoryCreated}`);
  console.log(`Inventory atualizados:${inventoryUpdated}`);
  console.log(`Erros:                ${errors}`);
  console.log('=============================================');
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
