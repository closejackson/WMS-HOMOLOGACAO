import mysql from 'mysql2/promise';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MIGRATION_ORDER = [
  "0000_known_colossus",
  "0001_curious_malcolm_colcord",
  "0002_lethal_silver_centurion",
  "0003_exotic_black_tom",
  "0004_fantastic_talon",
  "0005_shocking_rachel_grey",
  "0006_faithful_kat_farrell",
  "0007_shallow_mikhail_rasputin",
  "0008_omniscient_madame_web",
  "0009_milky_dracula",
  "0010_goofy_red_wolf",
  "0011_oval_living_lightning",
  "0012_abnormal_master_chief",
  "0013_hesitant_colleen_wing",
  "0014_known_ultron",
  "0015_greedy_wendell_vaughn",
  "0016_serious_ronan",
  "0017_panoramic_mandroid",
  "0018_classy_mathemanic",
  "0019_yellow_slyde",
  "0020_black_tigra",
  "0021_light_paper_doll",
  "0022_skinny_felicia_hardy",
];

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error('DATABASE_URL not found!');
  process.exit(1);
}

console.log('Connecting to TiDB Cloud...');
console.log('URL:', DB_URL.substring(0, 40) + '...');

const conn = await mysql.createConnection({
  uri: DB_URL,
  ssl: { rejectUnauthorized: true },
  multipleStatements: false,
});

let ok = 0, skip = 0, errors = 0;

for (const migName of MIGRATION_ORDER) {
  const sqlFile = join(__dirname, 'drizzle', `${migName}.sql`);
  let content;
  try {
    content = readFileSync(sqlFile, 'utf-8');
  } catch {
    console.log(`⚠️  Not found: ${migName}.sql`);
    continue;
  }

  const statements = content.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean);
  console.log(`\n📄 ${migName} (${statements.length} stmts)`);

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    if (!stmt) continue;
    try {
      await conn.execute(stmt);
      ok++;
      process.stdout.write('.');
    } catch (e) {
      const code = e.code || '';
      const msg = e.message || '';
      if (
        code === 'ER_TABLE_EXISTS_ERROR' ||
        code === 'ER_DUP_FIELDNAME' ||
        code === 'ER_DUP_KEYNAME' ||
        code === 'ER_CANT_DROP_FIELD_OR_KEY' ||
        msg.includes('already exists') ||
        msg.includes('Duplicate key name') ||
        msg.includes('Duplicate column') ||
        msg.includes("Can't DROP")
      ) {
        skip++;
        process.stdout.write('s');
      } else {
        errors++;
        console.log(`\n  ❌ [${i+1}] ${e.message.substring(0, 100)}`);
      }
    }
  }
}

await conn.end();

console.log(`\n\n${'='.repeat(50)}`);
console.log(`✅ OK: ${ok} | ⏭️  SKIP: ${skip} | ❌ ERROR: ${errors}`);
console.log(`${'='.repeat(50)}`);
