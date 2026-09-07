// Separate Node process: exercises restart using the real product binder and
// persisted synthetic state. No Hermes/model/provider is imported or invoked.
import { readFile } from 'node:fs/promises';
import { bindHermesNativeRuntime } from '../src/hermes_native_runtime.mjs';
import { createHermesNativeAttemptStore } from '../src/hermes_native_attempt_store.mjs';
import { digestOf } from '../../../../guild_hall/agent_observation/guard_primitives.mjs';

const config = JSON.parse(await readFile(process.argv[2], 'utf8'));
if (process.argv[3] === 'reserve-only') {
  const result = await createHermesNativeAttemptStore({ directory: config.attempt_directory }).reserve({
    claim: config.input.claim,
    session_key: digestOf({ home: config.runtime_binding.HERMES_HOME, session: config.runtime_binding.session_ref }).slice(7),
    attempt: { operation_id: 'process-crash-before-prompt', fencing_epoch: 1, attempt_no: 1 },
  });
  process.stdout.write(JSON.stringify({ status: result.status }));
} else {
  let briefReads = 0;
  const bound = bindHermesNativeRuntime({ ...config, now: () => config.clock,
    resolveCurrentState: async (request) => ({ authority_request: config.authority_request,
      brief_binding: config.brief_binding, runtime_capability: { ...request.runtime_capability,
        evaluated_at: new Date(config.clock).toISOString(), expires_at: new Date(config.clock + 60_000).toISOString() } }),
    resolveWorkBrief: async () => { briefReads += 1; return config.forge_request; },
  });
  const outcome = bound.status === 'BOUND' ? await bound.executor.execute(config.input) : bound;
  process.stdout.write(JSON.stringify({ outcome, brief_reads: briefReads }));
}
