#!/usr/bin/env python3
"""
Compara as colunas do banco real com o schema Drizzle e gera SQL de correção.
"""
import json
import re
import subprocess
import os

# Carregar schema do banco
with open('/tmp/db-schema.json') as f:
    db_schema = json.load(f)

# Ler o schema Drizzle
with open('/home/ubuntu/wms-medax/drizzle/schema.ts') as f:
    drizzle_content = f.read()

# Extrair tabelas e colunas do schema Drizzle via regex
# Procura por padrões como: columnName: type("columnName"...)
table_pattern = re.compile(
    r'export const (\w+) = mysqlTable\("(\w+)",\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}',
    re.DOTALL
)

col_pattern = re.compile(
    r'^\s+(\w+):\s+\w+\("(\w+)"',
    re.MULTILINE
)

drizzle_tables = {}
for match in table_pattern.finditer(drizzle_content):
    var_name = match.group(1)
    table_name = match.group(2)
    cols_block = match.group(3)
    
    cols = []
    for col_match in col_pattern.finditer(cols_block):
        col_db_name = col_match.group(2)
        cols.append(col_db_name)
    
    drizzle_tables[table_name] = cols

print(f"Tabelas no schema Drizzle: {len(drizzle_tables)}")
print(f"Tabelas no banco: {len(db_schema)}")
print()

# Comparar
missing_cols_sql = []
extra_cols = []
missing_tables = []

for table_name, drizzle_cols in drizzle_tables.items():
    if table_name not in db_schema:
        missing_tables.append(table_name)
        print(f"⚠️  TABELA FALTANDO no banco: {table_name}")
        continue
    
    db_cols = [c['name'] for c in db_schema[table_name]]
    
    missing = [c for c in drizzle_cols if c not in db_cols]
    extra = [c for c in db_cols if c not in drizzle_cols]
    
    if missing:
        print(f"❌ {table_name}: colunas FALTANDO no banco: {missing}")
        for col in missing:
            missing_cols_sql.append(f"-- {table_name}.{col}")
    
    if extra:
        print(f"ℹ️  {table_name}: colunas EXTRAS no banco (não no schema): {extra}")

print()
print("=" * 60)
print(f"Total de tabelas com colunas faltando: {len([t for t in drizzle_tables if any(c not in [x['name'] for x in db_schema.get(t, [])] for c in drizzle_tables[t])])}")

# Agora gerar o SQL de correção para as colunas faltantes
# Precisamos saber o tipo de cada coluna faltante
print()
print("=== SQL DE CORREÇÃO ===")

# Mapeamento de tipos Drizzle -> MySQL
def get_col_type_from_drizzle(table_name, col_name, content):
    """Extrai o tipo da coluna do schema Drizzle"""
    # Procura pelo padrão: colName: type("colName", ...) ou colName: mysqlEnum(...)
    patterns = [
        rf'{col_name}:\s+varchar\("{col_name}",\s*\{{.*?length:\s*(\d+).*?\}}\)',
        rf'{col_name}:\s+text\("{col_name}"\)',
        rf'{col_name}:\s+int\("{col_name}"\)',
        rf'{col_name}:\s+boolean\("{col_name}"\)',
        rf'{col_name}:\s+timestamp\("{col_name}"\)',
        rf'{col_name}:\s+date\("{col_name}"\)',
        rf'{col_name}:\s+decimal\("{col_name}",\s*\{{.*?precision:\s*(\d+).*?scale:\s*(\d+).*?\}}\)',
        rf'{col_name}:\s+mysqlEnum\("{col_name}",\s*\[([^\]]+)\]\)',
        rf'{col_name}:\s+json\("{col_name}"\)',
        rf'{col_name}:\s+bigint\("{col_name}",\s*\{{.*?mode:\s*"[^"]*".*?\}}\)',
        rf'{col_name}:\s+float\("{col_name}"\)',
        rf'{col_name}:\s+double\("{col_name}"\)',
    ]
    
    for p in patterns:
        m = re.search(p, content, re.DOTALL)
        if m:
            return p, m.groups()
    return None, None

for table_name, drizzle_cols in drizzle_tables.items():
    if table_name not in db_schema:
        continue
    
    db_cols = [c['name'] for c in db_schema[table_name]]
    missing = [c for c in drizzle_cols if c not in db_cols]
    
    if not missing:
        continue
    
    print(f"\n-- Tabela: {table_name}")
    for col in missing:
        # Tentar extrair o tipo do schema Drizzle
        # Procurar pela linha que define esta coluna
        col_line_pattern = rf'\b{col}\s*:\s*([^\n,]+(?:\([^)]*\))?[^\n,]*)'
        m = re.search(col_line_pattern, drizzle_content)
        if m:
            line = m.group(0).strip()
            print(f"  -- {col}: {line}")
        else:
            print(f"  -- {col}: (tipo não encontrado)")
