const freeze = (value) => Object.freeze(value);

// Internal deep Module: it turns a small schema description into deterministic structural
// observations without becoming a schema parser or connecting to a database.
export function analyseSchemaGraph(schema = {}) {
  const tables = Array.isArray(schema.tables) ? schema.tables : [];
  const names = new Set();
  const duplicate_tables = [];
  const missing_foreign_key_targets = [];
  for (const table of tables) {
    if (!table || typeof table.name !== 'string') continue;
    if (names.has(table.name)) duplicate_tables.push(table.name);
    names.add(table.name);
  }
  for (const table of tables) {
    for (const foreignKey of Array.isArray(table?.foreign_keys) ? table.foreign_keys : []) {
      if (typeof foreignKey?.target_table === 'string' && !names.has(foreignKey.target_table)) {
        missing_foreign_key_targets.push(`${table.name}->${foreignKey.target_table}`);
      }
    }
  }
  return freeze({
    table_count: names.size,
    duplicate_tables: freeze([...new Set(duplicate_tables)].sort()),
    missing_foreign_key_targets: freeze([...new Set(missing_foreign_key_targets)].sort()),
    structurally_consistent: duplicate_tables.length === 0 && missing_foreign_key_targets.length === 0,
  });
}
