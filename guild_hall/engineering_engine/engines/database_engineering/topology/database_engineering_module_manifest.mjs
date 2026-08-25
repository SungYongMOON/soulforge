import { sha256Hex } from '../../../core/validators/fingerprint.mjs';

const freezeDeep = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
};

// This is a local manifest factory, not a release manifest. Caller-supplied pins avoid
// inventing a build/test claim and keep whole-engine release ownership outside this package.
export function createDatabaseEngineeringModuleManifest(input) {
  const expected = ['artifact_sha256', 'build_commit', 'configuration_hash', 'module_version', 'test_receipt_ref'];
  if (!input || typeof input !== 'object' || Array.isArray(input)
      || Object.keys(input).length !== expected.length || expected.some((key) => typeof input[key] !== 'string' || !input[key])) {
    throw new TypeError('DBE manifest factory requires exactly five caller-supplied non-empty string pins');
  }
  const configuration_digest = sha256Hex(`soulforge.database_engineering.manifest.v0\n${input.configuration_hash}`);
  return freezeDeep({
    module_id: 'soulforge.engineering_engine.database_engineering',
    module_version: input.module_version,
    build_commit: input.build_commit,
    artifact_sha256: input.artifact_sha256,
    configuration_hash: input.configuration_hash,
    configuration_digest,
    test_receipt_ref: input.test_receipt_ref,
    execution_mode: 'deterministic_only',
    claim_ceiling: 'source_supported',
    supported_platform_packs: ['sqlite:3.53.4', 'postgresql:18.6'],
    effects: { file_writes: 0, network_calls: 0, db_writes: 0, model_calls: 0 },
  });
}
