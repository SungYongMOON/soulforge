import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSoulforgeStateRoot } from '../../../guild_hall/shared/soulforge_state_root.mjs';
import { createTopologyAdapterPlugin } from './src/server/topology-adapter.mjs';
import { createTopologyFederationAdapterPlugin } from './src/server/topology-federation-adapter.mjs';
import { createTopologyRecoveryAdapterPlugin } from './src/server/topology-recovery-adapter.mjs';
import { createAiUsageAdapterPlugin } from './src/server/ai-usage-adapter.mjs';
import { createOperationsDirectoryPlugin } from './src/server/operations-directory-adapter.mjs';
import { createGraphReceiptPlugin } from './src/server/operations-graph-receipts-adapter.mjs';
import { createOperationsPreviewReadPlugin } from './src/server/operations-preview-read-adapter.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const stateRoot = resolveSoulforgeStateRoot(process.env, () => path.resolve(root, '../../../guild_hall/state'));
// Dedicated preview: only existing snapshot readers. No enrollment, collector,
// probe, scheduler, quota refresh, database connection, or repair companion.
export default defineConfig({
  root,
  plugins: [react(), createTopologyAdapterPlugin({ readOnlyPilot: true, snapshotPath: '/operations-health.snapshot.json' }), createTopologyFederationAdapterPlugin(),
    createTopologyAdapterPlugin({ readOnlyPilot: true }), createOperationsPreviewReadPlugin(),
    createTopologyRecoveryAdapterPlugin({ evidenceRoot: path.join(stateRoot, 'operations/watchtower/external_evidence') }),
    createAiUsageAdapterPlugin({ registryPath: path.join(stateRoot, 'operations/team_ops_board/thread_visibility.v1.json'),
      usageMeterStateRoot: path.join(stateRoot, 'operations/ai_usage_meter') }),
    createGraphReceiptPlugin({ receiptsRoot: process.env.TEAM_OPS_GRAPH_RECEIPTS_ROOT, projects: (process.env.TEAM_OPS_GRAPH_PROJECTS || '').split(',').filter(Boolean), responseAgentLabel: process.env.TEAM_OPS_RESPONSE_AGENT_LABEL }),
    createOperationsDirectoryPlugin({ tablePath: process.env.TEAM_OPS_DIRECTORY_ROOT_TABLE, expectedSha256: process.env.TEAM_OPS_DIRECTORY_ROOT_TABLE_SHA256 })],
  server: { host: '127.0.0.1', port: 4194, strictPort: true, open: false },
  preview: { host: '127.0.0.1', port: 4194, strictPort: true },
  build: { outDir: 'dist-operations', rollupOptions: { input: { board: path.join(root,'index.html'), operations: path.join(root, 'operations-map.html'), console: path.join(root, 'operations-console.html') } } },
});
