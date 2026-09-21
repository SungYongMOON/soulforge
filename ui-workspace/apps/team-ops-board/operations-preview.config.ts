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
import { createRagOperationsPlugin } from './src/server/rag-operations-adapter.mjs';
import { createOperationsSpacesPlugin } from './src/server/operations-spaces-adapter.mjs';
import { createLocalModelStatusPlugin } from './src/server/local-model-status-adapter.mjs';
import { createCodexQuotaPlugin } from './src/server/codex-quota-read.mjs';
import { createMailRulePlugin } from './src/server/mail-rule-adapter.mjs';
import { readOperationsReadConfiguration } from './src/server/operations-read-configuration.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const stateRoot = resolveSoulforgeStateRoot(process.env, () => path.resolve(root, '../../../guild_hall/state'));
// Dedicated preview: only existing snapshot readers. No enrollment, collector,
// scheduled probe, scheduler or repair companion. Codex quota uses a bounded
// account/rateLimits/read RPC on demand with a 60-second cache. Model status
// uses fixed metadata GETs only. RAG uses the existing
// local database inspector only (no embedding, retrieval/model call or writer).
export default defineConfig(async () => {
  const operationsRead = await readOperationsReadConfiguration({
    bindingPath: path.join(stateRoot, 'operations/team_ops_board', 'operations_read_config.json'),
    env: process.env,
  });
  return {
    root,
    plugins: [
      react(),
      createLocalModelStatusPlugin({
        tablePath: operationsRead.directory.tablePath,
        expectedSha256: operationsRead.directory.expectedSha256,
        projects: operationsRead.graph.projects,
        remoteLabel: process.env.TEAM_OPS_REMOTE_MODEL_LABEL || operationsRead.graph.responseAgentLabel,
        localTargets: [
          ...(process.env.TEAM_OPS_LOCAL_MODEL_HOST ? [{ id: 'gpu-response', label: 'GPU PC · 응답 모델', origin: process.env.TEAM_OPS_LOCAL_MODEL_HOST, transport: 'openai_chat' }] : []),
          ...(process.env.TEAM_OPS_LOCAL_OLLAMA_HOST ? [{ id: 'local-ollama', label: '이 PC · 별도 Ollama', origin: process.env.TEAM_OPS_LOCAL_OLLAMA_HOST, transport: 'ollama' }] : []),
        ],
      }),
      createOperationsSpacesPlugin({
        tablePath: operationsRead.directory.tablePath,
        expectedSha256: operationsRead.directory.expectedSha256,
        projects: operationsRead.graph.projects,
      }),
      createTopologyAdapterPlugin({ readOnlyPilot: true, snapshotPath: '/operations-health.snapshot.json' }),
      createTopologyFederationAdapterPlugin(),
      createRagOperationsPlugin({
        tablePath: operationsRead.directory.tablePath,
        expectedSha256: operationsRead.directory.expectedSha256,
        receiptsRoot: operationsRead.graph.receiptsRoot,
        projects: operationsRead.graph.projects,
      }),
      createTopologyAdapterPlugin({ readOnlyPilot: true }),
      createOperationsPreviewReadPlugin(),
      createCodexQuotaPlugin(),
      createTopologyRecoveryAdapterPlugin({ evidenceRoot: path.join(stateRoot, 'operations/watchtower/external_evidence') }),
      createAiUsageAdapterPlugin({
        registryPath: path.join(stateRoot, 'operations/team_ops_board/thread_visibility.v1.json'),
        usageMeterStateRoot: path.join(stateRoot, 'operations/ai_usage_meter'),
      }),
      createGraphReceiptPlugin(operationsRead.graph),
      createOperationsDirectoryPlugin(operationsRead.directory),
      createMailRulePlugin(operationsRead.mailRule),
    ],
    server: { host: '127.0.0.1', port: 4194, strictPort: true, open: false },
    preview: { host: '127.0.0.1', port: 4194, strictPort: true },
    build: { outDir: 'dist-operations', rollupOptions: { input: { board: path.join(root, 'index.html'), operations: path.join(root, 'operations-map.html'), console: path.join(root, 'operations-console.html'), rag: path.join(root, 'rag-operations.html') } } },
  };
});
