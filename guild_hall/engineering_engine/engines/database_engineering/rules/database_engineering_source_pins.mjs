import { ContractError } from '../../../core/validators/errors.mjs';
import { DBE_ERROR_CODES } from './database_engineering_vocabulary.mjs';

export const POSTGRESQL_18_6_RELEASE_REF_ID = 'POSTGRESQL-18.6-RELEASE';
export const POSTGRESQL_18_6_EXECUTABLE_SOURCE_IDS = Object.freeze([
  'POSTGRESQL-18-BACKUP-PITR',
  'POSTGRESQL-18-CONSTRAINTS',
  'POSTGRESQL-18-RLS',
  'POSTGRESQL-18-TRANSACTION-ISOLATION',
]);

const EXPECTED_PATH_BY_SOURCE = Object.freeze({
  'POSTGRESQL-18-CONSTRAINTS': '/docs/18/ddl-constraints.html',
  'POSTGRESQL-18-TRANSACTION-ISOLATION': '/docs/18/transaction-iso.html',
  'POSTGRESQL-18-RLS': '/docs/18/ddl-rowsecurity.html',
  'POSTGRESQL-18-BACKUP-PITR': '/docs/18/continuous-archiving.html',
});
export const POSTGRESQL_18_6_EXPECTED_RULE_BY_SOURCE = Object.freeze({
  'POSTGRESQL-18-CONSTRAINTS': 'DBE-POSTGRESQL-CONSTRAINT-001',
  'POSTGRESQL-18-TRANSACTION-ISOLATION': 'DBE-POSTGRESQL-ISOLATION-001',
  'POSTGRESQL-18-RLS': 'DBE-POSTGRESQL-RLS-001',
  'POSTGRESQL-18-BACKUP-PITR': 'DBE-POSTGRESQL-PITR-001',
});
const FORBIDDEN_BODY_FIELDS = new Set(['body', 'html', 'text', 'content', 'raw_body', 'source_body']);
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

const refuse = (message) => { throw new ContractError(DBE_ERROR_CODES.SOURCE_TAMPERED, message); };

function requireExactPagePin(source, expectedPath) {
  const expectedUrl = `https://www.postgresql.org${expectedPath}`;
  if (!source || typeof source !== 'object' || Array.isArray(source)
      || source.url !== expectedUrl || source.final_url !== expectedUrl) {
    refuse(`PostgreSQL source ${source?.source_id ?? 'unknown'} URL/final URL is not the exact canonical locator`);
  }
  if (source.platform_family !== 'postgresql' || source.platform_version !== '18.6'
      || source.release_ref_id !== POSTGRESQL_18_6_RELEASE_REF_ID
      || source.request_profile_id !== 'postgresql_public_html_identity_v0'
      || source.http_status !== 200 || source.content_type !== 'text/html'
      || source.content_encoding !== 'identity' || source.text_encoding !== 'utf-8'
      || source.hash_basis !== 'raw_http_entity_bytes_after_transfer_coding'
      || source.body_storage !== 'none' || !INSTANT.test(source.accessed_at_utc)
      || !Number.isSafeInteger(source.byte_length) || source.byte_length <= 0
      || typeof source.content_sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(source.content_sha256)) {
    refuse(`PostgreSQL source ${source.source_id} does not carry a complete exact 18.6 byte pin`);
  }
  for (const field of FORBIDDEN_BODY_FIELDS) {
    if (Object.hasOwn(source, field)) refuse(`PostgreSQL source ${source.source_id} contains forbidden source body field ${field}`);
  }
}

// Test-time/source-admission validator. It receives metadata only and never fetches or stores
// a source body. Runtime behavior remains zero-network and instead consumes the closed pack IDs.
export function validatePostgresql18_6ExecutableSourcePins(inventory) {
  if (!inventory || typeof inventory !== 'object' || !Array.isArray(inventory.sources)) {
    refuse('source inventory must carry a sources array');
  }
  const sourceIds = inventory.sources.map((source) => source?.source_id);
  if (sourceIds.some((sourceId) => typeof sourceId !== 'string') || new Set(sourceIds).size !== sourceIds.length) {
    refuse('source inventory contains duplicate or malformed source_id rows');
  }
  const records = new Map(inventory.sources.map((source) => [source.source_id, source]));
  const release = records.get(POSTGRESQL_18_6_RELEASE_REF_ID);
  if (!release || release.url !== 'https://www.postgresql.org/docs/release/18.6/'
      || release.final_url !== release.url || release.platform_family !== 'postgresql'
      || release.platform_version !== '18.6' || release.request_profile_id !== 'postgresql_public_html_identity_v0'
      || release.http_status !== 200 || release.content_type !== 'text/html' || release.content_encoding !== 'identity'
      || release.text_encoding !== 'utf-8' || release.hash_basis !== 'raw_http_entity_bytes_after_transfer_coding'
      || release.body_storage !== 'none' || !Number.isSafeInteger(release.byte_length) || release.byte_length <= 0
      || typeof release.content_sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(release.content_sha256)
      || !INSTANT.test(release.accessed_at_utc)) {
    refuse('PostgreSQL 18.6 release reference is not byte-pinned');
  }
  for (const field of FORBIDDEN_BODY_FIELDS) {
    if (Object.hasOwn(release, field)) refuse(`PostgreSQL 18.6 release reference contains forbidden source body field ${field}`);
  }
  const rows = [];
  for (const sourceId of POSTGRESQL_18_6_EXECUTABLE_SOURCE_IDS) {
    const source = records.get(sourceId);
    if (!source) refuse(`PostgreSQL executable source ${sourceId} is missing`);
    requireExactPagePin(source, EXPECTED_PATH_BY_SOURCE[sourceId]);
    if (!Array.isArray(source.rule_ids) || source.rule_ids.length !== 1 || source.rule_ids[0] !== POSTGRESQL_18_6_EXPECTED_RULE_BY_SOURCE[sourceId]) {
      refuse(`PostgreSQL executable source ${sourceId} does not bind its exact expected rule`);
    }
    rows.push(Object.freeze({
      source_id: sourceId,
      rule_id: source.rule_ids[0],
      byte_length: source.byte_length,
      content_sha256: source.content_sha256,
    }));
  }
  return Object.freeze(rows.sort((left, right) => left.source_id.localeCompare(right.source_id)));
}
