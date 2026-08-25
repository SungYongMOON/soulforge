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
const FORBIDDEN_BODY_FIELDS = new Set(['body', 'html', 'text', 'content', 'raw_body', 'source_body']);
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

const refuse = (message) => { throw new ContractError(DBE_ERROR_CODES.SOURCE_TAMPERED, message); };

function requireExactPagePin(source, expectedPath) {
  const url = new URL(source.url);
  const finalUrl = new URL(source.final_url);
  if (url.protocol !== 'https:' || url.hostname !== 'www.postgresql.org' || url.pathname !== expectedPath || url.search || url.hash
      || finalUrl.href !== url.href) {
    refuse(`PostgreSQL source ${source.source_id} URL/final URL is not an exact allowed official locator`);
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
  const records = new Map(inventory.sources.map((source) => [source?.source_id, source]));
  const release = records.get(POSTGRESQL_18_6_RELEASE_REF_ID);
  if (!release || release.platform_version !== '18.6' || release.http_status !== 200
      || release.body_storage !== 'none' || !Number.isSafeInteger(release.byte_length) || release.byte_length <= 0
      || typeof release.content_sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(release.content_sha256)
      || !INSTANT.test(release.accessed_at_utc)) {
    refuse('PostgreSQL 18.6 release reference is not byte-pinned');
  }
  const rows = [];
  for (const sourceId of POSTGRESQL_18_6_EXECUTABLE_SOURCE_IDS) {
    const source = records.get(sourceId);
    if (!source) refuse(`PostgreSQL executable source ${sourceId} is missing`);
    requireExactPagePin(source, EXPECTED_PATH_BY_SOURCE[sourceId]);
    if (!Array.isArray(source.rule_ids) || source.rule_ids.length !== 1 || typeof source.rule_ids[0] !== 'string') {
      refuse(`PostgreSQL executable source ${sourceId} does not bind exactly one rule`);
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
