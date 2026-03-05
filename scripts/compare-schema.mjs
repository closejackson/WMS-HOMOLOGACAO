/**
 * Script para comparar o schema Drizzle com o banco real e gerar SQL de correção.
 * Identifica colunas faltantes em cada tabela.
 */
import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;

// Schema esperado pelo Drizzle (extraído do schema.ts)
// Formato: { tableName: [{ name, type, nullable, default }] }
const EXPECTED_SCHEMA = {
  users: [
    { name: 'id', type: 'int(11)', nullable: false, extra: 'auto_increment' },
    { name: 'openId', type: 'varchar(64)', nullable: false },
    { name: 'name', type: 'text', nullable: true },
    { name: 'email', type: 'varchar(320)', nullable: true },
    { name: 'loginMethod', type: 'varchar(64)', nullable: true },
    { name: 'role', type: "enum('user','admin','operator','quality','manager')", nullable: false, default: 'user' },
    { name: 'tenantId', type: 'int(11)', nullable: true },
    { name: 'createdAt', type: 'timestamp', nullable: false, default: 'CURRENT_TIMESTAMP' },
    { name: 'updatedAt', type: 'timestamp', nullable: false, default: 'CURRENT_TIMESTAMP' },
    { name: 'lastSignedIn', type: 'timestamp', nullable: false, default: 'CURRENT_TIMESTAMP' },
  ],
  labelAssociations: [
    { name: 'id', type: 'int(11)', nullable: false, extra: 'auto_increment' },
    { name: 'tenantId', type: 'int(11)', nullable: false },
    { name: 'labelCode', type: 'varchar(100)', nullable: false },
    { name: 'uniqueCode', type: 'varchar(200)', nullable: false },
    { name: 'productId', type: 'int(11)', nullable: false },
    { name: 'batch', type: 'varchar(100)', nullable: true },
    { name: 'expiryDate', type: 'date', nullable: true },
    { name: 'unitsPerBox', type: 'int(11)', nullable: false },
    { name: 'totalUnits', type: 'int(11)', nullable: false, default: '0' },
    { name: 'associatedBy', type: 'int(11)', nullable: false },
    { name: 'associatedAt', type: 'timestamp', nullable: false, default: 'CURRENT_TIMESTAMP' },
  ],
};

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);
  
  // Obter todas as tabelas do banco
  const [tables] = await conn.execute("SHOW TABLES");
  const tableNames = tables.map(row => Object.values(row)[0]);
  
  console.log(`\n=== Tabelas no banco: ${tableNames.length} ===`);
  console.log(tableNames.join(', '));
  
  // Para cada tabela esperada, verificar colunas faltantes
  const missingColumns = {};
  
  for (const [tableName, expectedCols] of Object.entries(EXPECTED_SCHEMA)) {
    const [actualCols] = await conn.execute(
      'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = ? ORDER BY ORDINAL_POSITION',
      [tableName]
    );
    const actualColNames = actualCols.map(r => r.COLUMN_NAME);
    const expectedColNames = expectedCols.map(c => c.name);
    
    const missing = expectedColNames.filter(c => !actualColNames.includes(c));
    const extra = actualColNames.filter(c => !expectedColNames.includes(c));
    
    if (missing.length > 0 || extra.length > 0) {
      console.log(`\n--- ${tableName} ---`);
      if (missing.length > 0) console.log(`  FALTANDO no banco: ${missing.join(', ')}`);
      if (extra.length > 0) console.log(`  EXTRA no banco (não no schema): ${extra.join(', ')}`);
      missingColumns[tableName] = { missing, extra, actualCols: actualColNames };
    }
  }
  
  await conn.end();
  
  if (Object.keys(missingColumns).length === 0) {
    console.log('\n✅ Todas as tabelas verificadas estão sincronizadas!');
  }
}

main().catch(console.error);
