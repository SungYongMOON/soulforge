// Handler for the existing installed sfx --g2-custody-inspect entrypoint.
// Direct execution is deliberately unavailable; no second installation anchor.
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

export async function inspectG2Custody(runtime) {
  runtime.recheck();
  runtime.checkFile(fileURLToPath(import.meta.url));
  {
    const { loadExecutionAuthority } = await import('./execution_authority.mjs');
    const { createG2LinearCustodyReader } = await import('./g2_linear_custody_reader.mjs');
    const { readRuntimeJson, runtimeExact } = await import('../dev_worker/feedback_runtime_io.mjs');
    const authority = loadExecutionAuthority(runtime);
    authority.entry('jobs.advance');
    // This fixed descriptor belongs to the protected installation config.
    // A CLI flag or source document cannot substitute a selection or scope.
    const fixed = runtime.config.g2_linear_custody;
    if (!runtimeExact(fixed, ['expectedBinding', 'producerRef', 'maxAgeMs', 'maximumBytes', 'selection']))
      throw new Error('G2_CUSTODY_CONFIG_HOLD');
    const selection = await readRuntimeJson(fixed.selection);
    if (!/^[a-f0-9]{64}$/u.test(fixed.selection.sha256)) throw new Error('G2_CUSTODY_CONFIG_HOLD');
    const reader = createG2LinearCustodyReader({ ...fixed, authority });
    const result = await reader.read(selection);
    try {
      runtime.recheck();
      return { ok: true, code: 'G2_CUSTODY_EXACT_CURRENT', issue_content_sha256: result.observation.issue_content_sha256,
        generation_seq: result.observation.generation_seq, execution_authority: false,
        publication: 'G2_FEEDBACK_MAPPING_UNBOUND' };
    } finally { result.bytes.fill(0); }
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = 2;
  process.stdout.write('{"ok":false,"code":"G2_CUSTODY_HOLD","publication":"G2_FEEDBACK_MAPPING_UNBOUND"}\n');
}
