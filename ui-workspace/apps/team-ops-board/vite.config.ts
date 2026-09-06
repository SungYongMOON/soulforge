import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readSoulforgeRootOverride } from "../../../guild_hall/shared/soulforge_state_root.mjs";
import { createAiUsageAdapterPlugin } from "./src/server/ai-usage-adapter.mjs";
import { createAgentRuntimeSnapshotAdapterPluginFromEnvironment } from "./src/server/agent-runtime-snapshot-adapter.mjs";
import { createErpPendingReviewAdapterPluginFromEnvironment } from "./src/server/erp-pending-review-adapter.mjs";
import { createAntigravityQuotaAdapterPlugin } from "./src/server/antigravity-quota-adapter.mjs";
import { createAntigravityUsageAdapterPlugin } from "./src/server/antigravity-usage-adapter.mjs";
import { createClaudeUsageAdapterPlugin } from "./src/server/claude-usage-adapter.mjs";
import { createHostStatsAdapterPlugin } from "./src/server/host-stats-adapter.mjs";
import { createLiveThreadAdapterPlugin } from "./src/server/live-thread-adapter.mjs";
import { createProviderLimitsAdapterPlugin } from "./src/server/provider-limits-adapter.mjs";
import { createTopologyAdapterPlugin } from "./src/server/topology-adapter.mjs";
import { createTopologyFederationAdapterPlugin } from "./src/server/topology-federation-adapter.mjs";
import { createTopologyRecoveryAdapterPlugin } from "./src/server/topology-recovery-adapter.mjs";
import { createReceiptExpiryServerAdapter } from "./src/server/receipt-expiry-adapter.mjs";
import { createScheduledTasksAdapterPlugin } from "./src/server/scheduled-tasks-adapter.mjs";
import { createSecureWorkStatusAdapterPlugin } from "./src/server/secure-work-status-adapter.mjs";
import { createTongsHeartbeatAdapterPlugin } from "./src/server/tongs-heartbeat-adapter.mjs";
import { createStorageMapServerAdapter } from "./src/server/storage-map-adapter.mjs";
import { createCodexRetentionServerAdapter } from "./src/server/codex-retention-adapter.mjs";
import {
  createTeamOpsBoardRuntimeEnvironment,
  createTeamOpsBoardTopologyOptions,
} from "./src/core/team-ops-board-read-only-pilot.mjs";
import { resolveTeamOpsBoardAllowedHosts } from "./src/server/team-ops-board-allowed-hosts.mjs";

const boardEnvironment = createTeamOpsBoardRuntimeEnvironment();
const boardTopologyOptions = createTeamOpsBoardTopologyOptions(boardEnvironment);
const boardAllowedHosts = resolveTeamOpsBoardAllowedHosts();
const boardRoot = path.dirname(fileURLToPath(import.meta.url));
const soulforgeRoot = path.resolve(boardRoot, "../../..");
// Fail closed: a set-but-invalid SOULFORGE_OWNER_ROOT / SOULFORGE_STATE_ROOT
// throws here and the Board refuses to start instead of serving another root.
const rootOverride = readSoulforgeRootOverride(process.env);
const configuredOwnerRoot = process.env.SOULFORGE_AI_USAGE_PROJECT_ROOT;
const ownerRoot = typeof configuredOwnerRoot === "string" && path.isAbsolute(configuredOwnerRoot)
  ? path.resolve(configuredOwnerRoot)
  : rootOverride?.ownerRoot ?? soulforgeRoot;
// State paths: SOULFORGE_STATE_ROOT > <owner root>/guild_hall/state, where the
// owner root is the explicit SOULFORGE_AI_USAGE_PROJECT_ROOT, then
// SOULFORGE_OWNER_ROOT, then this checkout.
const stateRoot = rootOverride?.source === "state_root"
  ? rootOverride.stateRoot
  : path.join(ownerRoot, "guild_hall", "state");
const operationsRoot = path.join(stateRoot, "operations");
const providerQuotaReceiptPath = path.join(
  operationsRoot,
  "provider_quota",
  "claude",
  "statusline",
  "provider_quota.receipt.v1.json",
);
const receiptExpiryBindingPath = path.join(
  operationsRoot,
  "team_ops_board",
  "receipt_expiry_binding.v1.json",
);
const topologyRecoveryEvidenceRoot = path.join(operationsRoot, "watchtower", "external_evidence");
// 다른 lane 이 쓰는 상태 파일. Vigil 은 읽기만 하며, 없으면 화면이 unknown 이다.
const secureWorkStatusPath = path.join(operationsRoot, "secure_work", "status.json");
// Tongs 하트비트는 서비스별 파일 둘(operations/tongs/<service>.heartbeat.v1.json)이고
// 파일 이름은 guild_hall/shared/tongs_heartbeat_contract.mjs 가 소유하므로 어댑터가
// 같은 stateRoot 에서 직접 파생한다. Tongs lane 의 -StateRoot 는 이 stateRoot 와 같은
// 디렉터리여야 한다(lane 의 preflight --state-root 가 확인한다).
const codexRetentionReportPath = path.join(
  operationsRoot,
  "soulforge_activity",
  "reports",
  "codex_retention",
  "current.json",
);

export default defineConfig(async () => ({
  plugins: [
    react(),
    await createAgentRuntimeSnapshotAdapterPluginFromEnvironment(),
    createErpPendingReviewAdapterPluginFromEnvironment(),
    createLiveThreadAdapterPlugin({ env: boardEnvironment }),
    createAiUsageAdapterPlugin(),
    createTopologyAdapterPlugin(boardTopologyOptions),
    createTopologyFederationAdapterPlugin(),
    createTopologyRecoveryAdapterPlugin({ ownerRoot, evidenceRoot: topologyRecoveryEvidenceRoot }),
    createReceiptExpiryServerAdapter({ bindingPath: receiptExpiryBindingPath, ownerRoot }),
    createStorageMapServerAdapter({
      bindingPath: process.env.TEAM_OPS_STORAGE_MAP_BINDING,
      bindingSha256: process.env.TEAM_OPS_STORAGE_MAP_BINDING_SHA256,
    }),
    createCodexRetentionServerAdapter({ ownerRoot, reportPath: codexRetentionReportPath }),
    // 대장간 지도 첫 화면의 세 근거면. 셋 다 loopback GET 전용 읽기이며 근거가
    // 없으면 unknown 으로 남는다(초록으로 올라가지 않는다).
    createScheduledTasksAdapterPlugin(),
    createSecureWorkStatusAdapterPlugin({ statusPath: secureWorkStatusPath }),
    createTongsHeartbeatAdapterPlugin({ stateRoot }),
    createHostStatsAdapterPlugin(),
    createClaudeUsageAdapterPlugin(),
    createAntigravityUsageAdapterPlugin(),
    createAntigravityQuotaAdapterPlugin({ env: boardEnvironment }),
    createProviderLimitsAdapterPlugin({ env: boardEnvironment, providerQuotaReceiptPath })
  ],
  server: {
    host: "127.0.0.1",
    port: 4192,
    allowedHosts: boardAllowedHosts
  },
  preview: {
    host: "127.0.0.1",
    port: 4193,
    allowedHosts: boardAllowedHosts
  }
}));
