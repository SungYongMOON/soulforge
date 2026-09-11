// Standalone read-only Context Engine entry. Explicit binding; default off.
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { createSyntheticAcceptedContextRuntime } from './adapters/accepted_context_synthetic_runtime.mjs';
import { makeUniformNotAvailable } from './guards/accepted_context_query.mjs';
import { DEFAULT_CONTEXT_PROFILE } from '../profiles/default_v1.mjs';
import { PREPARATION_PROFILE } from '../algorithms/preparation/pinned_pdf_v1.mjs';
import { REPRESENTATION_PROFILE } from '../algorithms/representation/accepted_typed_v1.mjs';
import { RETRIEVAL_PROFILE } from '../algorithms/retrieval/bm25_v1.mjs';
import { MEMORY_PROFILE } from '../algorithms/memory/ranked_decision_v1.mjs';
import { ASSEMBLY_PROFILE } from '../algorithms/assembly/bounded_pack_v1.mjs';
import { prepareDerivedGeneration } from './runtime/generation_update.mjs';
import { isPairStoreBinding, querySelectedContext, selectGeneration, verifyPreparedInstall,
  queryPinnedGeneration as queryPinnedGenerationCore } from './runtime/pair_store.mjs';
import { UPDATE_PROFILES } from '../profiles/update_profiles.mjs';
import { INSTALLED_UPDATE_PROFILE } from '../profiles/selected_update.mjs';

export { DEFAULT_CONTEXT_PROFILE };
export { UPDATE_PROFILES, selectGeneration };
export function queryPinnedGeneration(args) {
  if(!isDeepStrictEqual(args.pair?.engine?.composition,INSTALLED_UPDATE_PROFILE))return makeUniformNotAvailable();
  return queryPinnedGenerationCore({...args,engineEntryUrl:import.meta.url});
}
export async function updatePinnedGeneration(args) {
  if(!isDeepStrictEqual(args.request?.composition,INSTALLED_UPDATE_PROFILE))throw new Error('installed profile mismatch');
  verifyPreparedInstall({...args,engineEntryUrl:import.meta.url});
  return prepareDerivedGeneration(args);
}
export { preparePinnedPdfCandidate } from '../algorithms/preparation/pinned_pdf_v1.mjs';
export { createSyntheticAcceptedContextRuntime };
export { createProjectAcceptedContextRuntime } from './adapters/accepted_context_project_runtime.mjs';
export { createAcceptedContextReader } from './runtime/accepted_context_reader.mjs';
export { createExactSourceReadback } from './adapters/exact_source_readback.mjs';
export { createObservedContextQuery } from './runtime/observed_context_query.mjs';
export { createAcceptedContextPack, finalizeContextPackObservation, CONTEXT_PACK_POLICY, CONTEXT_PACK_LIMITS } from './runtime/accepted_context_pack.mjs';
export { createAcceptedContextQuery, makeUniformNotAvailable, ACCEPTED_CONTEXT_QUERY_CODES,
  ACCEPTED_CONTEXT_QUERY_RESULT_SCHEMA } from './guards/accepted_context_query.mjs';
export { readTypedMemory, MEMORY_KINDS } from './guards/accepted_context_typed_memory.mjs';

export function createContextEngineRuntime({ root, bindingSha256, syntheticOnly = false } = {}) {
  if(syntheticOnly && isPairStoreBinding({storeRoot:root,bindingSha256})) {
    return Object.freeze({contextPack:request=>querySelectedContext({storeRoot:root,bindingSha256,request})});
  }
  // These are the concrete implementations imported by the runtime, not a
  // configurable registry. Unsupported composition must not silently fall back.
  const composition = { preparation: PREPARATION_PROFILE, representation: REPRESENTATION_PROFILE,
    retrieval: RETRIEVAL_PROFILE, memory: MEMORY_PROFILE, assembly: ASSEMBLY_PROFILE };
  if (DEFAULT_CONTEXT_PROFILE.profile_id !== 'context-engine/default-v1'
    || DEFAULT_CONTEXT_PROFILE.profile_version !== '0.1.0'
    || Object.entries(composition).some(([key, value]) => DEFAULT_CONTEXT_PROFILE[key] !== value)) return null;
  return createSyntheticAcceptedContextRuntime({ root, bindingSha256, syntheticOnly });
}

export async function main(argv = process.argv.slice(2), { stdout = process.stdout, stderr = process.stderr } = {}) {
  try {
    const options = {};
    const values = new Set(['--root', '--binding-sha256', '--request-json','--operation']);
    for (let i = 0; i < argv.length; i++) {
      const name = argv[i];
      if (Object.hasOwn(options, name)) throw new Error();
      if (name === '--synthetic-only') options[name] = true;
      else if (values.has(name) && typeof argv[i + 1] === 'string' && !argv[i + 1].startsWith('--')) options[name] = argv[++i];
      else throw new Error();
    }
    if (!isAbsolute(options['--root'] || '') || !/^sha256:[0-9a-f]{64}$/u.test(options['--binding-sha256'] || '')
      || typeof options['--request-json'] !== 'string' || Buffer.byteLength(options['--request-json'], 'utf8') > 32768) throw new Error();
    const request = JSON.parse(options['--request-json']);
    const operation=options['--operation'] || 'query';
    if(!['query','update','select'].includes(operation))throw new Error();
    if(operation!=='query'){
      if(options['--synthetic-only']!==true)throw new Error();
      const args={storeRoot:options['--root'],bindingSha256:options['--binding-sha256'],request};
      const result=operation==='update'?await updatePinnedGeneration(args):await selectGeneration(args);
      stdout.write(`${JSON.stringify(result)}\n`);return 0;
    }
    const runtime = createContextEngineRuntime({ root: options['--root'], bindingSha256: options['--binding-sha256'],
      syntheticOnly: options['--synthetic-only'] === true });
    const result = runtime ? await runtime.contextPack(request) : makeUniformNotAvailable();
    stdout.write(`${JSON.stringify(result)}\n`);
    return 0;
  } catch {
    stderr.write('[context-engine] explicit binding and inline JSON request required\n');
    return 2;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) process.exitCode = await main();
