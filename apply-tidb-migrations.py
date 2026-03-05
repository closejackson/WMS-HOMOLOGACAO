#!/usr/bin/env python3
"""
Script para aplicar as migrations do WMS Med@x no banco TiDB Cloud.
Usa o DATABASE_URL do ambiente Manus.
"""
import os
import re
import subprocess
import json

# Ordem das migrations conforme o journal
MIGRATION_ORDER = [
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
]

DRIZZLE_DIR = os.path.join(os.path.dirname(__file__), "drizzle")

def get_sql_statements(filepath):
    """Lê um arquivo SQL e divide em statements individuais."""
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    # Dividir nos breakpoints do drizzle-kit
    parts = re.split(r"--> statement-breakpoint", content)
    statements = []
    for part in parts:
        stmt = part.strip()
        if stmt:
            statements.append(stmt)
    return statements

def run_sql(stmt, db_url):
    """Executa um statement SQL via node."""
    safe_stmt = stmt.replace('`', '\\`').replace('${', '\\${')
    script = f"""
const mysql = require('mysql2/promise');
async function run() {{
  const conn = await mysql.createConnection({{
    uri: '{db_url}',
    ssl: {{ rejectUnauthorized: true }}
  }});
  try {{
    await conn.execute(`{safe_stmt}`);
    console.log('OK');
  }} catch(e) {{
    if (e.code === 'ER_TABLE_EXISTS_ERROR' || e.code === 'ER_DUP_FIELDNAME' || 
        e.code === 'ER_DUP_KEYNAME' || e.code === 'ER_CANT_DROP_FIELD_OR_KEY' ||
        e.message.includes('already exists') || e.message.includes('Duplicate')) {{
      console.log('SKIP (already exists)');
    }} else {{
      console.error('ERROR:', e.message);
      process.exit(1);
    }}
  }} finally {{
    await conn.end();
  }}
}}
run();
"""
    result = subprocess.run(
        ["node", "-e", script],
        capture_output=True, text=True, cwd=os.path.dirname(__file__)
    )
    if result.returncode != 0:
        raise Exception(f"SQL Error: {result.stderr}")
    return result.stdout.strip()

def main():
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("❌ DATABASE_URL não encontrada!")
        return

    print(f"✅ Conectando ao banco TiDB Cloud...")
    print(f"   URL: {db_url[:40]}...")
    
    total_ok = 0
    total_skip = 0
    total_error = 0

    for migration_name in MIGRATION_ORDER:
        sql_file = os.path.join(DRIZZLE_DIR, f"{migration_name}.sql")
        if not os.path.exists(sql_file):
            print(f"⚠️  Arquivo não encontrado: {migration_name}.sql")
            continue
        
        statements = get_sql_statements(sql_file)
        print(f"\n📄 {migration_name} ({len(statements)} statements)")
        
        for i, stmt in enumerate(statements):
            if not stmt.strip():
                continue
            try:
                result = run_sql(stmt, db_url)
                if "SKIP" in result:
                    total_skip += 1
                    print(f"   [{i+1}] ⏭️  SKIP")
                else:
                    total_ok += 1
                    print(f"   [{i+1}] ✅ OK")
            except Exception as e:
                total_error += 1
                print(f"   [{i+1}] ❌ ERROR: {e}")
                # Continuar mesmo com erros não críticos

    print(f"\n{'='*50}")
    print(f"✅ OK: {total_ok} | ⏭️  SKIP: {total_skip} | ❌ ERROR: {total_error}")
    print(f"{'='*50}")

if __name__ == "__main__":
    main()
