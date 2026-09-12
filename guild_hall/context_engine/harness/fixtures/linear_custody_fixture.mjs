// Real Linear custody for tests: the actual linear_history runner over its own
// synthetic transport, so the adapter reads the same create-only files a live
// Tributary lane writes. No network and no credential value - the transport never
// sends one, and the runner only requires a well-formed file to exist.
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LINEAR_COLLECT_BINDING_SCHEMA_VERSION, runLinearCollect } from '../../../linear_history/linear_collect_runner.mjs';
import { createSyntheticLinearTransport, loadSyntheticLinearFixture } from '../../../linear_history/linear_synthetic_transport.mjs';

const REPO = path.resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
const FIXTURE = fileURLToPath(new URL('../../../linear_history/fixtures/synthetic_linear_workspace.json', import.meta.url));
const ALPHA = '5e6f7081-92a3-4ebf-80d1-4c5d6e7f8091';
export const LINEAR_ROOT_REF = 'linear.synthetic';

export async function syntheticLinearCustody() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ctx-src-linear-'));
  const runtimeRoot = path.join(root, 'runtime'), privateRoot = path.join(root, 'private');
  await mkdir(runtimeRoot, { recursive: true });
  const binding = { schema_version: LINEAR_COLLECT_BINDING_SCHEMA_VERSION, feature_enabled: true,
    lane_id: 'hpp-linear-collect', private_root: privateRoot, data_root: path.join(privateRoot, 'ingress', 'linear'),
    state_root: path.join(privateRoot, 'linear_history', 'state'), forbidden_roots: [REPO, runtimeRoot],
    writer: { authority_id: 'hpp-linear-collect-writer', epoch: 1 },
    credentials: { api_key_env: null, api_key_file: path.join(privateRoot, 'config', 'linear_history', 'credentials', 'linear_api_key.txt') },
    workspace: { url_key: 'synthetic-forge', organization_id: null,
      project_scope_map: [{ linear_project_id: ALPHA, project_scope_ref: 'project:syn-alpha' }] },
    cursor: { overlap_seconds: 300, initial_updated_at: null, page_size: 50, max_pages_per_run: 10, timeout_ms: 15000 } };
  await mkdir(path.dirname(binding.credentials.api_key_file), { recursive: true });
  await writeFile(binding.credentials.api_key_file, `lin_api_${'a1b2c3d4'.repeat(5)}\n`);
  const bindingPath = path.join(privateRoot, 'config', 'linear_history', 'linear_collect.binding.json');
  const bytes = Buffer.from(`${JSON.stringify(binding, null, 2)}\n`);
  await writeFile(bindingPath, bytes);
  const fixture = await loadSyntheticLinearFixture(FIXTURE);
  const run = await runLinearCollect({ binding_path: bindingPath,
    expected_binding_sha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    repository_root: REPO, runtime_root: runtimeRoot, state_root: binding.state_root,
    transport_factory: async () => createSyntheticLinearTransport(fixture, { page_size: 50 }),
    clock: { now: () => new Date('2026-09-01T02:00:00.000Z') }, run_id: 'run-0001' });
  if (run.status !== 'ok') throw new Error(`synthetic linear collect failed: ${run.status}`);
  const custodyRoot = path.join(privateRoot, 'ingress', 'linear', 'synthetic-forge');
  const issue = identifier => fixture.issues.find(row => row.identifier === identifier).id;
  return { custodyRoot, fixture, issue, roots: { [LINEAR_ROOT_REF]: custodyRoot } };
}
