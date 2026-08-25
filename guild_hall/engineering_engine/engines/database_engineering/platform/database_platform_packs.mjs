import { DATABASE_PLATFORM_FAMILIES } from '../rules/database_engineering_vocabulary.mjs';
import { POSTGRESQL_18_6_EXECUTABLE_SOURCE_IDS, POSTGRESQL_18_6_RELEASE_REF_ID } from '../rules/database_engineering_source_pins.mjs';

const freezeDeep = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
};

export const DATABASE_PLATFORM_PACKS = freezeDeep({
  sqlite: {
    family: 'sqlite',
    version: '3.53.4',
    source_revision: 'SQLITE-RELEASE-3.53.4',
    source_refs: [
      'SQLITE-FK-2026-03-20',
      'SQLITE-PRAGMA-2026-06-04',
      'SQLITE-TXN-2026-02-18',
      'SQLITE-ISOLATION-2022-04-18',
      'SQLITE-BACKUP-2025-11-13',
      'SQLITE-EQP-2025-05-31',
      'SQLITE-QUERY-PLANNER-2026-03-22',
    ],
    supported_rule_prefixes: ['DBE-COMMON-', 'DBE-SQLITE-'],
    exclusions: [
      'query-plan text is not a deterministic verdict input',
      'backup snapshot evidence is not RPO/RTO or DR sufficiency',
    ],
  },
  postgresql: {
    family: 'postgresql',
    version: '18.6',
    source_revision: 'POSTGRESQL-18.6-RELEASE',
    release_ref_id: POSTGRESQL_18_6_RELEASE_REF_ID,
    executable_source_ids: POSTGRESQL_18_6_EXECUTABLE_SOURCE_IDS,
    source_refs: [
      'POSTGRESQL-18-CONSTRAINTS',
      'POSTGRESQL-18-INDEXES',
      'POSTGRESQL-18-TRANSACTION-ISOLATION',
      'POSTGRESQL-18-RLS',
      'POSTGRESQL-18-PRIVILEGES',
      'POSTGRESQL-18-ALTER',
      'POSTGRESQL-18-BACKUP',
      'POSTGRESQL-18-BACKUP-PITR',
    ],
    supported_rule_prefixes: ['DBE-COMMON-', 'DBE-POSTGRESQL-'],
    exclusions: [
      'major-version documentation must be revalidated for another minor release',
      'PITR capability does not prove project RPO/RTO or DR sufficiency',
    ],
  },
});

export function resolveDatabasePlatformPack(platform) {
  if (!platform || typeof platform !== 'object') return null;
  if (!DATABASE_PLATFORM_FAMILIES.includes(platform.family)) return null;
  const pack = DATABASE_PLATFORM_PACKS[platform.family];
  return pack && pack.version === platform.version ? pack : null;
}

export function platformAppliesToRule(rule, pack) {
  if (!pack || !(rule.platforms.includes('common') || rule.platforms.includes(pack.family))) return false;
  if (pack.family === 'postgresql' && rule.kind === 'hard_technical' && rule.platforms.includes('postgresql')) {
    return rule.source_refs.every((sourceId) => pack.executable_source_ids.includes(sourceId));
  }
  return true;
}
