/**
 * Script completo para comparar TODAS as tabelas do banco com o schema Drizzle.
 * Gera SQL de correção para colunas faltantes.
 */
import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;

async function getTableColumns(conn, tableName) {
  const [rows] = await conn.execute(
    `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA 
     FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? 
     ORDER BY ORDINAL_POSITION`,
    [tableName]
  );
  return rows;
}

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);
  
  // Obter todas as tabelas do banco
  const [tables] = await conn.execute("SHOW TABLES");
  const tableNames = tables.map(row => Object.values(row)[0]).filter(t => t !== '__drizzle_migrations');
  
  console.log(`\n=== Tabelas no banco: ${tableNames.length} ===\n`);
  
  // Para cada tabela, mostrar colunas
  const allTableColumns = {};
  for (const tableName of tableNames) {
    const cols = await getTableColumns(conn, tableName);
    allTableColumns[tableName] = cols.map(c => ({
      name: c.COLUMN_NAME,
      type: c.COLUMN_TYPE,
      nullable: c.IS_NULLABLE === 'YES',
      default: c.COLUMN_DEFAULT,
      extra: c.EXTRA,
    }));
  }
  
  await conn.end();
  
  // Salvar resultado em JSON para análise
  const fs = await import('fs');
  fs.writeFileSync('/tmp/db-schema.json', JSON.stringify(allTableColumns, null, 2));
  console.log('Schema do banco salvo em /tmp/db-schema.json');
  
  // Mostrar resumo de colunas por tabela
  for (const [table, cols] of Object.entries(allTableColumns)) {
    console.log(`${table}: ${cols.map(c => c.name).join(', ')}`);
  }
}

main().catch(console.error);
