#!/usr/bin/env node
// dev-erp P1 서버: 외부 의존성 0 (node:http + node:sqlite).
// 사용: node server.mjs [--port 4310] [--db data/dev-erp.db] [--ingest <json>] [--fixture]
// 포트 원칙: runtime checkout 운영본만 4300, 개발/작업본 기본은 4310.
// 기본: 빈 DB 는 비워 둔다. 데모 데이터는 --fixture 또는 DEV_ERP_LOAD_FIXTURE=1 일 때만 적재.
import { createServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { createServer as createNetServer } from "node:net";
import { createHash, randomBytes, randomUUID, X509Certificate } from "node:crypto";
import { execFile, execSync } from "node:child_process";
import { promisify } from "node:util";
import {
  closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync,
  realpathSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, extname, resolve, sep, basename } from "node:path";
import { fileURLToPath } from "node:url";

import { openStore } from "./src/store.mjs";
import {
  SHA256_RE as WORKFLOW_SHA256_RE,
  evaluateWorkflowDeploymentAttestation,
} from "./src/workflow_job_contract.mjs";
import { createWorkflowJobHttpController } from "./src/workflow_job_http.mjs";
import { WorkflowJobPayloadStore } from "./src/workflow_job_payload_store.mjs";
import { WorkflowJobRunnerBridge } from "./src/workflow_job_runner_bridge.mjs";
import { WorkflowJobService } from "./src/workflow_job_service.mjs";
import { buildMonthGrid, monthGridRange } from "./src/calendar.mjs";
import { loadFixture } from "./src/fixture.mjs";
import { composeInputRefs } from "./src/five_field.mjs";
import { knowledgeIndexRootFromShellRoot, listProjectKnowledgeRefsFast, matchingKnowledgeRefs } from "./tools/knowledge_grounding.mjs";
import { ingestFromFile } from "./src/adapter.mjs";
import { getLexicon, LEXICON } from "./src/lexicon.mjs";
import { guideTemplates, docRecipes } from "./src/guide.mjs";
import { modulesFor } from "./src/modules.mjs";
import { groupedKnowledge, knowledgeRegistryDir } from "./src/knowledge_registry.mjs";
import {
  scanKnowledgeLedgers,
  scanKnowledgeShellContract,
  scanKnowledgeSpaces,
  scanRagRoutes,
  scanRagWorkCards,
  scanWikiPageRefs,
} from "./src/knowledge_shell.mjs";
import { crossSearch } from "./src/search.mjs";
import { buildMetaContext, runLlm, answerFromManual, CHATBOT_VERSION, llmThinkEnabled, suggestSplit, summarizeCompletion } from "./src/llm.mjs";
import { loadPartyMonsterTypes } from "./src/party_match.mjs";
import { startAutosyncPoll, writeTaskToLedger, writeInputToLedger } from "./src/autosync.mjs";
import { mailboxEnvRelPath, hiworksEnvUpdates, writeMailboxEnv, deleteMailboxEnv, parseMailTestResult } from "./src/mailbox_env.mjs";
import { collectAllMailboxes, isCollecting } from "./src/mail_collect.mjs";
const execFileP = promisify(execFile);
import { safeWorkspacePath, safeUploadTarget, commitUpload, readSafe } from "./src/filevault.mjs";
import {
  CODEX_TASK_BRIDGE_VERSION,
  CODEX_TASK_PERMISSION_PROFILE_ID,
  discoverCodexModels,
  fallbackCodexModelCatalog,
  preferredCodexModelSlug,
  resolveCodexModelSelection,
  runCodexTaskTurn,
} from "./src/codex_bridge.mjs";
import { evaluateWriteGrant, parseWorkspaceRegistryJson } from "./src/codex_workspace_registry.mjs";
import {
  appendAttachmentManifestRecord,
  createAttachmentManifest,
  createAttachmentManifestRecord,
  createOpaqueAttachmentId,
  parseAttachmentManifestJson,
  publicAttachmentDescriptor,
  resolveAttachment,
  validateAttachmentFilename,
} from "./src/codex_attachment_registry.mjs";
import { createCodexMessagePayloadStore } from "./src/codex_message_payload_store.mjs";
import {
  codexPayloadDenyBindingRevision,
  filesystemIdentity,
  inspectCodexPayloadOwner,
} from "./src/codex_payload_owner.mjs";
import {
  materializeCodexTurnProjection,
  publicCodexTurnProjectionReceipt,
  removeCodexTurnProjection,
} from "./src/codex_turn_projection.mjs";
import {
  CodexDedicatedWorkerClient,
  codexWorkerReleaseBindingRevision,
  verifyCodexWorkerTurnSelection,
} from "./src/codex_dedicated_worker_client.mjs";
import { CODEX_DEDICATED_WORKER_VERSION, readWorkerIdentity } from "./src/codex_dedicated_worker.mjs";
import { buildMorningBrief, hasContent, localDateKey, runMorningBriefCycle } from "./src/morning_brief.mjs";
import { buildKnowledgeOverview, readWikiPage } from "./src/knowledge_overview.mjs";
import { buildBranchStory, buildContextGraph, listContextProjects } from "./src/context_graph.mjs";
import { buildContextLifeTree, parseContextLifeTreeQuery } from "./src/context_life_tree.mjs";
import { readRouterBinding } from "./src/mail_router_binding.mjs";
import {
  createErpMcpService,
  ERP_MCP_FILE_MAX,
  ErpMcpError,
} from "./src/erp_mcp_service.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

// 파일 IO(산출물 입력파일 업/다운로드)는 기본 OFF. 켜기: DEV_ERP_FILEIO=1 또는 --fileio.
// 모든 경로는 <ROOT>/_workspaces 아래로만(filevault path-safety). 절대경로·../·심볼릭 탈출 차단.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const BACKEND_ROOT = resolve(process.env.DEV_ERP_BACKEND_ROOT || ROOT);
const RUNTIME_SOURCE_COMMIT = (() => {
  if (Object.hasOwn(process.env, "DEV_ERP_SOURCE_COMMIT")) {
    const configured = String(process.env.DEV_ERP_SOURCE_COMMIT || "").trim().toLowerCase();
    return /^[a-f0-9]{40}$/.test(configured) ? configured : "";
  }
  try { return execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8", timeout: 3000 }).trim(); }
  catch { return ""; }
})();
const CODEX_TASK_BRIDGE_MODE = process.env.DEV_ERP_CODEX_TASK_BRIDGE || "app-server";
const CODEX_TASK_WORKER_URL = String(process.env.DEV_ERP_CODEX_WORKER_URL || "").trim();
const CODEX_TASK_WORKER_TOKEN = String(process.env.DEV_ERP_CODEX_WORKER_TOKEN || "").trim();
const CODEX_TASK_WORKER_EXPECTED_IDENTITY_HASH = String(
  process.env.DEV_ERP_CODEX_WORKER_EXPECTED_IDENTITY_HASH || "",
).trim().toLowerCase();
const CODEX_TASK_WORKER_EXPECTED_RUNTIME_IDENTITY_SHA256 = String(
  process.env.DEV_ERP_CODEX_WORKER_EXPECTED_RUNTIME_IDENTITY_SHA256 || "",
).trim().toLowerCase();
const CODEX_TASK_WORKER_ATTEST_PUBLIC_KEY_FILE = String(
  process.env.DEV_ERP_CODEX_WORKER_ATTEST_PUBLIC_KEY_FILE || "",
).trim();
const CODEX_TASK_WORKER_EXPECTED_ATTESTATION_KEY_ID = String(
  process.env.DEV_ERP_CODEX_WORKER_EXPECTED_ATTESTATION_KEY_ID || "",
).trim().toLowerCase();
const CODEX_TASK_WORKER_RELEASE_BINDING_REVISION = codexWorkerReleaseBindingRevision({
  workerUrl: CODEX_TASK_WORKER_URL,
  expectedWorkerIdentityHash: CODEX_TASK_WORKER_EXPECTED_IDENTITY_HASH,
  expectedRuntimeIdentityHash: CODEX_TASK_WORKER_EXPECTED_RUNTIME_IDENTITY_SHA256,
  expectedAttestationKeyId: CODEX_TASK_WORKER_EXPECTED_ATTESTATION_KEY_ID,
});
const CODEX_TASK_WORKER_HEALTH_TTL_MS = Math.max(
  1000,
  Math.min(30_000, Number(process.env.DEV_ERP_CODEX_WORKER_HEALTH_TTL_MS || 5000) || 5000),
);
// 모델 목록 discovery의 프로세스 시작 위치일 뿐, 실제 턴 cwd 권한은 runtime-local workspace registry가 결정한다.
const CODEX_TASK_MODEL_DISCOVERY_CWD = resolve(process.env.DEV_ERP_CODEX_TASK_CWD || ROOT);
const CODEX_TASK_WORKSPACE_REGISTRY_PATH = resolve(
  process.env.DEV_ERP_CODEX_WORKSPACE_REGISTRY || join(HERE, "data", "codex-workspaces.runtime.json"),
);
const CODEX_TASK_WORKSPACE_PROBE_TTL_MS = Math.max(1000, Number(process.env.DEV_ERP_CODEX_WORKSPACE_PROBE_TTL_MS || 5000) || 5000);
const CODEX_TASK_TIMEOUT_MS = Number(process.env.DEV_ERP_CODEX_TASK_TIMEOUT_MS || 300000);
const CODEX_TASK_TURN_PROJECTION_ROOT_RAW = String(process.env.DEV_ERP_CODEX_TURN_PROJECTION_ROOT || "").trim();
const CODEX_TASK_TURN_PROJECTION_ROOT = CODEX_TASK_TURN_PROJECTION_ROOT_RAW && isAbsolute(CODEX_TASK_TURN_PROJECTION_ROOT_RAW)
  ? resolve(CODEX_TASK_TURN_PROJECTION_ROOT_RAW)
  : null;
const CODEX_HOME = resolve(process.env.DEV_ERP_CODEX_HOME || process.env.CODEX_HOME || join(HERE, "data", "codex-home"));
const CODEX_TASK_DEDICATED_HOME_CONFIGURED = !!String(process.env.DEV_ERP_CODEX_HOME || "").trim();
const CODEX_TASK_TRUST_DOMAIN = String(process.env.DEV_ERP_CODEX_TRUST_DOMAIN || "").trim();
const CODEX_TASK_ALLOWED_SKILLS = new Set(String(process.env.DEV_ERP_CODEX_ALLOWED_SKILLS || "")
  .split(",").map((value) => value.trim()).filter(Boolean));
function codexDedicatedProfileReady() {
  if (!CODEX_TASK_DEDICATED_HOME_CONFIGURED || !existsSync(CODEX_HOME)) return false;
  return ![
    "config.toml", "hooks.json", "plugins", "marketplaces", "skills", "rules",
    "AGENTS.md", "AGENTS.override.md", "instructions", "instructions.md",
  ].some((name) => existsSync(join(CODEX_HOME, name)));
}
let codexDedicatedWorkerClientInstance = null;
let codexDedicatedWorkerHealthCache = { at: 0, value: null };
let codexDedicatedWorkerHealthInFlight = null;
let erpProcessIdentityHashCache;
function erpProcessIdentityHash() {
  if (erpProcessIdentityHashCache !== undefined) return erpProcessIdentityHashCache;
  try { erpProcessIdentityHashCache = readWorkerIdentity().hash; }
  catch { erpProcessIdentityHashCache = null; }
  return erpProcessIdentityHashCache;
}
function safeCodexWorkerError(error, fallback = "codex_worker_unavailable") {
  const raw = String(error?.code || error?.message || error || "");
  return /^[A-Za-z0-9._-]{1,120}$/.test(raw) ? raw : fallback;
}
function codexDedicatedWorkerConfiguration() {
  if (CODEX_TASK_BRIDGE_MODE !== "worker") return { configured: false, error: "codex_worker_mode_disabled" };
  if (!CODEX_TASK_WORKER_URL || !CODEX_TASK_WORKER_TOKEN) {
    return { configured: false, error: "codex_worker_connection_required" };
  }
  if (!CODEX_TASK_TURN_PROJECTION_ROOT) {
    return { configured: false, error: "codex_turn_projection_root_required" };
  }
  if (!/^[a-f0-9]{64}$/.test(CODEX_TASK_WORKER_EXPECTED_IDENTITY_HASH)) {
    return { configured: false, error: "codex_worker_expected_identity_required" };
  }
  if (!/^[a-f0-9]{64}$/.test(CODEX_TASK_WORKER_EXPECTED_RUNTIME_IDENTITY_SHA256)) {
    return { configured: false, error: "codex_worker_expected_runtime_identity_required" };
  }
  if (!CODEX_TASK_WORKER_ATTEST_PUBLIC_KEY_FILE || !isAbsolute(CODEX_TASK_WORKER_ATTEST_PUBLIC_KEY_FILE)) {
    return { configured: false, error: "codex_worker_attestation_public_key_required" };
  }
  if (!/^[a-f0-9]{64}$/.test(CODEX_TASK_WORKER_EXPECTED_ATTESTATION_KEY_ID)) {
    return { configured: false, error: "codex_worker_expected_attestation_key_required" };
  }
  if (!CODEX_TASK_WORKER_RELEASE_BINDING_REVISION) {
    return { configured: false, error: "codex_worker_release_binding_invalid" };
  }
  return { configured: true, error: null };
}
function codexDedicatedWorkerClient() {
  const config = codexDedicatedWorkerConfiguration();
  if (!config.configured) throw new Error(config.error);
  if (!codexDedicatedWorkerClientInstance) {
    codexDedicatedWorkerClientInstance = new CodexDedicatedWorkerClient({
      baseUrl: CODEX_TASK_WORKER_URL,
      token: CODEX_TASK_WORKER_TOKEN,
      attestationPublicKeyFile: CODEX_TASK_WORKER_ATTEST_PUBLIC_KEY_FILE,
      expectedPayloadDenyBindingRevision: CODEX_TASK_PAYLOAD_DENY_BINDING_REVISION,
      timeoutMs: Math.max(1000, Math.min(310_000, CODEX_TASK_TIMEOUT_MS + 10_000)),
    });
  }
  return codexDedicatedWorkerClientInstance;
}
function codexDedicatedWorkerHealthFromVerified(verified) {
    const attestation = verified.attestation;
    const registryRevision = codexWorkspaceRegistryState().registry?.mappingRevision || null;
    let configuredWorkerPort = null;
    try { configuredWorkerPort = Number(new URL(CODEX_TASK_WORKER_URL).port); } catch {}
    const expectedTrustDomainHash = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(CODEX_TASK_TRUST_DOMAIN)
      ? createHash("sha256").update(CODEX_TASK_TRUST_DOMAIN).digest("hex")
      : null;
    const checks = {
      attestation_verified: verified.verified === true,
      schema_match: attestation.worker_schema === CODEX_DEDICATED_WORKER_VERSION.schema,
      release_match: attestation.worker_release === CODEX_DEDICATED_WORKER_VERSION.release,
      source_commit_match: /^[a-f0-9]{40}$/.test(RUNTIME_SOURCE_COMMIT)
        && attestation.source_commit === RUNTIME_SOURCE_COMMIT,
      source_tree_policy_match: attestation.source_tree_clean === true || !IS_RUNTIME_CHECKOUT,
      boundary_match: attestation.execution_boundary === "dedicated_worker",
      loopback_match: attestation.listen_host === "127.0.0.1" && attestation.listen_port === configuredWorkerPort,
      process_separate: Number.isInteger(attestation.worker_pid)
        && attestation.worker_pid > 0
        && attestation.worker_pid !== process.pid,
      identity_separate: (!IS_RUNTIME_CHECKOUT && attestation.bridge_mode === "mock")
        || (/^[a-f0-9]{64}$/.test(erpProcessIdentityHash() || "")
          && attestation.worker_identity_hash !== erpProcessIdentityHash()),
      identity_match: attestation.worker_identity_hash === CODEX_TASK_WORKER_EXPECTED_IDENTITY_HASH,
      identity_proven: attestation.identity_proof_source === "windows_whoami"
        || attestation.identity_proof_source === "os_userinfo",
      attestation_key_match: attestation.attestation_key_id === CODEX_TASK_WORKER_EXPECTED_ATTESTATION_KEY_ID,
      codex_home_ready: attestation.codex_home_ready === true,
      projection_root_ready: attestation.projection_root_ready === true
        && /^[a-f0-9]{64}$/.test(attestation.projection_root_boundary_revision),
      denied_read_roots_ready: /^[a-f0-9]{64}$/.test(attestation.denied_read_roots_revision),
      payload_deny_binding_match: attestation.payload_deny_binding_revision
        === CODEX_TASK_PAYLOAD_DENY_BINDING_REVISION,
      forbidden_roots_ready: attestation.forbidden_roots_ready === true && attestation.forbidden_root_count >= 5,
      registry_ready: attestation.workspace_registry_ready === true,
      registry_revision_match: !!registryRevision && attestation.workspace_registry_revision === registryRevision,
      root_isolation_ready: attestation.workspace_root_isolation_ready === true
        && /^[a-f0-9]{64}$/.test(attestation.workspace_root_isolation_revision),
      trust_domain_match: !!expectedTrustDomainHash
        && attestation.trust_domain_match === true
        && attestation.trust_domain_hash === expectedTrustDomainHash,
      bridge_ready: attestation.bridge_mode === "app-server" || (!IS_RUNTIME_CHECKOUT && attestation.bridge_mode === "mock"),
      skills_disabled: attestation.skills_disabled === true,
      permission_profile_match: attestation.permission_profile_id === CODEX_TASK_PERMISSION_PROFILE_ID
        && attestation.permission_profile_bridge_release === CODEX_TASK_BRIDGE_VERSION.release,
      filesystem_boundary_proven: attestation.filesystem_boundary_proven === true
        && (attestation.filesystem_boundary_proof_source === "codex_sandbox_turn_projection_probe_v4"
          || (!IS_RUNTIME_CHECKOUT && attestation.filesystem_boundary_proof_source === "mock_test_boundary")),
      command_identity_match: attestation.codex_command_identity_ready === true
        && attestation.codex_command_revision === CODEX_TASK_WORKER_EXPECTED_RUNTIME_IDENTITY_SHA256
        && /^[a-f0-9]{64}$/.test(attestation.filesystem_boundary_revision)
        && /^[a-f0-9]{64}$/.test(attestation.permission_profile_revision),
    };
    const ready = Object.values(checks).every(Boolean);
    const instanceRevision = createHash("sha256").update(JSON.stringify({
      pid: attestation.worker_pid,
      identity: attestation.worker_identity_hash,
      attestation_key: attestation.attestation_key_id,
      source_commit: attestation.source_commit,
      worker_release: attestation.worker_release,
      worker_schema: attestation.worker_schema,
      listen_port: attestation.listen_port,
      bridge_mode: attestation.bridge_mode,
      skills_disabled: attestation.skills_disabled,
      workspace_registry_revision: attestation.workspace_registry_revision,
      workspace_root_isolation_revision: attestation.workspace_root_isolation_revision,
      trust_domain_hash: attestation.trust_domain_hash,
      codex_home_boundary: attestation.codex_home_boundary_revision,
      projection_root_boundary: attestation.projection_root_boundary_revision,
      denied_read_roots_revision: attestation.denied_read_roots_revision,
      payload_deny_binding_revision: attestation.payload_deny_binding_revision,
      forbidden_roots_ready: attestation.forbidden_roots_ready,
      forbidden_root_count: attestation.forbidden_root_count,
      permission_profile_id: attestation.permission_profile_id,
      permission_profile_bridge_release: attestation.permission_profile_bridge_release,
      filesystem_boundary_proof_source: attestation.filesystem_boundary_proof_source,
      filesystem_boundary_revision: attestation.filesystem_boundary_revision,
      codex_command_revision: attestation.codex_command_revision,
      codex_command_version: attestation.codex_command_version,
      codex_command_kind: attestation.codex_command_kind,
      permission_profile_revision: attestation.permission_profile_revision,
    })).digest("hex");
    return Object.freeze({
      configured: true,
      ready,
      error: ready ? null : "codex_worker_attestation_failed",
      release: typeof attestation.worker_release === "string" ? attestation.worker_release : null,
      bridge_mode: typeof attestation.bridge_mode === "string" ? attestation.bridge_mode : null,
      source_commit: typeof attestation.source_commit === "string" ? attestation.source_commit : null,
      source_tree_clean: attestation.source_tree_clean === true,
      instance_revision: instanceRevision,
      workspace_registry_revision: typeof attestation.workspace_registry_revision === "string"
        ? attestation.workspace_registry_revision
        : null,
      ...checks,
    });
}
async function codexDedicatedWorkerOperationAttestation({ issueChannel = true } = {}) {
  const configuration = codexDedicatedWorkerConfiguration();
  if (!configuration.configured) {
    return Object.freeze({
      health: Object.freeze({ configured: false, ready: false, error: configuration.error }),
      channel: null,
    });
  }
  try {
    const nonce = randomBytes(32).toString("base64url");
    const verified = await codexDedicatedWorkerClient().attest(nonce, { timeoutMs: 5000, issueChannel });
    const health = codexDedicatedWorkerHealthFromVerified(verified);
    return Object.freeze({ health, channel: health.ready && issueChannel ? verified : null });
  } catch (error) {
    return Object.freeze({
      health: Object.freeze({
        configured: true,
        ready: false,
        error: safeCodexWorkerError(error),
      }),
      channel: null,
    });
  }
}
async function codexDedicatedWorkerHealth({ refresh = false } = {}) {
  const now = Date.now();
  if (!refresh && codexDedicatedWorkerHealthCache.value
      && now - codexDedicatedWorkerHealthCache.at < CODEX_TASK_WORKER_HEALTH_TTL_MS) {
    return codexDedicatedWorkerHealthCache.value;
  }
  if (codexDedicatedWorkerHealthInFlight) {
    if (!refresh) return codexDedicatedWorkerHealthInFlight;
    try { await codexDedicatedWorkerHealthInFlight; } catch {}
  }
  const pending = (async () => {
    const operation = await codexDedicatedWorkerOperationAttestation({ issueChannel: false });
    codexDedicatedWorkerHealthCache = { at: Date.now(), value: operation.health };
    return operation.health;
  })();
  codexDedicatedWorkerHealthInFlight = pending;
  try { return await pending; }
  finally {
    if (codexDedicatedWorkerHealthInFlight === pending) codexDedicatedWorkerHealthInFlight = null;
  }
}
const CODEX_TASK_ATTACHMENT_ROOT = resolve(process.env.DEV_ERP_CODEX_TASK_ATTACHMENT_ROOT || join(BACKEND_ROOT, "_workspaces", "system", "dev-erp", "codex-task-attachments"));
const CODEX_TASK_MESSAGE_PAYLOAD_ROOT_OVERRIDE = String(process.env.DEV_ERP_CODEX_MESSAGE_PAYLOAD_ROOT || "").trim();
const CODEX_TASK_MESSAGE_PAYLOAD_DEFAULT_ROOT = resolve(join(BACKEND_ROOT, "_workspaces", "system", "dev-erp", "codex-message-payloads"));
const CODEX_TASK_MESSAGE_PAYLOAD_ROOT = CODEX_TASK_MESSAGE_PAYLOAD_ROOT_OVERRIDE
  ? resolve(CODEX_TASK_MESSAGE_PAYLOAD_ROOT_OVERRIDE)
  : CODEX_TASK_MESSAGE_PAYLOAD_DEFAULT_ROOT;
const CODEX_TASK_PAYLOAD_DENY_BINDING_REVISION = codexPayloadDenyBindingRevision({
  attachmentRoot: CODEX_TASK_ATTACHMENT_ROOT,
  messagePayloadRoot: CODEX_TASK_MESSAGE_PAYLOAD_ROOT,
});
// 대화 첨부 저장 계약 v1: Soulforge _workspaces/system/dev-erp의 서비스 전용 root.
// 팀원이 쓰는 과제 폴더와 runtime checkout은 신규 첨부 payload owner가 아니다.
// owner 지식그래프 익스포터(guild_hall/knowledge_graph) 산출물 열람 루트 — 읽기 전용 서빙(2026-07-04 owner)
const GRAPH_VIEW_ROOT = resolve(process.env.DEV_ERP_GRAPH_VIEW_ROOT || join(BACKEND_ROOT, "_workspaces", "system", "knowledge_view", "graph_export"));
const CHAT_ATTACH_MANIFEST = "codex-attachment-manifest.v1.json";
const CODEX_TASK_IMAGE_MAX = Number(process.env.DEV_ERP_CODEX_TASK_IMAGE_MAX || 8 * 1024 * 1024);
const CODEX_TASK_IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
// 일반 파일 첨부(2026-07-03 owner 지시): 로컬 _workspaces 첨부 루트에만 저장하고 Codex 는 경로로 읽는다.
// 이미지가 아닌 파일은 localImage 입력이 아니라 메시지의 로컬 경로 참조로 전달(모델 API 로 payload 미전송).
// 실행형 확장자는 allowlist 밖 → 400.
const CODEX_TASK_FILE_MAX = Number(process.env.DEV_ERP_CODEX_TASK_FILE_MAX || 25 * 1024 * 1024);
const CODEX_TASK_ATTACHMENT_MAX_COUNT = Math.max(1, Math.min(256, Math.trunc(Number(process.env.DEV_ERP_CODEX_ATTACHMENT_MAX_COUNT) || 32)));
const CODEX_TASK_ATTACHMENT_TOTAL_MAX = Math.max(CODEX_TASK_FILE_MAX, Math.min(1024 * 1024 * 1024, Number(process.env.DEV_ERP_CODEX_ATTACHMENT_TOTAL_MAX || 100 * 1024 * 1024) || 100 * 1024 * 1024));
const CODEX_TASK_FILE_EXTS = new Set([
  ".pdf", ".txt", ".md", ".csv", ".json", ".xml", ".yaml", ".yml", ".log",
  ".xlsx", ".xls", ".docx", ".doc", ".pptx", ".ppt", ".hwpx",
  ".zip", ".7z", ".msg", ".eml", ".step", ".stp", ".dxf",
]);
const CODEX_TASK_SERVICE_TIER_OPTIONS = []; // 속도(tier) 선택 제거 — flex·fast 안 씀. codex 기본 tier 사용(config.toml 에 service_tier 없음) → "unknown variant" 오류 영구 차단.
const CODEX_TASK_DEFAULT_SERVICE_TIER = "";
const CODEX_TASK_PREFERRED_MODEL = String(process.env.DEV_ERP_CODEX_TASK_MODEL || "").trim();
const CODEX_TASK_PREFERRED_EFFORT = String(process.env.DEV_ERP_CODEX_TASK_EFFORT || "").trim();
const CODEX_TASK_MODEL_CATALOG_TTL_RAW = Number(process.env.DEV_ERP_CODEX_MODEL_CATALOG_TTL_MS || 5 * 60 * 1000);
const CODEX_TASK_MODEL_CATALOG_TTL_MS = Number.isFinite(CODEX_TASK_MODEL_CATALOG_TTL_RAW)
  ? Math.max(1000, CODEX_TASK_MODEL_CATALOG_TTL_RAW)
  : 5 * 60 * 1000;
const CODEX_TASK_JSON_MAX = Math.max(4096, Math.min(1024 * 1024, Number(process.env.DEV_ERP_CODEX_JSON_MAX || 256 * 1024) || 256 * 1024));
const CODEX_TASK_MESSAGE_MAX = Math.max(1024, Math.min(256 * 1024, Number(process.env.DEV_ERP_CODEX_MESSAGE_MAX || 64 * 1024) || 64 * 1024));
const CODEX_TASK_GLOBAL_CONCURRENCY = Math.max(1, Math.min(16, Math.trunc(Number(process.env.DEV_ERP_CODEX_GLOBAL_CONCURRENCY) || 4)));
const CODEX_TASK_ACCOUNT_CONCURRENCY = Math.max(1, Math.min(CODEX_TASK_GLOBAL_CONCURRENCY, Math.trunc(Number(process.env.DEV_ERP_CODEX_ACCOUNT_CONCURRENCY) || 1)));
const CODEX_TASK_ACCOUNT_TURNS_PER_HOUR = Math.max(1, Math.min(100, Math.trunc(Number(process.env.DEV_ERP_CODEX_ACCOUNT_TURNS_PER_HOUR) || 20)));
const KNOWLEDGE_SHELL_ROOT = resolve(flag("knowledge_shell_root", BACKEND_ROOT));
const KNOWLEDGE_INDEX_ROOT = knowledgeIndexRootFromShellRoot(KNOWLEDGE_SHELL_ROOT);
const BACKEND_WORKMETA_ROOT = join(BACKEND_ROOT, "_workmeta");
const FILEIO = process.env.DEV_ERP_FILEIO === "1" || process.argv.includes("--fileio");
const UPLOAD_MAX = Number(process.env.DEV_ERP_UPLOAD_MAX || 50 * 1024 * 1024); // 50MB 기본 상한
const isRuntimeCheckout = (p) => /(^|[\\/])Soulforge-runtime([\\/]|$)/i.test(resolve(p));
const IS_RUNTIME_CHECKOUT = isRuntimeCheckout(ROOT) || isRuntimeCheckout(HERE);
const RUNTIME_PORT = Number(process.env.DEV_ERP_RUNTIME_PORT || 4300);
const DEV_PORT = Number(process.env.DEV_ERP_DEV_PORT || 4310);
const DEFAULT_PORT = IS_RUNTIME_CHECKOUT ? RUNTIME_PORT : DEV_PORT;
const PORT = Number(flag("port", DEFAULT_PORT));
const ALLOW_NON_RUNTIME_4300 = process.env.DEV_ERP_ALLOW_DEV_4300 === "1" || args.includes("--allow-dev-4300");
if (PORT === RUNTIME_PORT && !IS_RUNTIME_CHECKOUT && !ALLOW_NON_RUNTIME_4300) {
  console.error(`[dev-erp] refused: port ${RUNTIME_PORT} is reserved for the runtime checkout. Use --port ${DEV_PORT} for development, or set DEV_ERP_ALLOW_DEV_4300=1 for an explicit emergency override.`);
  process.exit(2);
}
// 기본은 localhost 전용(안전). 같은 네트워크 공유가 필요할 때만 --host 0.0.0.0
// (합성 데이터 파일럿 한정 권장 — 실데이터+팀 공개는 P2 RBAC 이후)
const HOST = flag("host", "127.0.0.1");
// 사내망 직접 HTTPS(자체서명): data/tls/server.crt + server.key 가 있으면 같은 포트에서
// TLS 겸용(polyglot)으로 듣는다 — 평문 HTTP 는 https:// 301, 인증서 배포는 /dev-erp-ca.crt (평문 허용 유일 경로).
// 경로 재지정: --tls-cert/--tls-key 또는 DEV_ERP_TLS_CERT/DEV_ERP_TLS_KEY. 끄기: --no-tls 또는 DEV_ERP_NO_TLS=1.
// Tailscale Serve 등 HTTPS 종단 프록시 뒤에서는 X-Forwarded-Proto: https 평문 요청을 리다이렉트 없이 앱으로 넘긴다.
const TLS_DISABLED = process.env.DEV_ERP_NO_TLS === "1" || args.includes("--no-tls");
const TLS_CERT_PATH = resolve(flag("tls-cert", process.env.DEV_ERP_TLS_CERT || join(HERE, "data", "tls", "server.crt")));
const TLS_KEY_PATH = resolve(flag("tls-key", process.env.DEV_ERP_TLS_KEY || join(HERE, "data", "tls", "server.key")));
// 팀 PC 가 신뢰 등록할 앵커. 권장 절차(런북 3.4)는 1회용 로컬 CA(발급 직후 CA 키 삭제) → leaf 발급:
// 서버 키가 유출돼도 CA:FALSE leaf 라 타 사이트 위조 서명이 불가능하다.
// 가드(적대검토 확정): ca.crt 없이 server.crt 가 CA:TRUE(openssl req -x509 기본형)면 앵커 배포를 차단한다 —
// 살아있는 server.key 가 곧 범용 서명 키가 되어, 유출 시 팀 PC 전체가 임의 사이트 MITM 에 노출되기 때문.
const TLS_CA_PATH = resolve(flag("tls-ca", process.env.DEV_ERP_TLS_CA || join(HERE, "data", "tls", "ca.crt")));
const TLS_ENABLED = !TLS_DISABLED && existsSync(TLS_CERT_PATH) && existsSync(TLS_KEY_PATH);
const TLS_TRUST_ANCHOR_PATH = (() => {
  if (!TLS_ENABLED) return null;
  if (existsSync(TLS_CA_PATH)) return TLS_CA_PATH;
  try {
    if (!new X509Certificate(readFileSync(TLS_CERT_PATH)).ca) return TLS_CERT_PATH; // 자체서명 CA:FALSE leaf 는 안전
  } catch { /* 파싱 실패 → 배포 차단 쪽으로 */ }
  return null;
})();
// HTTPS(직접 TLS 또는 reverse proxy/tunnel) 뒤에서 팀 공개 시 켠다. 직접 TLS 모드는 자동 ON. 로컬 http 파일럿은 기본 OFF.
const COOKIE_SECURE = process.env.DEV_ERP_COOKIE_SECURE === "1" || args.includes("--secure-cookie") || TLS_ENABLED;
// 팀 운영 기본값은 관리자/roster 생성 계정만 허용. localhost 자가가입 파일럿 때만 명시적으로 켠다.
const ALLOW_SELF_REGISTER = process.env.DEV_ERP_ALLOW_SELF_REGISTER === "1" || args.includes("--allow-self-register");
// 빈 DB 는 실제 운영/PC 동기화에서 샘플이 되살아나지 않게 기본 비움. 데모/테스트만 명시적으로 켠다.
const LOAD_FIXTURE = (process.env.DEV_ERP_LOAD_FIXTURE === "1" || args.includes("--fixture")) && !args.includes("--no-fixture") && process.env.DEV_ERP_NO_FIXTURE !== "1";
const DEFAULT_DB_PATH = join(HERE, "data", "dev-erp.db");
const DB_PATH = flag("db", DEFAULT_DB_PATH);
const DB_IS_DEFAULT = DB_PATH !== ":memory:" && resolve(DB_PATH) === resolve(DEFAULT_DB_PATH);
const INGEST_PATH = flag("ingest", null);
const AUTO_REAL_META = (DB_IS_DEFAULT || process.env.DEV_ERP_AUTO_REAL_META === "1") && !args.includes("--no-real-meta") && process.env.DEV_ERP_NO_REAL_META !== "1";
if (DB_PATH !== ":memory:") mkdirSync(dirname(DB_PATH), { recursive: true });
// Canon 지식 저장소(읽기 전용 소비). 기본 = repo 루트 .registry/knowledge (상대 resolve).
const KNOW_DIR = flag("knowledge_dir", knowledgeRegistryDir(HERE));
const KNOWLEDGE_SHELL = { root: KNOWLEDGE_SHELL_ROOT };
const STATIC_ROOT = resolve(HERE, "static");
const SKIN_ROOTS = [...new Set([
  flag("skins_dir", null),
  process.env.DEV_ERP_SKINS_DIR || null,
  join(BACKEND_ROOT, "_workspaces", "system", "dev-erp", "skins"),
  join(HERE, "static", "skins"),
].filter(Boolean).map((p) => resolve(p)))];
// 4번째 버전 세그먼트 = dev-erp 경로 커밋수(자동 증가). 매 dev-erp 배포(커밋)마다 +1 → '버전이 그대로'를 수동 깜빡임 없이 방지. git 없으면 0(best-effort).
function erpBuildSeq() {
  try { return Number(execSync("git rev-list --count HEAD -- .", { cwd: HERE, encoding: "utf8" }).trim()) || 0; } catch { return 0; }
}
const ERP_VERSION = Object.freeze({
  release: `v1.4.0.${erpBuildSeq()}`,   // MAJOR.MINOR.PATCH.BUILD — 기능 묶음=PATCH 수동, 매 배포=BUILD 자동
  build: "ui-2026.07.12",
  source: "server.mjs"
});

const store = openStore(DB_PATH);
const reportWorkflowBundleSha256 = String(process.env.DEV_ERP_REPORT_WORKFLOW_BUNDLE_SHA256 || "").trim();
const reportWorkflowPayloadStore = WORKFLOW_SHA256_RE.test(reportWorkflowBundleSha256)
  ? new WorkflowJobPayloadStore({ backendRoot: BACKEND_ROOT })
  : null;
const reportWorkflowService = reportWorkflowPayloadStore
  ? new WorkflowJobService({
    store,
    payloadStore: reportWorkflowPayloadStore,
    bundleSha256: reportWorkflowBundleSha256,
  })
  : null;
let reportWorkflowStartupRecoveryStatus = reportWorkflowService ? "pending" : "not_configured";
const reportWorkflowRunnerBridge = new WorkflowJobRunnerBridge();

function reportWorkflowAttestation() {
  try {
    return JSON.parse(String(process.env.DEV_ERP_REPORT_WORKFLOW_ATTESTATION_JSON || ""));
  } catch {
    return null;
  }
}

async function reportWorkflowCapability() {
  const runner = await reportWorkflowRunnerBridge.capability();
  const evaluated = evaluateWorkflowDeploymentAttestation({
    routeEnabled: process.env.DEV_ERP_REPORT_WORKFLOW_ENABLED === "1",
    attestation: reportWorkflowAttestation(),
    expectedAttestationSha256: String(process.env.DEV_ERP_REPORT_WORKFLOW_ATTESTATION_SHA256 || ""),
    sourceCommit: String(process.env.DEV_ERP_REPORT_WORKFLOW_SOURCE_COMMIT || ""),
    expectedBundleSha256: reportWorkflowBundleSha256,
    erpIdentitySha256: String(process.env.DEV_ERP_REPORT_WORKFLOW_ERP_IDENTITY_SHA256 || ""),
    workerIdentitySha256: String(process.env.DEV_ERP_REPORT_WORKFLOW_WORKER_IDENTITY_SHA256 || ""),
    passRunnerRelease: String(process.env.DEV_ERP_REPORT_WORKFLOW_PASS_RUNNER_RELEASE || ""),
    runnerAvailable: runner.available === true,
    actualProbePassed: false,
  });
  const blockers = [...new Set([
    ...(evaluated.blockers || []),
    ...(!reportWorkflowService ? ["workflow_service_unconfigured"] : []),
    ...(reportWorkflowStartupRecoveryStatus === "failed" ? ["workflow_startup_recovery_failed"] : []),
    ...(reportWorkflowStartupRecoveryStatus === "pending" ? ["workflow_startup_recovery_pending"] : []),
    "workflow_receipt_store_unconfigured",
    "erp_shared_runner_single_writer_path_unattested",
  ])].sort();
  return {
    schema: "dev_erp.report_workflow_capability.v1",
    workflow_id: "report_authoring_v0",
    enabled: false,
    binding_revision: "report_authoring_v0.binding.v1",
    raw_input_max_bytes: 393216,
    blockers,
  };
}
const ERP_MCP_ARTIFACT_ROOT = resolve(
  process.env.DEV_ERP_MCP_ARTIFACT_ROOT
    || join(BACKEND_ROOT, "_workspaces", "system", "dev-erp", "mcp-artifacts"),
);
const ERP_MCP_ENABLED = process.env.DEV_ERP_MCP_ENABLED === "1";
const erpMcp = ERP_MCP_ENABLED
  ? createErpMcpService({ store, artifactRoot: ERP_MCP_ARTIFACT_ROOT })
  : null;
try {
  const recovered = store.recoverInterruptedCodexTurnAudits("service_restart");
  if (recovered.recovered) console.warn(`[dev-erp] recovered ${recovered.recovered} interrupted Codex audit row(s)`);
} catch { /* schema verification in openStore remains authoritative */ }
try {
  if (reportWorkflowService) {
    const recovered = reportWorkflowService.recoverInterruptedJobs("service_restart");
    reportWorkflowStartupRecoveryStatus = "pass";
    if (recovered.recovered) console.warn(`[dev-erp] recovered ${recovered.recovered} interrupted report workflow job(s)`);
  }
} catch {
  reportWorkflowStartupRecoveryStatus = "failed";
  console.error("[dev-erp] report workflow startup recovery failed; workflow route remains disabled");
}
try { const bf = store.backfillCompletionLog(); if (bf.inserted) console.log(`[completion_log] 과거 완료 ${bf.inserted}건 백필`); } catch { /* 백필 실패가 기동을 막지 않음 */ }
// 분해: 정본 파티 허용목록(.party) — createItem party_ref 검증 + split-suggest 매칭에 재사용(시작 시 1회 로드).
const PARTY_MATCH = loadPartyMonsterTypes(ROOT);
store.setValidParties(new Set(Object.values(PARTY_MATCH.typeToParty)));
// 감사로그 '조회·잡음' kind — UI EVENT_HIDE 와 동일. noise=0 시 서버에서 제외.
const AUDIT_NOISE_KINDS = ["view", "llm_call", "chat_query", "recommender_run"];
// P1b: data/real_meta.json 이 있으면 (갱신 시각 기준) 자동 ingest.
// 최초 실데이터 도착 시 합성 표본은 제거한다 (가짜/실제 혼합 방지).
const realMetaPath = join(HERE, "data", "real_meta.json");
if (INGEST_PATH) {
  const report = ingestFromFile(store, resolve(INGEST_PATH));
  console.log("[dev-erp] ingest:", JSON.stringify(report));
} else if (AUTO_REAL_META && existsSync(realMetaPath)) {
  const mtime = String(statSync(realMetaPath).mtimeMs);
  if (store.getMeta("real_ingest_mtime") !== mtime) {
    const purged = store.purgeSynthetic();
    const report = ingestFromFile(store, realMetaPath, { label: "real" });
    store.setMeta("real_ingest_mtime", mtime);
    console.log("[dev-erp] real meta ingested:", JSON.stringify({ purged_synthetic: purged, ...report }));
  }
} else if (store.counts().projects === 0) {
  if (LOAD_FIXTURE) {
    const counts = loadFixture(store);
    console.log("[dev-erp] synthetic fixture loaded:", JSON.stringify(counts));
  } else {
    console.log("[dev-erp] empty db: synthetic fixture skipped (use --fixture to load demo data)");
  }
}

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };
const todayKey = () => new Date().toISOString().slice(0, 10);

function send(res, code, body, type = "application/json", extraHeaders = {}) {
  const payload = type === "application/json" ? JSON.stringify(body) : body;
  res.writeHead(code, { "content-type": `${type}; charset=utf-8`, "cache-control": "no-store", ...extraHeaders });
  res.end(payload);
}
function isInside(root, target) {
  return target === root || target.startsWith(`${root}${sep}`);
}
function isRealFilesystemPathInside(root, target) {
  const rootPath = resolve(root);
  const targetPath = resolve(target);
  const comparableRoot = process.platform === "win32" ? rootPath.toLowerCase() : rootPath;
  const comparableTarget = process.platform === "win32" ? targetPath.toLowerCase() : targetPath;
  return comparableTarget === comparableRoot || comparableTarget.startsWith(`${comparableRoot}${sep}`);
}
function serveFile(res, full) {
  const type = MIME[extname(full)] ?? "text/plain";
  // 텍스트류는 utf-8, 이미지 등 바이너리는 Buffer 그대로(utf-8로 읽으면 깨짐).
  const binary = !(type.startsWith("text/") || type === "application/json" || type === "image/svg+xml");
  return send(res, 200, binary ? readFileSync(full) : readFileSync(full, "utf-8"), type);
}
function serveFromRoot(res, root, relPath) {
  const full = resolve(root, relPath);
  if (!isInside(root, full) || !existsSync(full)) return false;
  try {
    if (!statSync(full).isFile()) return false;
  } catch {
    return false;
  }
  serveFile(res, full);
  return true;
}

const SID_BASE = "dev_erp_sid";
const SID = `${SID_BASE}_${PORT}`;
function readCookie(req, name) {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}
// 현재 로그인 계정(없으면 null=익명). 익명이면 앱은 현행대로 동작.
function currentAccount(req) {
  return store.sessionAccount(readCookie(req, SID));
}
// 로그인 브루트포스 방지: IP+아이디별 인메모리 실패 카운트. 5회 연속 실패 시 60초 차단, 성공 시 초기화.
// 사내망 전제라 인메모리로 충분(서버 재시작 시 리셋 — 영속 잠금은 과잉).
const LOGIN_FAILS = new Map(); // key -> { n, until }
function loginBlockedSec(key) {
  const f = LOGIN_FAILS.get(key);
  return f && f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 1000) : 0;
}
function noteLoginFail(key) {
  const f = LOGIN_FAILS.get(key) || { n: 0, until: 0 };
  f.n += 1;
  if (f.n >= 5) { f.until = Date.now() + 60_000; f.n = 0; }
  LOGIN_FAILS.set(key, f);
}
// B-5: 자동 정리 영수증 집계(read-only) — 스레드 귀속/사본 정리로 화면에 안 뜨는 메일이 "몇 건, 왜" 인지.
// 메타데이터만 반환(사유 버킷·건수·최근시각). 제목/본문/키 원문은 내보내지 않는다. 진실원 = _workmeta 영수증 CSV.
function splitCsvLine(line) {
  const out = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i += 1; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
function mailReceiptsSummary(project = null) {
  const wmRoot = BACKEND_WORKMETA_ROOT;
  const folders = project
    ? [String(project)]
    : (existsSync(wmRoot) ? readdirSync(wmRoot).filter((e) => { try { return statSync(join(wmRoot, e)).isDirectory(); } catch { return false; } }) : []);
  const summary = { total: 0, by_reason: {}, by_project: {}, last_handled_at: "" };
  for (const folder of folders) {
    if (/[\\/]|\.\./.test(folder)) continue; // 경로 탈출 방지(project 파라미터는 폴더명 1단만)
    const p = join(wmRoot, folder, "reports", "haengbogwan_mail_receipts", "mail_receipts.csv");
    if (!existsSync(p)) continue;
    let lines = [];
    try { lines = readFileSync(p, "utf8").split(/\r?\n/).filter((l) => l.trim()); } catch { continue; }
    if (lines.length < 2) continue;
    const header = splitCsvLine(lines[0]);
    const iReason = header.indexOf("reason"), iAt = header.indexOf("handled_at");
    let n = 0;
    for (const line of lines.slice(1)) {
      const f = splitCsvLine(line);
      const bucket = String(f[iReason] ?? "").split(":")[0].trim() || "(기타)";
      summary.by_reason[bucket] = (summary.by_reason[bucket] || 0) + 1;
      const at = String(f[iAt] ?? "").trim();
      if (at > summary.last_handled_at) summary.last_handled_at = at;
      n += 1;
    }
    summary.total += n;
    summary.by_project[folder] = n;
  }
  return summary;
}
// 세션 쿠키 문자열. HttpOnly+SameSite=Lax, 팀 공개 HTTPS proxy/tunnel 에서는 Secure 옵션 사용.
function sessionCookie(token, maxAgeSec) {
  const attrs = `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${COOKIE_SECURE ? "; Secure" : ""}`;
  const primary = `${SID}=${encodeURIComponent(token)}; ${attrs}`;
  const clearLegacy = `${SID_BASE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${COOKIE_SECURE ? "; Secure" : ""}`;
  return SID === SID_BASE ? primary : [primary, clearLegacy];
}
// 관리자 가드: admin 역할 계정만. 아니면 null.
function requireAdmin(req) {
  const a = currentAccount(req);
  return a && store.isAdmin(a.id) ? a : null;
}
function allowSharedWrite(req, res) {
  if (store.accountCount() === 0 || requireAdmin(req)) return true;
  send(res, 403, { error: "admin_only" });
  return false;
}
async function readRawBody(req, maxBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) {
      const err = new Error("too_large");
      err.code = "too_large";
      throw err;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function readJson(req, maxBytes = 1024 * 1024) {
  const body = await readRawBody(req, maxBytes);
  try { return JSON.parse(body.length ? body.toString("utf8") : "{}"); } catch { return {}; }
}
function intParam(value, fallback, { min = 0, max = 500 } = {}) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
function wantsPage(qp) {
  return qp.page === "1" || qp.page === "true";
}
// 보기 대상(view) → 할일 담당자 식별자 배열. view=계정id|team, mine=1=본인.
// 권한: 관리자=아무 계정, 팀원=본인만(타인 요청은 본인으로 강등). 익명/팀=전체(하위호환).
function viewIdentities(req, qp) {
  const me = currentAccount(req);
  if (qp.mine === "1") return me ? store.accountIdentities(me) : [];
  const v = qp.view;
  if (!v || v === "team") {
    if (!me || store.isAdmin(me.id)) return undefined; // 전체(필터 없음)
    return store.accountIdentities(me);                // 일반 팀원의 '팀' 기본은 본인
  }
  if (me && (store.isAdmin(me.id) || me.id === v)) {
    const acc = store.db.prepare("SELECT id,username,person_id,email,display_name FROM core_account WHERE id=?").get(v);
    return acc ? store.accountIdentities(acc) : [];
  }
  return me ? store.accountIdentities(me) : [];
}
// 보기 대상(view) → 메일함(mailbox=계정 이메일). 전체는 undefined, 메일 없는 계정은 빈 결과 키.
function viewMailbox(req, qp) {
  const me = currentAccount(req);
  const v = qp.view;
  if (qp.mine === "1") return me?.email || "__none__";
  if (!v || v === "team") {
    if (!me || store.isAdmin(me.id)) return undefined; // 전체
    return me.email || "__none__";
  }
  if (me && (store.isAdmin(me.id) || me.id === v)) {
    const acc = store.db.prepare("SELECT email FROM core_account WHERE id=?").get(v);
    return acc?.email || "__none__";
  }
  return me?.email || "__none__";
}

function canAccessMail(req, mail_id) {
  const mailbox = viewMailbox(req, {});
  if (!mailbox || mailbox === "team") return true;
  if (mailbox === "__none__") return false;
  const row = store.db.prepare("SELECT mailbox FROM core_mail WHERE id=?").get(mail_id);
  if (!row) return true;
  if (!row.mailbox || !String(row.mailbox).trim()) return true; // 메일함 메타 없는 수집 받은함 메일=로그인 팀원이 함께 분류·분배하는 공용 큐(canAccessItem unclassified 예외와 대칭)
  return store.mailboxMatches(row.mailbox, mailbox);
}

function requestScope(req, qp = {}) {
  const me = currentAccount(req);
  if (!me || store.isAdmin(me.id)) return { all: true };
  return { actor: me.username, assignee_any: viewIdentities(req, qp), mailbox: viewMailbox(req, qp) };
}

function canAccessItem(req, item_id) {
  const me = currentAccount(req);
  if (!me || store.isAdmin(me.id)) return true;
  const row = store.db.prepare("SELECT assignee_ref,status FROM core_item WHERE id=?").get(item_id);
  if (!row) return true;
  if (row.status === "unclassified") return true; // 미분류 인입함은 로그인 팀원이 함께 분류하는 공용 큐.
  if (!row.assignee_ref && !["done", "archived"].includes(row.status)) return true; // 미배정(주인 없는) 활성 할일 = 아무나 먼저 잡는 공용 풀
  return viewIdentities(req, {}).includes(row.assignee_ref);
}

function canAccessProject(req, projectId) {
  const me = currentAccount(req);
  if (!me) return false;
  const project = store.db.prepare("SELECT id FROM core_project WHERE id=?").get(String(projectId || ""));
  if (!project) return false;
  if (store.isAdmin(me.id)) return true;
  const items = store.db.prepare("SELECT id FROM core_item WHERE project_id=? ORDER BY id LIMIT 500").all(project.id);
  return items.length === 0 || items.some((row) => canAccessItem(req, row.id));
}

const ERP_MCP_CALLS_PER_MINUTE = Math.max(
  10,
  Math.min(600, Math.trunc(Number(process.env.DEV_ERP_MCP_CALLS_PER_MINUTE) || 120)),
);
const erpMcpCallsByAccount = new Map();
function authenticatedMcpAccount(req) {
  if (!erpMcp) throw new ErpMcpError("mcp_disabled", 404);
  const account = erpMcp.authenticate(req.headers.authorization || "");
  const cutoff = Date.now() - 60_000;
  const recent = (erpMcpCallsByAccount.get(account.id) || []).filter((at) => at > cutoff);
  if (recent.length >= ERP_MCP_CALLS_PER_MINUTE) throw new ErpMcpError("mcp_rate_limited", 429);
  recent.push(Date.now());
  erpMcpCallsByAccount.set(account.id, recent);
  return account;
}
function appendMcpAudit(account, tool, { itemId = null, projectId = null, to = "ok" } = {}) {
  store.appendEvent({
    actor_ref: account?.username || "mcp_upload_ticket",
    actor_kind: account ? "human" : "system",
    kind: "mcp_tool_call",
    item_ref: itemId,
    project_ref: projectId,
    to,
    used_refs: ["erp_mcp"],
    data_label: "meta",
    note: `tool=${tool}`,
  });
}

function lastIngestAt() {
  const rows = store.db.prepare("SELECT at FROM event_log WHERE kind IN ('ingest','mail_ingest') ORDER BY id DESC LIMIT 1").get();
  return rows?.at ?? null;
}
function runtimeVersion() {
  return {
    schema: "dev_erp.version.v1",
    erp: ERP_VERSION,
    chatbot: CHATBOT_VERSION,
    runtime: {
      port: PORT,
      checkout: IS_RUNTIME_CHECKOUT ? "runtime" : "development",
      llm: {
        provider: process.env.ERP_CHAT_PROVIDER || "stub",
        model: process.env.ERP_CHAT_MODEL || "gemma3:4b",
        thinking: llmThinkEnabled()
      },
      codex_task: {
        mode: CODEX_TASK_BRIDGE_MODE,
        bridge: CODEX_TASK_BRIDGE_VERSION.release,
        worker: CODEX_TASK_BRIDGE_MODE === "worker" ? CODEX_DEDICATED_WORKER_VERSION.release : null,
      }
    }
  };
}
function runtimeCommit() {
  return RUNTIME_SOURCE_COMMIT;
}
function codexPayloadOwnerState() {
  const workspaceOwnerRoot = resolve(BACKEND_ROOT, "_workspaces", "system");
  const ownerBase = resolve(BACKEND_ROOT, "_workspaces", "system", "dev-erp");
  const roots = [CODEX_TASK_ATTACHMENT_ROOT, CODEX_TASK_MESSAGE_PAYLOAD_ROOT];
  return inspectCodexPayloadOwner({
    backendRoot: BACKEND_ROOT,
    workspaceOwnerRoot,
    ownerBase,
    roots,
    configured: !IS_RUNTIME_CHECKOUT || !!String(process.env.DEV_ERP_BACKEND_ROOT || "").trim(),
  });
}
let codexPayloadOwnerPinnedRevision = null;
function assertCodexPayloadOwnerReady() {
  const state = codexPayloadOwnerState();
  if (!state.configured || !state.roots_safe || !state.revision) return false;
  if (codexPayloadOwnerPinnedRevision === null) codexPayloadOwnerPinnedRevision = state.revision;
  return codexPayloadOwnerPinnedRevision === state.revision;
}
async function runtimeHealthAttestation() {
  const registry = codexWorkspaceRegistryState();
  const payloadOwner = codexPayloadOwnerState();
  const worker = CODEX_TASK_BRIDGE_MODE === "worker" ? await codexDedicatedWorkerHealth() : null;
  return {
    source_commit: runtimeCommit() || null,
    erp_release: ERP_VERSION.release,
    codex_bridge: CODEX_TASK_BRIDGE_VERSION.release,
    codex_workspace_registry_revision: registry.registry?.mappingRevision || null,
    codex_dedicated_home_configured: worker ? worker.codex_home_ready === true : CODEX_TASK_DEDICATED_HOME_CONFIGURED,
    codex_dedicated_profile_safe: worker ? worker.codex_home_ready === true : codexDedicatedProfileReady(),
    codex_trust_domain_configured: !!CODEX_TASK_TRUST_DOMAIN,
    codex_payload_owner_configured: payloadOwner.configured,
    codex_payload_roots_safe: payloadOwner.roots_safe,
    codex_payload_owner_revision: payloadOwner.revision,
    codex_execution_boundary: worker?.ready ? "dedicated_worker" : (worker ? "worker_unattested" : "in_process"),
    codex_worker_configured: worker?.configured === true,
    codex_worker_ready: worker?.ready === true,
    codex_worker_release: worker?.release || null,
    codex_worker_release_binding_revision: worker?.configured === true
      ? CODEX_TASK_WORKER_RELEASE_BINDING_REVISION
      : null,
    codex_worker_attestation_verified: worker?.attestation_verified === true,
    codex_worker_attestation_key_match: worker?.attestation_key_match === true,
    codex_worker_source_commit_match: worker?.source_commit_match === true,
    codex_worker_source_tree_clean: worker?.source_tree_clean === true,
    codex_worker_identity_match: worker?.identity_match === true,
    codex_worker_process_separate: worker?.process_separate === true,
    codex_worker_identity_separate: worker?.identity_separate === true,
    codex_worker_registry_revision_match: worker?.registry_revision_match === true,
    codex_worker_root_isolation_ready: worker?.root_isolation_ready === true,
    codex_worker_projection_root_ready: worker?.projection_root_ready === true,
    codex_worker_denied_read_roots_ready: worker?.denied_read_roots_ready === true,
    codex_worker_payload_deny_binding_match: worker?.payload_deny_binding_match === true,
    codex_worker_forbidden_roots_ready: worker?.forbidden_roots_ready === true,
    codex_worker_permission_profile_match: worker?.permission_profile_match === true,
    codex_worker_filesystem_boundary_proven: worker?.filesystem_boundary_proven === true,
    codex_worker_command_identity_match: worker?.command_identity_match === true,
    codex_worker_bridge_mode: worker?.bridge_mode || null,
  };
}

let codexSkillCache = { at: 0, rows: [] };
function cleanFrontmatterValue(value) {
  return String(value || "").trim().replace(/^["']|["']$/g, "");
}
function parseSkillMeta(skillPath) {
  let text = "";
  try { text = readFileSync(skillPath, "utf8"); } catch { return null; }
  const head = text.startsWith("---") ? text.slice(3, text.indexOf("\n---", 3) > 0 ? text.indexOf("\n---", 3) : 3000) : text.slice(0, 3000);
  const name = cleanFrontmatterValue(head.match(/^name:\s*(.+)$/m)?.[1]) || basename(dirname(skillPath));
  const description = cleanFrontmatterValue(head.match(/^description:\s*(.+)$/m)?.[1]);
  if (!name) return null;
  return { name, description, path: skillPath };
}
function collectSkillFiles(root, { maxDepth = 8, maxFiles = 500 } = {}) {
  const found = [];
  const walk = (dir, depth) => {
    if (found.length >= maxFiles || depth > maxDepth) return;
    let entries = [];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (found.length >= maxFiles) break;
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const full = join(dir, entry.name);
      if (entry.isFile() && entry.name === "SKILL.md") found.push(full);
      else if (entry.isDirectory()) walk(full, depth + 1);
    }
  };
  if (existsSync(root)) walk(root, 0);
  return found;
}
function listCodexSkills({ refresh = false } = {}) {
  const now = Date.now();
  if (!refresh && now - codexSkillCache.at < 30000) return codexSkillCache.rows;
  if (!CODEX_TASK_ALLOWED_SKILLS.size) {
    codexSkillCache = { at: now, rows: [] };
    return codexSkillCache.rows;
  }
  const roots = [join(CODEX_HOME, "skills")];
  const byName = new Map();
  for (const root of roots) {
    for (const file of collectSkillFiles(root)) {
      const meta = parseSkillMeta(file);
      if (!meta || !CODEX_TASK_ALLOWED_SKILLS.has(meta.name)) continue;
      const prev = byName.get(meta.name);
      if (!prev || file.includes(`${sep}skills${sep}`)) byName.set(meta.name, meta);
    }
  }
  codexSkillCache = {
    at: now,
    rows: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 400),
  };
  return codexSkillCache.rows;
}
let codexModelCatalogCache = { at: 0, value: null };
let codexModelCatalogPending = null;
function cleanCodexHostError(error, fallback = "codex_error", maxLength = 600) {
  const raw = String(error?.message || error || fallback);
  if (/(?:^|[\s("'`])(?:[A-Za-z]:[\\/]|\\\\[^\\/\s]+[\\/]|\/(?:Users|home|var|etc|tmp|opt)\/)/i.test(raw)
      || /\bBearer\s+\S+|\bsk-[A-Za-z0-9_-]{12,}|\b(?:token|password|cookie)\s*[=:]\s*\S+/i.test(raw)) {
    return fallback;
  }
  return raw
    .replace(/[A-Za-z]:[\\/][^\s"'`<>|]*/g, "[host-path]")
    .replace(/\\\\[^\\/\s]+[\\/][^\s"'`<>|]*/g, "[host-path]")
    .replace(/(^|\s)\/(?:Users|home|var|etc|tmp|opt)\/[^\s"'`<>|]*/g, "$1[host-path]")
    .replace(/\bBearer\s+\S+|\bsk-[A-Za-z0-9_-]{12,}|\b(?:token|password|cookie)\s*[=:]\s*\S+/gi, "[secret]")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength) || fallback;
}
function cleanCodexCatalogError(error) {
  return cleanCodexHostError(error, "codex_model_discovery_failed", 600);
}
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function cleanCodexAssistantText(value, sensitivePaths = []) {
  let text = String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
  for (const candidate of sensitivePaths) {
    const path = String(candidate || "");
    if (!path) continue;
    const variants = new Set([
      path,
      path.replaceAll("\\", "/"),
      path.replaceAll("\\", "\\\\"),
    ]);
    for (const variant of variants) {
      text = text.replace(new RegExp(escapeRegExp(variant), process.platform === "win32" ? "gi" : "g"), "[host-path]");
    }
  }
  const hostPath = /(?:^|[\s("'`])(?:[A-Za-z]:[\\/]|\\\\[^\\/\s]+[\\/]|\/(?:Users|home|var|etc|tmp|opt)\/)/i;
  text = text.split(/\r?\n/).map((line) => hostPath.test(line) ? "[host-path redacted]" : line).join("\n");
  return text.slice(0, 200_000).trim() || "Codex turn completed.";
}
function publicCodexItem(item) {
  if (!item || typeof item !== "object") return null;
  return {
    id: item.id,
    project_id: item.project_id,
    title: item.title,
    status: item.status,
    due: item.due ?? null,
    assignee_ref: item.assignee_ref ?? null,
    work_type: item.work_type ?? null,
    completion_criteria: item.completion_criteria ?? null,
  };
}
function publicCodexBinding(binding) {
  if (!binding) return null;
  return {
    opened: true,
    item_id: binding.item_id,
    thread_title: binding.thread_title,
    mode: binding.mode,
    sync_state: binding.sync_state,
    workspace_id: binding.workspace_id,
  };
}
function publicEventRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const next = { ...row };
    if (new Set(["codex_task_thread_open", "codex_task_message"]).has(next.kind)) next.to_val = "recorded";
    if (typeof next.note === "string") {
      next.note = next.note
        .replace(/(?:^|;)codex_thread_id=[^;]*/g, (match) => match.startsWith(";") ? ";codex_thread_open=1" : "codex_thread_open=1")
        .replace(/;;+/g, ";");
    }
    return next;
  });
}
function fallbackCodexTaskCatalog(error) {
  return {
    models: fallbackCodexModelCatalog(),
    source: "fallback",
    fetched_at: new Date().toISOString(),
    error: cleanCodexCatalogError(error),
  };
}
async function codexTaskModelCatalog({ refresh = false } = {}) {
  const now = Date.now();
  if (!refresh && codexModelCatalogCache.value && now - codexModelCatalogCache.at < CODEX_TASK_MODEL_CATALOG_TTL_MS) {
    return codexModelCatalogCache.value;
  }
  if (codexModelCatalogPending) return codexModelCatalogPending;
  codexModelCatalogPending = (async () => {
    let value;
    if (CODEX_TASK_BRIDGE_MODE === "mock") {
      value = fallbackCodexTaskCatalog("codex_model_discovery_unavailable:mock_mode");
    } else if (CODEX_TASK_BRIDGE_MODE === "worker") {
      try {
        const discovered = await codexDedicatedWorkerClient().models({ timeoutMs: 10_000 });
        value = {
          models: Array.isArray(discovered.models) ? discovered.models : [],
          source: discovered.source || "dedicated_worker",
          fetched_at: discovered.fetched_at || new Date().toISOString(),
          error: discovered.degraded === true ? "codex_model_discovery_degraded" : null,
        };
      } catch (error) {
        value = fallbackCodexTaskCatalog(safeCodexWorkerError(error));
      }
    } else if (!CODEX_TASK_DEDICATED_HOME_CONFIGURED) {
      value = fallbackCodexTaskCatalog("codex_model_discovery_unavailable:dedicated_home_required");
    } else {
      try {
        const discovered = await discoverCodexModels({ cwd: CODEX_TASK_MODEL_DISCOVERY_CWD });
        value = { ...discovered, error: null };
      } catch (error) {
        value = fallbackCodexTaskCatalog(error);
      }
    }
    codexModelCatalogCache = { at: Date.now(), value };
    return value;
  })().finally(() => { codexModelCatalogPending = null; });
  return codexModelCatalogPending;
}
let codexWorkspaceRegistryCache = { content_hash: null, registry: null, error: null };
const codexWorkspaceProbeCache = new Map();
const activeCodexTurns = new Map();
const activeCodexPreflights = new Map();
const codexTurnStartsByAccount = new Map();
function consumeCodexAccountRate(accountId) {
  const now = Date.now();
  const cutoff = now - 60 * 60 * 1000;
  const recent = (codexTurnStartsByAccount.get(accountId) || []).filter((at) => at > cutoff);
  if (recent.length >= CODEX_TASK_ACCOUNT_TURNS_PER_HOUR) {
    const retryAfter = Math.max(1, Math.ceil((recent[0] + 60 * 60 * 1000 - now) / 1000));
    codexTurnStartsByAccount.set(accountId, recent);
    return { error: "codex_account_rate_limit", status: 429, retry_after_sec: retryAfter };
  }
  recent.push(now);
  codexTurnStartsByAccount.set(accountId, recent);
  return { ok: true };
}
function claimCodexPreflight({ itemId, accountId }) {
  if (activeCodexTurns.has(itemId) || activeCodexPreflights.has(itemId)) {
    return { error: "codex_turn_already_active", status: 409 };
  }
  if (activeCodexTurns.size + activeCodexPreflights.size >= CODEX_TASK_GLOBAL_CONCURRENCY) {
    return { error: "codex_global_concurrency_limit", status: 429, retry_after_sec: 5 };
  }
  const accountActive = [...activeCodexTurns.values()].filter((entry) => entry.account_id === accountId).length
    + [...activeCodexPreflights.values()].filter((entry) => entry.account_id === accountId).length;
  if (accountActive >= CODEX_TASK_ACCOUNT_CONCURRENCY) {
    return { error: "codex_account_concurrency_limit", status: 429, retry_after_sec: 5 };
  }
  const rate = consumeCodexAccountRate(accountId);
  if (!rate.ok) return rate;
  const token = Symbol(itemId);
  activeCodexPreflights.set(itemId, { account_id: accountId, token });
  let released = false;
  return {
    ok: true,
    release() {
      if (released) return;
      released = true;
      if (activeCodexPreflights.get(itemId)?.token === token) activeCodexPreflights.delete(itemId);
    },
  };
}
function claimCodexOperation({ itemId, accountId, controller, grantRefs = [], operation }) {
  if (activeCodexTurns.has(itemId)) return { error: "codex_turn_already_active", status: 409 };
  if (activeCodexTurns.size >= CODEX_TASK_GLOBAL_CONCURRENCY) {
    return { error: "codex_global_concurrency_limit", status: 429, retry_after_sec: 5 };
  }
  const accountActive = [...activeCodexTurns.values()].filter((entry) => entry.account_id === accountId).length;
  if (accountActive >= CODEX_TASK_ACCOUNT_CONCURRENCY) {
    return { error: "codex_account_concurrency_limit", status: 429, retry_after_sec: 5 };
  }
  const entry = { controller, grant_refs: new Set(grantRefs), operation, account_id: accountId };
  activeCodexTurns.set(itemId, entry);
  return { ok: true, entry };
}
function sendCodexAdmissionError(res, admission) {
  return send(
    res,
    admission.status || 409,
    { error: admission.error, ...(admission.retry_after_sec ? { retry_after_sec: admission.retry_after_sec } : {}) },
    "application/json",
    admission.retry_after_sec ? { "retry-after": String(admission.retry_after_sec) } : {},
  );
}
function cleanWorkspaceRegistryError(error) {
  const code = String(error?.code || error?.message || error || "workspace_registry_invalid");
  const match = code.match(/(?:workspace_registry:)?([a-z0-9_:-]{1,120})/i);
  return match?.[1] || "workspace_registry_invalid";
}
function codexWorkspaceRegistryState({ refresh = false } = {}) {
  if (!existsSync(CODEX_TASK_WORKSPACE_REGISTRY_PATH)) {
    codexWorkspaceRegistryCache = { content_hash: null, registry: null, error: "workspace_registry_not_configured" };
    return codexWorkspaceRegistryCache;
  }
  let text;
  let contentHash;
  try {
    const info = statSync(CODEX_TASK_WORKSPACE_REGISTRY_PATH);
    if (!info.isFile() || info.size < 2 || info.size > 256 * 1024) throw new Error("workspace_registry_size_invalid");
    text = readFileSync(CODEX_TASK_WORKSPACE_REGISTRY_PATH, "utf8");
    contentHash = createHash("sha256").update(text).digest("hex");
  }
  catch {
    codexWorkspaceRegistryCache = { content_hash: null, registry: null, error: "workspace_registry_unavailable" };
    return codexWorkspaceRegistryCache;
  }
  if (!refresh && codexWorkspaceRegistryCache.registry && codexWorkspaceRegistryCache.content_hash === contentHash) {
    return codexWorkspaceRegistryCache;
  }
  try {
    const registry = parseWorkspaceRegistryJson(text);
    if (CODEX_TASK_TRUST_DOMAIN && registry.trustDomainId !== CODEX_TASK_TRUST_DOMAIN) {
      throw new Error("workspace_registry:trust_domain_mismatch");
    }
    codexWorkspaceRegistryCache = { content_hash: contentHash, registry, error: null };
    codexWorkspaceProbeCache.clear();
  } catch (error) {
    codexWorkspaceRegistryCache = { content_hash: contentHash, registry: null, error: cleanWorkspaceRegistryError(error) };
  }
  return codexWorkspaceRegistryCache;
}
function codexWorkspaceAuthorizationContext(item, account) {
  return {
    authenticated: !!account,
    project_id: String(item?.project_id || ""),
    account_id: account?.id || null,
    roles: account ? store.rolesFor(account.id) : [],
  };
}
function publicCodexWorkspaceRegistry({ item = null, account = null } = {}) {
  const state = codexWorkspaceRegistryState();
  if (!state.registry) {
    return {
      configured: false,
      error: state.error,
      mapping_revision: null,
      default_workspace_id: null,
      workspaces: [],
    };
  }
  const descriptor = state.registry.publicDescriptor();
  const workspaces = item && account
    ? state.registry.authorizedPublicRows(codexWorkspaceAuthorizationContext(item, account))
    : [];
  return {
    configured: true,
    error: null,
    mapping_revision: descriptor.mapping_revision,
    default_workspace_id: null,
    workspaces,
  };
}
async function probeCodexWorkspace(registry, workspaceId) {
  const key = `${registry.mappingRevision}:${workspaceId}`;
  const cached = codexWorkspaceProbeCache.get(key);
  if (cached?.pending) return cached.pending;
  if (cached?.result && Date.now() - cached.at < CODEX_TASK_WORKSPACE_PROBE_TTL_MS) return cached.result;
  const pending = registry.probe(workspaceId).then((result) => {
    codexWorkspaceProbeCache.set(key, { at: Date.now(), result, pending: null });
    return result;
  }, () => {
    const result = { ok: false, error: "workspace_probe_failed", workspace_id: workspaceId };
    codexWorkspaceProbeCache.set(key, { at: Date.now(), result, pending: null });
    return result;
  });
  codexWorkspaceProbeCache.set(key, { at: Date.now(), result: null, pending });
  return pending;
}
async function resolveCodexTaskWorkspace({ requestedWorkspaceId = null, binding = null, item = null, account = null } = {}) {
  const state = codexWorkspaceRegistryState();
  if (!state.registry) return { error: state.error || "workspace_registry_unavailable" };
  if (!item?.id || !item.project_id || !account?.id) return { error: "workspace_authorization_required" };
  const registry = state.registry;
  if (binding && (!binding.workspace_id || !binding.workspace_revision || !binding.workspace_root_fingerprint)) {
    return { error: "legacy_workspace_binding_unmigrated" };
  }
  const requested = String(requestedWorkspaceId || "").trim();
  if (binding?.workspace_id && requested && binding.workspace_id !== requested) {
    return { error: "workspace_binding_immutable" };
  }
  const workspaceId = binding?.workspace_id || requested;
  if (!workspaceId) return { error: "workspace_id_required" };
  const authorization = codexWorkspaceAuthorizationContext(item, account);
  const authorized = registry.authorize(workspaceId, authorization);
  if (!authorized.ok) return { error: authorized.error };
  if (CODEX_TASK_BRIDGE_MODE === "worker") {
    const workerHealth = await codexDedicatedWorkerHealth();
    if (!workerHealth.ready) return { error: workerHealth.error || "codex_worker_unavailable" };
    let resolved;
    try {
      resolved = await codexDedicatedWorkerClient().resolve({
        workspace_id: workspaceId,
        authorization,
        relative_path: "",
      }, { timeoutMs: 10_000 });
    } catch (error) {
      return { error: safeCodexWorkerError(error) };
    }
    if (resolved.mapping_revision !== registry.mappingRevision
        || !["windows", "posix"].includes(resolved.path_style)) {
      return { error: "workspace_registry_revision_mismatch" };
    }
    if (binding?.workspace_revision && binding.workspace_revision !== resolved.workspace_revision) {
      return { error: "workspace_binding_revision_mismatch" };
    }
    if (binding?.workspace_root_fingerprint && binding.workspace_root_fingerprint !== resolved.root_fingerprint) {
      return { error: "workspace_binding_root_mismatch" };
    }
    return {
      ok: true,
      registry,
      workspace_id: workspaceId,
      mapping_revision: resolved.workspace_revision,
      root_fingerprint: resolved.root_fingerprint,
      path_style: resolved.path_style,
      public_workspace: authorized.workspace,
      authorization,
      working_relative_path: resolved.relative_path,
    };
  }
  const probed = await probeCodexWorkspace(registry, workspaceId);
  if (!probed.ok) return { error: probed.error || "workspace_offline" };
  const resolved = await registry.resolvePathAsync(workspaceId, "", { timeoutMs: 2000 });
  if (!resolved.ok) return { error: resolved.error || "workspace_unavailable" };
  if (binding?.workspace_revision && binding.workspace_revision !== resolved.workspace_revision) {
    return { error: "workspace_binding_revision_mismatch" };
  }
  if (binding?.workspace_root_fingerprint && binding.workspace_root_fingerprint !== resolved.root_fingerprint) {
    return { error: "workspace_binding_root_mismatch" };
  }
  return {
    ok: true,
    registry,
    workspace_id: workspaceId,
    mapping_revision: resolved.workspace_revision,
    root_fingerprint: resolved.root_fingerprint,
    path: resolved.path,
    path_style: resolved.path_style,
    public_workspace: authorized.workspace,
    authorization,
    working_relative_path: resolved.relative_path,
  };
}
function canonicalWriteGrant(row) {
  return {
    grant_id: row.id,
    workspace_id: row.workspace_id,
    workspace_revision: row.workspace_revision,
    workspace_root_fingerprint: row.workspace_root_fingerprint,
    project_id: row.project_id,
    item_id: row.item_id,
    relative_prefix: row.relative_prefix,
    approved_by: row.approved_by,
    approved_at: row.approved_at,
    expires_at: row.expires_at,
    revoked: !!row.revoked_at,
    revoked_at: row.revoked_at || null,
  };
}
function publicActiveWriteGrants(item) {
  const binding = item?.id ? store.codexTaskBinding(item.id) : null;
  if (!binding) return [];
  const registry = codexWorkspaceRegistryState().registry;
  if (!registry) return [];
  const allowedApprovers = store.codexWorkspaceAllowedApprovers();
  return store.codexWorkspaceWriteGrants(item.id, { active_only: true }).filter((row) => evaluateWriteGrant(
    canonicalWriteGrant(row),
    {
      workspace_id: binding.workspace_id,
      workspace_revision: binding.workspace_revision,
      workspace_root_fingerprint: binding.workspace_root_fingerprint,
      project_id: item.project_id,
      item_id: item.id,
      relative_path: row.relative_prefix,
      path_style: "posix",
      allowed_approvers: allowedApprovers,
    },
  ).allowed && registry.checkWritePrefixes(binding.workspace_id, [row.relative_prefix]).ok).map((row) => ({
    grant_id: row.id,
    workspace_id: row.workspace_id,
    relative_prefix: row.relative_prefix,
    approved_by: row.approved_by,
    approved_at: row.approved_at,
    expires_at: row.expires_at,
  }));
}
async function resolveCodexTurnAccess(item, workspace) {
  if (CODEX_TASK_BRIDGE_MODE === "worker") {
    return {
      working_relative_path: workspace.working_relative_path || "",
      relative_write_prefixes: [],
      sandbox_mode: "read-only",
      grant_refs: [],
      lease_expires_at: null,
      authorized_at: new Date().toISOString(),
    };
  }
  const allowedApprovers = store.codexWorkspaceAllowedApprovers();
  const initialNow = new Date();
  const candidates = store.codexWorkspaceWriteGrants(item.id, { active_only: true, now: initialNow });
  if (candidates.length > 32) return { error: "too_many_active_write_grants" };
  const resolvedCandidates = await Promise.all(candidates.map(async (row) => {
    const decision = evaluateWriteGrant(canonicalWriteGrant(row), {
      workspace_id: workspace.workspace_id,
      workspace_revision: workspace.mapping_revision,
      workspace_root_fingerprint: workspace.root_fingerprint,
      project_id: item.project_id,
      item_id: item.id,
      relative_path: row.relative_prefix,
      path_style: workspace.path_style,
      allowed_approvers: allowedApprovers,
    }, { now: initialNow });
    if (!decision.allowed) return null;
    const staticPolicy = workspace.registry.authorizeWritePrefixes(
      workspace.workspace_id,
      [decision.relative_prefix],
      workspace.authorization,
    );
    if (!staticPolicy.ok) return { row, error: staticPolicy.error };
    let resolved;
    if (CODEX_TASK_BRIDGE_MODE === "worker") {
      try {
        resolved = await codexDedicatedWorkerClient().resolve({
          workspace_id: workspace.workspace_id,
          authorization: workspace.authorization,
          relative_path: decision.relative_prefix,
        }, { timeoutMs: 10_000 });
      } catch {
        return { row, error: "workspace_write_path_unavailable" };
      }
      if (resolved.workspace_revision !== workspace.mapping_revision
          || resolved.root_fingerprint !== workspace.root_fingerprint) {
        return { row, error: "workspace_write_binding_mismatch" };
      }
    } else {
      resolved = await workspace.registry.resolvePathAsync(workspace.workspace_id, decision.relative_prefix, { timeoutMs: 2000 });
    }
    return resolved.ok && resolved.target_is_directory
      ? { row, resolved }
      : { row, error: "workspace_write_path_unavailable" };
  }));
  const resolutionFailure = resolvedCandidates.find((entry) => entry?.error);
  if (resolutionFailure) return { error: resolutionFailure.error };
  const authorizedAtDate = new Date();
  const currentById = new Map(store.codexWorkspaceWriteGrants(item.id, { active_only: true, now: authorizedAtDate })
    .map((row) => [row.id, row]));
  const writable = [];
  for (const candidate of resolvedCandidates.filter(Boolean)) {
    const row = currentById.get(candidate.row.id);
    if (!row) continue;
    const decision = evaluateWriteGrant(canonicalWriteGrant(row), {
      workspace_id: workspace.workspace_id,
      workspace_revision: workspace.mapping_revision,
      workspace_root_fingerprint: workspace.root_fingerprint,
      project_id: item.project_id,
      item_id: item.id,
      relative_path: row.relative_prefix,
      path_style: workspace.path_style,
      allowed_approvers: allowedApprovers,
    }, { now: authorizedAtDate });
    if (!decision.allowed) continue;
    writable.push({
      grant_id: row.id,
      path: CODEX_TASK_BRIDGE_MODE === "worker" ? candidate.resolved.relative_path : candidate.resolved.path,
      expires_at: row.expires_at,
    });
  }
  const unique = [];
  const seen = new Set();
  for (const entry of writable) {
    const key = workspace.path_style === "windows" ? entry.path.toLowerCase() : entry.path;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(entry);
    if (unique.length > 16) return { error: "too_many_active_write_grants" };
  }
  if (CODEX_TASK_BRIDGE_MODE === "worker") {
    return {
      working_relative_path: workspace.working_relative_path || "",
      relative_write_prefixes: unique.map((entry) => entry.path),
      sandbox_mode: unique.length ? "workspace-write" : "read-only",
      grant_refs: unique.map((entry) => entry.grant_id),
      lease_expires_at: unique.length ? unique.map((entry) => entry.expires_at).sort()[0] : null,
      authorized_at: authorizedAtDate.toISOString(),
    };
  }
  return unique.length
    ? {
      cwd: unique[0].path,
      sandbox_mode: "workspace-write",
      writable_roots: unique.map((entry) => entry.path),
      grant_refs: unique.map((entry) => entry.grant_id),
      lease_expires_at: unique.map((entry) => entry.expires_at).sort()[0],
      authorized_at: authorizedAtDate.toISOString(),
    }
    : {
      cwd: workspace.path,
      sandbox_mode: "read-only",
      writable_roots: [],
      grant_refs: [],
      lease_expires_at: null,
      authorized_at: authorizedAtDate.toISOString(),
    };
}
function revalidateCodexTurnGrantSnapshot(item, workspace, access) {
  const now = new Date();
  const refs = Array.isArray(access?.grant_refs) ? access.grant_refs : [];
  if (!refs.length) return { ok: true, authorized_at: now.toISOString() };
  const allowedApprovers = store.codexWorkspaceAllowedApprovers();
  const current = new Map(store.codexWorkspaceWriteGrants(item.id, { active_only: true, now })
    .map((row) => [row.id, row]));
  const registry = codexWorkspaceRegistryState().registry;
  if (!registry) return { error: "workspace_registry_unavailable" };
  for (const grantId of refs) {
    const row = current.get(grantId);
    if (!row) return { error: "workspace_write_authorization_changed" };
    const decision = evaluateWriteGrant(canonicalWriteGrant(row), {
      workspace_id: workspace.workspace_id,
      workspace_revision: workspace.mapping_revision,
      workspace_root_fingerprint: workspace.root_fingerprint,
      project_id: item.project_id,
      item_id: item.id,
      relative_path: row.relative_prefix,
      path_style: workspace.path_style,
      allowed_approvers: allowedApprovers,
    }, { now });
    if (!decision.allowed || !registry.checkWritePrefixes(workspace.workspace_id, [row.relative_prefix]).ok) {
      return { error: "workspace_write_authorization_changed" };
    }
  }
  return { ok: true, authorized_at: now.toISOString() };
}
async function codexTaskCapabilities({ item, account } = {}) {
  const catalog = await codexTaskModelCatalog();
  const worker = CODEX_TASK_BRIDGE_MODE === "worker" ? await codexDedicatedWorkerHealth() : null;
  const workspaceRegistry = publicCodexWorkspaceRegistry({ item, account });
  const preferredModel = preferredCodexModelSlug(catalog.models, CODEX_TASK_PREFERRED_MODEL);
  const selected = preferredModel
    ? resolveCodexModelSelection(catalog.models, {
      preferredModel,
      preferredEffort: CODEX_TASK_PREFERRED_EFFORT,
    })
    : { ok: false, error: "codex_required_model_unavailable" };
  const modelOptions = catalog.models.filter((entry) => !entry.hidden).map((entry) => entry.slug);
  const defaultModel = selected.ok ? selected.model : modelOptions[0];
  const defaultEntry = catalog.models.find((entry) => entry.slug === defaultModel);
  const effortOptions = (defaultEntry?.reasoning_efforts || []).map((entry) => entry.id);
  return {
    ok: true,
    defaults: {
      model: defaultModel,
      effort: selected.ok ? selected.effort : (defaultEntry?.default_reasoning_effort || effortOptions[0] || null),
      service_tier: CODEX_TASK_DEFAULT_SERVICE_TIER,
      workspace_id: null,
    },
    model_options: modelOptions,
    effort_options: effortOptions,
    service_tier_options: CODEX_TASK_SERVICE_TIER_OPTIONS,
    model_catalog: catalog.models,
    model_catalog_source: catalog.source,
    model_catalog_fetched_at: catalog.fetched_at,
    model_catalog_error: catalog.error || null,
    workspace_registry: workspaceRegistry,
    dedicated_codex_home_configured: worker ? worker.codex_home_ready === true : CODEX_TASK_DEDICATED_HOME_CONFIGURED,
    dedicated_codex_profile_safe: worker ? worker.codex_home_ready === true : codexDedicatedProfileReady(),
    dedicated_worker: worker ? {
      configured: worker.configured === true,
      ready: worker.ready === true,
      release: worker.release || null,
      registry_revision_match: worker.registry_revision_match === true,
    } : null,
    attachments: {
      local_image: true,
      arbitrary_file: true, // 2026-07-03 owner 지시로 정책 전환 — allowlist 파일을 로컬 저장 + 경로 참조
      max_image_bytes: CODEX_TASK_IMAGE_MAX,
      max_file_bytes: CODEX_TASK_FILE_MAX,
      file_exts: [...CODEX_TASK_FILE_EXTS].sort(),
      note: "Attachments are represented in the browser by item-bound opaque IDs; host paths remain server-only.",
    },
    skills: CODEX_TASK_BRIDGE_MODE === "worker"
      ? []
      : listCodexSkills().map(({ name, description }) => ({ name, description })),
  };
}
async function normalizeCodexTaskSelection(model, effort, modelSelectionOrigin = null) {
  const selectionOrigin = String(modelSelectionOrigin || (model ? "explicit" : "auto")).trim();
  if (!new Set(["auto", "explicit"]).has(selectionOrigin)) {
    return { ok: false, error: "codex_model_selection_origin_invalid" };
  }
  const catalog = await codexTaskModelCatalog();
  const preferredModel = preferredCodexModelSlug(catalog.models, CODEX_TASK_PREFERRED_MODEL);
  if (selectionOrigin === "auto" && !preferredModel) {
    return {
      ok: false,
      error: "codex_required_model_unavailable",
      model_options: catalog.models.filter((entry) => !entry.hidden).map((entry) => entry.slug),
    };
  }
  const selection = resolveCodexModelSelection(catalog.models, {
    model: selectionOrigin === "auto" ? null : model,
    effort,
    preferredModel,
    preferredEffort: CODEX_TASK_PREFERRED_EFFORT,
  });
  if (selection.ok) return { ...selection, selection_origin: selectionOrigin };
  return {
    ...selection,
    model_options: catalog.models.filter((entry) => !entry.hidden).map((entry) => entry.slug),
  };
}
function normalizeCodexTaskServiceTier(value) {
  const tier = String(value || "").trim().toLowerCase();
  return CODEX_TASK_SERVICE_TIER_OPTIONS.includes(tier) ? tier : CODEX_TASK_DEFAULT_SERVICE_TIER;
}
function mentionedCodexSkills(text) {
  const skills = listCodexSkills();
  const byName = new Map(skills.map((s) => [s.name, s]));
  const picked = new Map();
  const re = /(^|\s)[$/]([A-Za-z0-9_.:-]{2,})/g;
  for (const m of String(text || "").matchAll(re)) {
    const name = m[2];
    const skill = byName.get(name) || skills.find((s) => s.name.endsWith(`:${name}`));
    if (skill) picked.set(skill.name, skill);
    if (picked.size >= 8) break;
  }
  return [...picked.values()];
}
function safeAttachmentFilename(name) {
  const base = basename(String(name || "image")).replace(/[<>:"/\\|?*\x00-\x1F]+/g, "_").replace(/\s+/g, " ").trim();
  return (base || "image").slice(0, 120);
}
function codexTaskAttachmentDir(itemId) {
  const safeId = String(itemId || "unknown").replace(/[^A-Za-z0-9_.-]+/g, "_").slice(0, 80) || "unknown";
  if (CODEX_TASK_BRIDGE_MODE === "worker" && !assertCodexPayloadOwnerReady()) return null;
  try {
    const rootLink = lstatSync(CODEX_TASK_ATTACHMENT_ROOT, { bigint: true });
    const realRoot = realpathSync(CODEX_TASK_ATTACHMENT_ROOT);
    const rootIdentity = filesystemIdentity(statSync(realRoot, { bigint: true }));
    if (!rootLink.isDirectory() || rootLink.isSymbolicLink() || !rootIdentity) return null;
    const dir = resolve(realRoot, safeId);
    if (!isInside(realRoot, dir)) return null;
    mkdirSync(dir, { recursive: true });
    const realDir = realpathSync(dir);
    const expected = resolve(realRoot, safeId);
    const dirStat = lstatSync(dir);
    if (dirStat.isSymbolicLink()
      || !dirStat.isDirectory()
      || !isRealFilesystemPathInside(realRoot, realDir)
      || !isRealFilesystemPathInside(expected, realDir)
      || !isRealFilesystemPathInside(realDir, expected)) return null;
    return realDir;
  } catch {
    return null;
  }
}
// ── 대화 첨부 저장 규칙 구현(CHAT_ATTACHMENT_STORAGE_V0, v1 contract) ──────────────
function readChatAttachManifest(dir) {
  const manifestPath = join(dir, CHAT_ATTACH_MANIFEST);
  if (!existsSync(manifestPath)) return null;
  const fileStat = lstatSync(manifestPath);
  const realDir = realpathSync(dir);
  const realManifest = realpathSync(manifestPath);
  if (!fileStat.isFile()
    || fileStat.isSymbolicLink()
    || (Number.isSafeInteger(fileStat.nlink) && fileStat.nlink !== 1)
    || !isRealFilesystemPathInside(realDir, realManifest)) {
    const error = new Error("attachment_manifest_unsafe");
    error.code = "attachment_manifest_unsafe";
    throw error;
  }
  return parseAttachmentManifestJson(readFileSync(manifestPath, "utf8"), { maxBytes: CODEX_TASK_FILE_MAX });
}
// service-owned item directory만 사용한다. 과제 제목이나 브라우저 경로는 저장 경계가 아니다.
function resolveChatAttachmentDir(item) {
  return { dir: codexTaskAttachmentDir(item?.id), storage: "service" };
}
// 실제 저장명은 opaque ID다. 원본명은 manifest의 표시 메타데이터로만 보존한다.
function writeAttachmentFileExclusive(dir, storedName, bytes) {
  const target = resolve(dir, storedName);
  if (!isInside(dir, target)) return { error: "unsafe_attachment_path" };
  let fd = null;
  try {
    fd = openSync(target, "wx", 0o600);
    writeFileSync(fd, bytes);
    fsyncSync(fd);
    closeSync(fd);
    fd = null;
    const fileStat = lstatSync(target);
    const realDir = realpathSync(dir);
    const realTarget = realpathSync(target);
    if (!fileStat.isFile()
      || fileStat.isSymbolicLink()
      || (Number.isSafeInteger(fileStat.nlink) && fileStat.nlink !== 1)
      || fileStat.size !== bytes.length
      || !isRealFilesystemPathInside(realDir, realTarget)) {
      throw new Error("unsafe_attachment_path");
    }
    return { ok: true, target: realTarget };
  } catch (error) {
    if (fd !== null) try { closeSync(fd); } catch {}
    try { if (existsSync(target)) unlinkSync(target); } catch {}
    return { error: error?.code === "EEXIST" ? "attachment_collision" : "unsafe_attachment_path" };
  }
}
function appendChatAttachManifest(dir, item, fileRec) {
  const path = join(dir, CHAT_ATTACH_MANIFEST);
  const cur = readChatAttachManifest(dir) || createAttachmentManifest({ item_id: item.id });
  const next = appendAttachmentManifestRecord(cur, fileRec, { maxBytes: CODEX_TASK_FILE_MAX });
  const tmp = `${path}.${randomUUID()}.tmp`;
  let fd = null;
  try {
    fd = openSync(tmp, "wx", 0o600);
    writeFileSync(fd, `${JSON.stringify(next, null, 2)}\n`);
    fsyncSync(fd);
    closeSync(fd);
    fd = null;
    renameSync(tmp, path);
    return next;
  } finally {
    if (fd !== null) try { closeSync(fd); } catch {}
    try { if (existsSync(tmp)) unlinkSync(tmp); } catch {}
  }
}
async function resolveCodexAttachments(item, attachments) {
  if (attachments == null) return { ok: true, localImages: [], localFiles: [], projectionAttachments: [] };
  if (!Array.isArray(attachments) || attachments.length > 8) return { ok: false, error: "attachments_invalid" };
  const rows = attachments;
  if (!rows.length) return { ok: true, localImages: [], localFiles: [], projectionAttachments: [] };
  const resolvedDir = resolveChatAttachmentDir(item);
  if (!resolvedDir?.dir) return { ok: false, error: "attachment_directory_unavailable" };
  let manifest;
  try { manifest = readChatAttachManifest(resolvedDir.dir); }
  catch (error) { return { ok: false, error: error?.code || "attachment_manifest_invalid" }; }
  if (!manifest) return { ok: false, error: "attachment_manifest_missing" };
  const localImages = [];
  const localFiles = [];
  const projectionAttachments = [];
  const seen = new Set();
  for (const reference of rows) {
    const result = await resolveAttachment({
      itemDir: resolvedDir.dir,
      itemId: item.id,
      manifest,
      reference,
      maxBytes: CODEX_TASK_FILE_MAX,
    });
    if (!result.ok) return result;
    if (seen.has(result.attachment.attachment_id)) return { ok: false, error: "attachment_duplicate" };
    seen.add(result.attachment.attachment_id);
    if (result.attachment.type === "localImage") localImages.push({ path: result.internal.path });
    else localFiles.push({ name: result.attachment.name, path: result.internal.path });
    projectionAttachments.push(Object.freeze({
      attachment_id: result.attachment.attachment_id,
      name: result.attachment.name,
      size: result.internal.size,
      sha256: result.internal.sha256,
      type: result.internal.type,
      source_path: result.internal.path,
    }));
  }
  return { ok: true, localImages, localFiles, projectionAttachments };
}

let codexMessagePayloadStorePromise = null;
async function codexMessagePayloadStore() {
  if (!codexMessagePayloadStorePromise) {
    const ownerRoot = CODEX_TASK_MESSAGE_PAYLOAD_ROOT_OVERRIDE
      ? resolve(CODEX_TASK_MESSAGE_PAYLOAD_ROOT_OVERRIDE)
      : (CODEX_TASK_BRIDGE_MODE === "worker" || DB_IS_DEFAULT
        ? CODEX_TASK_MESSAGE_PAYLOAD_DEFAULT_ROOT
        : resolve(dirname(DB_PATH), "codex-message-payloads"));
    if (CODEX_TASK_BRIDGE_MODE === "worker" && !assertCodexPayloadOwnerReady()) {
      throw new Error("codex_payload_owner_unready");
    }
    mkdirSync(ownerRoot, { recursive: true });
    codexMessagePayloadStorePromise = createCodexMessagePayloadStore({
      root: ownerRoot,
      maxBytes: Math.max(CODEX_TASK_MESSAGE_MAX, 200_000),
    });
  }
  return codexMessagePayloadStorePromise;
}
async function appendCodexTaskPayloadMessage(input) {
  const payloadStore = await codexMessagePayloadStore();
  const payload = await payloadStore.writeMessagePayload({
    itemId: input.item_id,
    role: input.role,
    text: String(input.text ?? ""),
  });
  const stored = store.appendCodexTaskMessage({
    ...input,
    text: payload.payload_ref,
    payload_ref: payload.payload_ref,
    payload_byte_length: payload.byte_length,
    payload_sha256: payload.sha256,
    data_label: "meta",
  });
  if (stored.error) throw new Error(`codex_message_pointer_write_failed:${stored.error}`);
  return stored;
}
async function publicCodexTaskMessages(itemId) {
  const rows = store.codexTaskMessages(itemId);
  const payloadStore = await codexMessagePayloadStore();
  return Promise.all(rows.map(async (row) => {
    const publicRow = {
      id: row.id,
      at: row.at,
      role: row.role,
      actor_ref: row.actor_ref,
      mode: row.mode,
    };
    if (!row.payload_ref) {
      return { ...publicRow, text: "[legacy message payload hidden]", payload_unavailable: true };
    }
    const resolved = await payloadStore.resolveAuthorizedMessagePayload({
      itemId,
      payloadRef: row.payload_ref,
    });
    const payload = resolved.ok ? resolved.payload : null;
    if (!payload
      || payload.role !== row.role
      || payload.byte_length !== row.payload_byte_length
      || payload.sha256 !== row.payload_sha256) {
      return { ...publicRow, text: "[message payload unavailable]", payload_unavailable: true };
    }
    return { ...publicRow, text: payload.text };
  }));
}

async function codexTaskState(item, extra = {}, account = null) {
  const binding = store.codexTaskBinding(item.id) ?? null;
  const registry = publicCodexWorkspaceRegistry({ item, account });
  const workspace = binding?.workspace_id
    ? registry.workspaces.find((row) => row.workspace_id === binding.workspace_id) || null
    : null;
  const writeGrants = binding ? publicActiveWriteGrants(item) : [];
  return {
    ok: true,
    mode: CODEX_TASK_BRIDGE_MODE,
    bridge: CODEX_TASK_BRIDGE_VERSION,
    item: publicCodexItem(item),
    binding: publicCodexBinding(binding),
    workspace,
    workspace_access: CODEX_TASK_BRIDGE_MODE === "worker"
      ? "read-only"
      : (writeGrants.length ? "write-approved" : "read-only"),
    write_grants: writeGrants,
    messages: await publicCodexTaskMessages(item.id),
    full_access: false,
    ...extra,
  };
}

function appendWorkLifecycleEvent({ actor, item, from, to, kind, note = null, used_refs = ["items"] } = {}) {
  if (!item?.id || !kind) return;
  store.appendEvent({
    actor_ref: actor,
    actor_kind: "human",
    kind,
    item_ref: item.id,
    from,
    to,
    project_ref: item.project_id,
    used_refs,
    data_label: "real",
    note,
  });
}

function afterWorkStarted({ actor, item, from, to } = {}) {
  if (!item?.id || from !== "open" || to !== "doing") return;
  appendWorkLifecycleEvent({
    actor,
    item,
    from,
    to,
    kind: "work_started",
    note: "source_surface=erp;trigger=item_status",
  });
}

function afterWorkCompleted({ actor, accountId = null, item, from, to } = {}) {
  if (!item?.id || to !== "done" || from === "done") return null;
  const binding = store.codexTaskBinding(item.id);
  // 5필드 계약: 결정적 필드(입력 포인터·집계키)는 완료 즉시 기록, LLM 초안은 아래 훅이 보강(needs_backfill=1 시작).
  const clog = store.logCompletion(item, { completed_by: actor });
  const used_refs = ["items", "completion_log"];
  const noteParts = ["source_surface=erp", "trigger=item_status"];
  if (clog?.id) noteParts.push(`completion_log_id=${clog.id}`);
  if (binding?.thread_id) {
    used_refs.push("codex_thread_binding");
    noteParts.push("codex_thread_open=1");
  }
  appendWorkLifecycleEvent({
    actor,
    item,
    from,
    to,
    kind: "work_completed",
    used_refs,
    note: noteParts.join(";"),
  });
  (async () => {
    const workSession = accountId && erpMcp
      ? erpMcp.completionPacket({ accountId, itemId: item.id })
      : null;
    let msgs = [];
    let latestMsg = null;
    const hookUsedRefs = () => {
      const refs = ["completion_log"];
      if (binding?.thread_id) refs.push("codex_thread_binding");
      if (msgs.length) refs.push("codex_thread_message");
      return refs;
    };
    const hookNote = (phase, proposal = null) => [
      phase ? `phase=${phase}` : null,
      clog?.id ? `completion_log_id=${clog.id}` : null,
      proposal?.id ? `proposal_id=${proposal.id}` : null,
      binding?.thread_id ? "codex_thread_open=1" : null,
      latestMsg?.id ? `codex_last_message_id=${latestMsg.id}` : null,
    ].filter(Boolean).join(";") || null;
    try {
      if (workSession) {
        if (clog?.id) store.updateCompletionLog(clog.id, {
          summary: workSession.summary,
          knowledge: {
            note: workSession.knowledge,
            outputs: workSession.outputs,
            next_actions: workSession.next_actions,
            artifact_ids: workSession.artifact_ids,
            work_session_id: workSession.work_session_id,
          },
          verification: workSession.verification,
          stop_conditions: workSession.stop_conditions,
          request_kind: workSession.request_kind,
          data_label: "ai_draft",
          needs_backfill: 0,
        });
        const proposal = store.createProposal({
          source: "erp_mcp_work_session",
          kind: "completion_digest",
          target_ref: item.id,
          summary: workSession.summary,
          payload: {
            item_id: item.id,
            item_title: item.title ?? "",
            project_id: item.project_id ?? null,
            assignee_ref: item.assignee_ref ?? null,
            work_type: item.work_type ?? null,
            completion_criteria: item.completion_criteria ?? null,
            result: item.result ?? null,
            log_ref: item.log_ref ?? null,
            work_session_id: workSession.work_session_id,
            summary: workSession.summary,
            next_actions: workSession.next_actions,
            knowledge: workSession.knowledge,
            verification: workSession.verification ?? "",
            stop_conditions: workSession.stop_conditions,
            request_kind: workSession.request_kind ?? "",
            artifact_ids: workSession.artifact_ids,
          },
          used_refs: ["items", "erp_mcp_work_session", "erp_mcp_artifact"],
          data_label: "real",
        });
        store.appendEvent({
          actor_ref: "completion_hook",
          actor_kind: "system",
          kind: "completion_digest",
          item_ref: item.id,
          project_ref: item.project_id,
          used_refs: ["ai_proposal", "completion_log", "erp_mcp_work_session"],
          data_label: "real",
          note: [
            "phase=mcp_work_session",
            clog?.id ? `completion_log_id=${clog.id}` : null,
            proposal?.id ? `proposal_id=${proposal.id}` : null,
            `work_session_id=${workSession.work_session_id}`,
          ].filter(Boolean).join(";"),
        });
        return;
      }
      msgs = await publicCodexTaskMessages(item.id);
      if (!msgs.length) {
        // 대화 없음: 결정적 필드만 착지(needs_backfill=1 유지). 침묵 대신 감사 이벤트로 부분 캡처를 표시.
        store.appendEvent({
          actor_ref: "completion_hook",
          actor_kind: "system",
          kind: "five_field_partial",
          item_ref: item.id,
          project_ref: item.project_id,
          to: "no_thread",
          used_refs: hookUsedRefs(),
          data_label: "meta",
          note: hookNote("no_thread"),
        });
        return;
      }
      latestMsg = msgs[msgs.length - 1] ?? null;
      const provider = process.env.ERP_CHAT_PROVIDER || "stub";
      if (provider !== "ollama") {
        store.appendEvent({
          actor_ref: "completion_hook",
          actor_kind: "system",
          kind: "completion_hook_skipped",
          item_ref: item.id,
          project_ref: item.project_id,
          to: "llm_unavailable",
          used_refs: hookUsedRefs(),
          data_label: "meta",
          note: hookNote("llm_unavailable"),
        });
        return;
      }
      const digest = await summarizeCompletion(item, msgs, { provider });
      if (!digest.summary && !(digest.next_actions || []).length) {
        store.appendEvent({
          actor_ref: "completion_hook",
          actor_kind: "system",
          kind: "completion_hook_skipped",
          item_ref: item.id,
          project_ref: item.project_id,
          to: digest.reason || "empty_digest",
          used_refs: hookUsedRefs(),
          data_label: "meta",
          note: hookNote(digest.reason || "empty_digest"),
        });
        return;
      }
      // needs_backfill 해제는 5필드 실내용이 하나라도 있을 때만 — next_actions 만 채운 퇴화 응답이 '보강 완료'로 위장하는 것 방지.
      const hasFiveField = Boolean(digest.summary || digest.knowledge || digest.verification || (digest.stop_conditions ?? []).length);
      if (clog?.id) store.updateCompletionLog(clog.id, {
        summary: digest.summary,
        knowledge: digest.knowledge,
        verification: digest.verification,
        stop_conditions: digest.stop_conditions,
        request_kind: digest.request_kind, // 빈/무효 슬러그면 store 가 결정적 베이스 유지
        data_label: hasFiveField ? "ai_draft" : undefined, // 초안 즉시 착지(승인 대기 큐 금지 — ladder packet stop_condition)
        needs_backfill: hasFiveField ? 0 : 1,
      });
      const proposal = store.createProposal({
        source: "completion_hook", kind: "completion_digest", target_ref: item.id,
        summary: digest.summary || `${item.title ?? item.id} 완료`,
        payload: {
          item_id: item.id,
          item_title: item.title ?? "",
          project_id: item.project_id ?? null,
          assignee_ref: item.assignee_ref ?? null,
          work_type: item.work_type ?? null,
          completion_criteria: item.completion_criteria ?? null,
          result: item.result ?? null,
          log_ref: item.log_ref ?? null,
          codex_thread_open: !!binding?.thread_id,
          codex_last_message: latestMsg ? { id: latestMsg.id ?? null, role: latestMsg.role ?? null, at: latestMsg.at ?? null } : null,
          summary: digest.summary,
          next_actions: digest.next_actions,
          knowledge: digest.knowledge,
          verification: digest.verification ?? "",
          stop_conditions: digest.stop_conditions ?? [],
          request_kind: digest.request_kind ?? "",
        },
        used_refs: ["items", "codex_thread_message"], data_label: "real",
      });
      store.appendEvent({
        actor_ref: "completion_hook",
        actor_kind: "system",
        kind: "completion_digest",
        item_ref: item.id,
        project_ref: item.project_id,
        used_refs: ["ai_proposal", "completion_log", "codex_thread_message"],
        data_label: "real",
        note: hookNote("digest_created", proposal),
      });
    } catch (e) {
      store.appendEvent({
        actor_ref: "completion_hook",
        actor_kind: "system",
        kind: "completion_hook_failed",
        item_ref: item.id,
        project_ref: item.project_id,
        to: String(e?.message || e || "hook_error").slice(0, 200),
        used_refs: hookUsedRefs(),
        data_label: "meta",
        note: hookNote("hook_error"),
      });
    }
  })();
  return clog;
}

async function codexTaskErrorPayload(item, error) {
  return codexTaskState(item, {
    ok: false,
    error: "codex_task_bridge_failed",
    detail: cleanCodexHostError(error, "codex_error", 1000),
  });
}

// 슬라이스 C(2026-07-04): Codex 스레드에 출처 포인터+과제 지식 top-N 주입 — "사람이 복붙으로 나르는" 컨텍스트 제거.
// 적대 리뷰 must_fix 반영: 전수 스캔(실측 ~5초 동기 블록) 금지 — 이름 프리필터 고속 변형(ms급)만 사용.
// 캐시: 성공 10분 / 빈 결과 60초(스캔 실패·부분쓰기 레이스가 10분간 주입 공백으로 굳는 것 방지).
const _knowledgeRefsCache = new Map(); // project_id -> { at:ms, refs:[] }
function enrichItemForCodex(item) {
  if (!item?.id) return item;
  try { item.input_refs = composeInputRefs(item); } catch { item.input_refs = []; }
  try {
    const pid = String(item.project_id ?? "").trim();
    if (pid) {
      const cached = _knowledgeRefsCache.get(pid);
      const ttl = cached?.refs?.length ? 600000 : 60000;
      const fresh = cached && Date.now() - cached.at < ttl;
      const refs = fresh ? cached.refs : listProjectKnowledgeRefsFast(pid, { knowledgeRoot: KNOWLEDGE_INDEX_ROOT });
      if (!fresh) _knowledgeRefsCache.set(pid, { at: Date.now(), refs });
      item.knowledge_refs = matchingKnowledgeRefs([item.title, item.work_type].filter(Boolean).join(" "), refs, { maxMatches: 3 });
    }
  } catch { item.knowledge_refs = []; }
  return item;
}

async function runConfiguredCodexTaskTurn({
  item,
  workspace,
  access,
  threadRef = null,
  userMessage = "",
  initial,
  timeoutMs,
  model,
  modelSelectionOrigin = "explicit",
  effort,
  serviceTier,
  skills = [],
  attachmentContext = { localImages: [], localFiles: [], projectionAttachments: [] },
  signal = null,
}) {
  if (CODEX_TASK_BRIDGE_MODE === "worker") {
    const operationAttestation = await codexDedicatedWorkerOperationAttestation();
    const health = operationAttestation.health;
    if (!health.ready) throw new Error(health.error || "codex_worker_unavailable");
    const relativeWritePrefixes = access?.relative_write_prefixes || [];
    if (relativeWritePrefixes.length) throw new Error("codex_worker_write_grant_not_supported");
    const projection = initial === true ? null : await materializeCodexTurnProjection({
      projectionRoot: CODEX_TASK_TURN_PROJECTION_ROOT,
      itemId: item.id,
      projectId: item.project_id,
      workspaceId: workspace.workspace_id,
      workspaceRevision: workspace.mapping_revision,
      workspaceRootFingerprint: workspace.root_fingerprint,
      attachments: attachmentContext.projectionAttachments || [],
    });
    const projectionReceipt = projection ? publicCodexTurnProjectionReceipt(projection) : null;
    try {
      const result = await codexDedicatedWorkerClient().turn({
        workspace_id: workspace.workspace_id,
        authorization: workspace.authorization,
        working_relative_path: access?.working_relative_path || workspace.working_relative_path || "",
        relative_write_prefixes: [],
        expected_workspace_revision: workspace.mapping_revision,
        expected_root_fingerprint: workspace.root_fingerprint,
        item: publicCodexItem(item),
        user_message: userMessage,
        initial: initial === true,
        thread_ref: threadRef,
        model,
        model_selection_origin: modelSelectionOrigin,
        effort,
        service_tier: serviceTier,
        timeout_ms: timeoutMs,
        projection,
      }, {
        signal,
        timeoutMs: Math.min(310_000, timeoutMs + 10_000),
        channel: operationAttestation.channel,
      });
      const postHealth = await codexDedicatedWorkerHealth({ refresh: true });
      if (!postHealth.ready || postHealth.instance_revision !== health.instance_revision) {
        throw new Error("codex_worker_turn_attestation_mismatch");
      }
      const turnSelection = verifyCodexWorkerTurnSelection(result, {
        requestedModel: model,
        selectionOrigin: modelSelectionOrigin,
        requestedEffort: effort,
      });
      if (typeof result.thread_ref !== "string" || !result.thread_ref.startsWith("dwr2.")
          || result.workspace_id !== workspace.workspace_id
          || result.workspace_revision !== workspace.mapping_revision
          || !turnSelection.ok
          || result.effective_access !== "read-only"
          || JSON.stringify(result.relative_write_prefixes || []) !== JSON.stringify([])
          || (projectionReceipt && result.projection?.projection_revision !== projectionReceipt.projection_revision)) {
        throw new Error("codex_worker_response_mismatch");
      }
      return {
        ok: true,
        mode: "worker",
        created: result.created === true,
        threadId: result.thread_ref,
        text: String(result.text || ""),
        effectiveModel: turnSelection.effectiveModel,
        effectiveEffort: turnSelection.effectiveEffort,
        modelFallback: turnSelection.modelFallback,
        effortFallback: turnSelection.effortFallback,
        projectionReceipt,
      };
    } finally {
      if (projection) {
        await removeCodexTurnProjection({
          projectionRoot: CODEX_TASK_TURN_PROJECTION_ROOT,
          descriptor: projection,
        });
      }
    }
  }
  const result = await runCodexTaskTurn({
    mode: CODEX_TASK_BRIDGE_MODE,
    threadId: threadRef,
    threadTitle: store.codexThreadTitle(item),
    cwd: access.cwd,
    item,
    userMessage,
    initial,
    timeoutMs,
    model,
    effort,
    serviceTier,
    skills,
    localImages: attachmentContext.localImages,
    sandboxMode: access.sandbox_mode,
    writableRoots: access.writable_roots,
    signal,
  });
  return {
    ...result,
    effectiveModel: model,
    effectiveEffort: effort,
    modelFallback: false,
    effortFallback: false,
  };
}

async function createCodexTaskThread({
  item,
  actor,
  model,
  modelSelectionOrigin = "explicit",
  effort,
  serviceTier,
  workspace,
  signal = null,
}) {
  if (CODEX_TASK_BRIDGE_MODE !== "worker") {
    if (item?.assignee_ref) item.assignee_memory = store.memoryForInjection(item.assignee_ref, 1800, [item.title, item.project_id, item.work_type].filter(Boolean).join(" "), item.project_id); // 담당자 메모리 주입(시작 시·이 일 맥락 관련도 우선·압축 바운드·과제 격리: 현재 과제+일반만)
    enrichItemForCodex(item); // 출처 포인터+지식 참조 주입(시작 시)
  }
  const title = store.codexThreadTitle(item);
  const result = await runConfiguredCodexTaskTurn({
    item,
    workspace,
    access: CODEX_TASK_BRIDGE_MODE === "worker"
      ? { working_relative_path: workspace.working_relative_path || "", relative_write_prefixes: [], sandbox_mode: "read-only" }
      : { cwd: workspace.path, writable_roots: [], sandbox_mode: "read-only" },
    threadRef: null,
    userMessage: "",
    initial: true,
    timeoutMs: CODEX_TASK_TIMEOUT_MS,
    model,
    modelSelectionOrigin,
    effort,
    serviceTier,
    signal,
  });
  const publicResultText = cleanCodexAssistantText(result.text, CODEX_TASK_BRIDGE_MODE === "worker" ? [] : [workspace.path]);
  const up = store.upsertCodexTaskBinding({
    item_id: item.id,
    thread_id: result.threadId,
    thread_title: title,
    mode: result.mode,
    workspace_id: workspace.workspace_id,
    workspace_revision: workspace.mapping_revision,
    workspace_root_fingerprint: workspace.root_fingerprint,
  });
  if (up.error) return up;
  await appendCodexTaskPayloadMessage({
    item_id: item.id,
    thread_id: result.threadId,
    role: "system",
    text: `ERP task thread opened: ${title}`,
    actor_ref: actor,
    mode: result.mode,
  });
  if (result.text) await appendCodexTaskPayloadMessage({
    item_id: item.id,
    thread_id: result.threadId,
    role: "assistant",
    text: publicResultText,
    actor_ref: "codex",
    mode: result.mode,
  });
  store.appendEvent({
    actor_ref: actor, actor_kind: "human", kind: "codex_task_thread_open",
    item_ref: item.id, project_ref: item.project_id, to: "opened",
    used_refs: ["items", "codex_task_thread"], data_label: "meta"
  });
  return { ok: true, binding: up.binding, result: { ...result, text: publicResultText } };
}

const workflowHttpController = createWorkflowJobHttpController({
  service: reportWorkflowService,
  getCapability: reportWorkflowCapability,
  resolvePrincipal: async (req) => {
    const account = currentAccount(req);
    return account ? { accountId: account.id } : null;
  },
  canAccessProject: (req, projectCode) => canAccessProject(req, projectCode),
  isAuditAllowed: (_req, principal) => store.isAdmin(principal.accountId),
});

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = url.pathname;
  const qp = Object.fromEntries(url.searchParams.entries());
  // 작업 행위자 = 로그인 세션 사용자(없으면 익명 'anon'). event_log·created_by 출처를 실제 사용자로 기록(BE-2).
  const actor = currentAccount(req)?.username ?? "anon";
  try {
    if (!ERP_MCP_ENABLED
        && (path.startsWith("/api/mcp/") || path.startsWith("/api/integrations/mcp/"))) {
      return send(res, 404, { error: "not_found" });
    }
    // F1/BE-1: 팀 모드(계정 1개 이상)에서는 도메인 쓰기에 로그인 필수 — 익명 우회 차단.
    // 계정 0개(단독 localhost 파일럿)는 현행 전체허용(하위호환). 로그인/부트스트랩(/api/auth/*)은 예외.
    if ((req.method === "POST" || req.method === "PUT") && path.startsWith("/api/")
        && !path.startsWith("/api/auth/") && !path.startsWith("/api/mcp/")
        && store.accountCount() > 0 && !currentAccount(req)) {
      return send(res, 401, { error: "login_required" });
    }
    // 읽기도 미인증 차단(팀 모드) — '무조건 로그인해야 보임'. 랜딩에 필요한 비민감 메타데이터만 예외:
    // /api/me(정체성), /api/auth/*(로그인·가입), /api/health, /api/version, /api/lexicon·/api/modules(UI 라벨/구조).
    if (req.method === "GET" && path.startsWith("/api/")
        && !["/api/me", "/api/health", "/api/version", "/api/lexicon", "/api/modules"].includes(path)
        && !path.startsWith("/api/auth/")
        && !path.startsWith("/api/mcp/")
        && store.accountCount() > 0 && !currentAccount(req)) {
      return send(res, 401, { error: "login_required" });
    }
    if (path.startsWith("/api/codex-task/") && path !== "/api/codex-task/full-access") {
      if (store.accountCount() === 0) return send(res, 409, { error: "codex_auth_bootstrap_required" });
      if (!currentAccount(req)) return send(res, 401, { error: "login_required" });
      if (IS_RUNTIME_CHECKOUT && CODEX_TASK_BRIDGE_MODE !== "worker") {
        return send(res, 503, { error: "codex_dedicated_worker_required" });
      }
      if (CODEX_TASK_BRIDGE_MODE === "worker" && !assertCodexPayloadOwnerReady()) {
        return send(res, 503, { error: "codex_payload_owner_unready" });
      }
      if (["/api/codex-task/open", "/api/codex-task/message"].includes(path)
          && CODEX_TASK_BRIDGE_MODE === "worker"
          && !codexDedicatedWorkerConfiguration().configured) {
        return send(res, 503, { error: codexDedicatedWorkerConfiguration().error });
      }
      if (["/api/codex-task/open", "/api/codex-task/message"].includes(path)
          && !["mock", "worker"].includes(CODEX_TASK_BRIDGE_MODE) && !CODEX_TASK_DEDICATED_HOME_CONFIGURED) {
        return send(res, 503, { error: "codex_dedicated_home_required" });
      }
      if (["/api/codex-task/open", "/api/codex-task/message"].includes(path)
          && !["mock", "worker"].includes(CODEX_TASK_BRIDGE_MODE) && !codexDedicatedProfileReady()) {
        return send(res, 503, { error: "codex_dedicated_profile_unsafe" });
      }
      if (["/api/codex-task/open", "/api/codex-task/message"].includes(path)
          && CODEX_TASK_BRIDGE_MODE !== "mock" && !CODEX_TASK_TRUST_DOMAIN) {
        return send(res, 503, { error: "codex_trust_domain_required" });
      }
    }
    if (await workflowHttpController(req, res, url)) return;

    // Personal Codex integration: browser cookie manages credentials; MCP calls use
    // a distinct per-account bearer. Upload bytes travel over a one-time raw PUT,
    // never through MCP JSON/model context.
    if (path === "/api/integrations/mcp/tokens" && req.method === "GET") {
      const me = currentAccount(req);
      if (!me) return send(res, 401, { error: "login_required" });
      return send(res, 200, { tokens: erpMcp.listTokens(me.id) });
    }
    if (path === "/api/integrations/mcp/tokens" && req.method === "POST") {
      const body = await readJson(req, 16 * 1024);
      const me = currentAccount(req);
      if (!me) return send(res, 401, { error: "login_required" });
      const issued = erpMcp.issueToken({
        accountId: me.id,
        label: body.label,
        expiresInDays: body.expires_in_days ?? 30,
      });
      store.appendEvent({
        actor_ref: me.username, actor_kind: "human", kind: "mcp_token_issued",
        to: issued.token_id, used_refs: ["erp_mcp_access_token"], data_label: "meta",
      });
      return send(res, 201, issued);
    }
    if (path === "/api/integrations/mcp/tokens/revoke" && req.method === "POST") {
      const body = await readJson(req, 16 * 1024);
      const me = currentAccount(req);
      if (!me) return send(res, 401, { error: "login_required" });
      const result = erpMcp.revokeToken({ accountId: me.id, tokenId: body.token_id });
      store.appendEvent({
        actor_ref: me.username, actor_kind: "human", kind: "mcp_token_revoked",
        to: result.token_id, used_refs: ["erp_mcp_access_token"], data_label: "meta",
      });
      return send(res, 200, result);
    }
    if (path.startsWith("/api/mcp/uploads/") && req.method === "PUT") {
      const ticket = decodeURIComponent(path.slice("/api/mcp/uploads/".length));
      let result;
      try {
        const bytes = await readRawBody(req, ERP_MCP_FILE_MAX);
        result = erpMcp.commitUpload(ticket, bytes);
      } catch (error) {
        if (error?.code === "too_large" || error instanceof ErpMcpError) throw error;
        console.error("[dev-erp] mcp upload failed:", error?.code || error?.name || "unknown");
        return send(res, 500, { error: "internal" });
      }
      try {
        const owner = store.db.prepare(
          `SELECT a.username FROM erp_mcp_artifact f
           JOIN core_account a ON a.id=f.account_id WHERE f.id=?`,
        ).get(result.artifact.artifact_id);
        appendMcpAudit(owner ? { username: owner.username } : null, "artifact_upload", {
          itemId: result.artifact.item_id,
          projectId: result.artifact.project_id,
        });
      } catch (error) {
        console.error("[dev-erp] mcp upload audit failed:", error?.code || error?.name || "unknown");
      }
      return send(res, 201, result);
    }
    if (path === "/api/mcp/whoami" && req.method === "GET") {
      const account = authenticatedMcpAccount(req);
      appendMcpAudit(account, "whoami");
      return send(res, 200, erpMcp.whoami(account));
    }
    if (path === "/api/mcp/agenda" && req.method === "GET") {
      const account = authenticatedMcpAccount(req);
      const result = erpMcp.agenda(account, qp.date || "today");
      appendMcpAudit(account, "agenda");
      return send(res, 200, result);
    }
    if (path === "/api/mcp/task" && req.method === "GET") {
      const account = authenticatedMcpAccount(req);
      const result = erpMcp.taskContext(account, qp.id);
      appendMcpAudit(account, "task_context", { itemId: result.item.id, projectId: result.item.project_id });
      return send(res, 200, result);
    }
    if (path === "/api/mcp/mail" && req.method === "GET") {
      const account = authenticatedMcpAccount(req);
      const result = erpMcp.listMail(account, {
        days: qp.days,
        q: qp.q,
        direction: qp.direction,
        limit: qp.limit,
        offset: qp.offset,
      });
      appendMcpAudit(account, "mail_list");
      return send(res, 200, { rows: result });
    }
    if (path === "/api/mcp/mail/detail" && req.method === "GET") {
      const account = authenticatedMcpAccount(req);
      const result = erpMcp.mailDetail(account, qp.id, { maxChars: qp.max_chars });
      appendMcpAudit(account, "mail_detail", { projectId: result.project_id });
      return send(res, 200, result);
    }
    if (path === "/api/mcp/artifacts" && req.method === "GET") {
      const account = authenticatedMcpAccount(req);
      const result = erpMcp.listArtifacts(account, qp.item_id);
      appendMcpAudit(account, "artifact_list", { itemId: qp.item_id });
      return send(res, 200, { artifacts: result });
    }
    if (path === "/api/mcp/work-sessions" && req.method === "POST") {
      const body = await readJson(req, 128 * 1024);
      const account = authenticatedMcpAccount(req);
      const result = erpMcp.publishWorkSession(account, body);
      const item = store.itemById(result.session.item_id);
      appendMcpAudit(account, "work_session_publish", {
        itemId: result.session.item_id,
        projectId: item?.project_id ?? null,
        to: result.replayed ? "replayed" : "created",
      });
      return send(res, result.replayed ? 200 : 201, result);
    }
    if (path === "/api/mcp/uploads/prepare" && req.method === "POST") {
      const body = await readJson(req, 32 * 1024);
      const account = authenticatedMcpAccount(req);
      const result = erpMcp.prepareUpload(account, body);
      if (!result.already_uploaded) {
        result.upload_path = `/api/mcp/uploads/${encodeURIComponent(result.upload_ticket)}`;
        delete result.upload_ticket;
      }
      const item = store.itemById(body.item_id);
      appendMcpAudit(account, "artifact_upload_prepare", {
        itemId: body.item_id,
        projectId: item?.project_id ?? null,
        to: result.already_uploaded ? "deduplicated" : "prepared",
      });
      return send(res, result.already_uploaded ? 200 : 201, result);
    }
    if (path === "/api/health") {
      // liveness 는 항상 공개. counts(데이터 규모)는 미인증(팀 모드)엔 숨김 — '무조건 로그인해야 보임' 강화.
      const seeCounts = store.accountCount() === 0 || !!currentAccount(req);
      const attestation = await runtimeHealthAttestation();
      return send(res, 200, seeCounts
        ? { ok: true, schema: "dev_erp.v1", counts: store.counts(), attestation }
        : { ok: true, schema: "dev_erp.v1", attestation });
    }
    if (path === "/api/version") return send(res, 200, runtimeVersion());

    // ---------- P2b 팀: 계정·인증·관리자 ----------
    // 정체성 조회는 /api/me(클라이언트 계약). 여기서는 로그인/로그아웃/bootstrap/계정관리.
    // 첫 계정은 bootstrap 으로 관리자 생성(계정이 1개라도 있으면 차단).
    if (path === "/api/auth/login" && req.method === "POST") {
      const { username, password } = await readJson(req);
      const failKey = `${req.socket?.remoteAddress ?? "?"}|${String(username ?? "")}`;
      const waitSec = loginBlockedSec(failKey);
      if (waitSec) return send(res, 429, { error: "too_many_attempts", retry_after_sec: waitSec });
      const a = store.verifyLogin(username, password);
      if (!a) {
        noteLoginFail(failKey);
        store.appendEvent({ actor_ref: String(username ?? "unknown").slice(0, 80), actor_kind: "human", kind: "auth_login_failed", used_refs: ["auth"], data_label: "meta" });
        return send(res, 401, { error: "invalid_login" });
      }
      LOGIN_FAILS.delete(failKey);
      const token = store.createSession(a.id);
      store.appendEvent({ actor_ref: a.username, actor_kind: "human", kind: "auth_login", used_refs: ["auth"], data_label: "meta" });
      return send(res, 200, { ok: true, account: store.accountProfile(store.sessionAccount(token)) }, "application/json", { "set-cookie": sessionCookie(token, 12 * 3600) });
    }
    if (path === "/api/auth/logout" && req.method === "POST") {
      const tok = readCookie(req, SID);
      if (tok) store.deleteSession(tok);
      return send(res, 200, { ok: true }, "application/json", { "set-cookie": sessionCookie("", 0) });
    }
    if (path === "/api/auth/password" && req.method === "POST") {
      const me = currentAccount(req);
      if (!me) return send(res, 401, { error: "login_required" });
      const { current_password, new_password } = await readJson(req);
      const r = store.changeAccountPassword(me.id, { current_password, new_password });
      if (r.error) return send(res, 400, r);
      store.deleteAccountSessions(me.id);
      const token = store.createSession(me.id);
      store.appendEvent({ actor_ref: me.username, actor_kind: "human", kind: "auth_password_change", used_refs: ["auth"], data_label: "meta" });
      return send(res, 200, { ok: true, account: store.accountProfile(store.sessionAccount(token)) }, "application/json", { "set-cookie": sessionCookie(token, 12 * 3600) });
    }
    if (path === "/api/auth/bootstrap" && req.method === "POST") {
      if (store.accountCount() !== 0) return send(res, 409, { error: "already_initialized" });
      const { username, password, email, display_name } = await readJson(req);
      const r = store.createAccount({ username, password, email, display_name, roles: ["admin"] });
      if (r.error) return send(res, 400, r);
      const token = store.createSession(r.id);
      store.appendEvent({ actor_ref: username, actor_kind: "human", kind: "auth_bootstrap", used_refs: ["auth"], data_label: "meta" });
      return send(res, 200, { ok: true, account: store.accountProfile(store.sessionAccount(token)) }, "application/json", { "set-cookie": sessionCookie(token, 12 * 3600) });
    }
    // 길드원 자가 가입(회원가입). 첫 계정은 길드마스터(bootstrap)여야 하므로 accountCount>0 필요.
    // 팀 운영 기본은 닫힘. localhost 파일럿에서만 --allow-self-register 로 명시 개방.
    if (path === "/api/auth/register" && req.method === "POST") {
      if (store.accountCount() === 0) return send(res, 409, { error: "needs_bootstrap" });
      if (!ALLOW_SELF_REGISTER) return send(res, 403, { error: "self_register_disabled" });
      const { username, password, email, display_name } = await readJson(req);
      if (!username || !password) return send(res, 400, { error: "missing_fields" });
      const r = store.createAccount({ username, password, email, display_name, roles: ["member"] });
      if (r.error) return send(res, 400, r);
      const token = store.createSession(r.id);
      store.appendEvent({ actor_ref: username, actor_kind: "human", kind: "account_register", used_refs: ["auth"], data_label: "meta" });
      return send(res, 200, { ok: true, account: store.accountProfile(store.sessionAccount(token)) }, "application/json", { "set-cookie": sessionCookie(token, 12 * 3600) });
    }
    // 계정 생성/조회/수정/상태 — 관리자 전용.
    if (path === "/api/accounts" && req.method === "GET") {
      if (!requireAdmin(req)) return send(res, 403, { error: "admin_only" });
      return send(res, 200, { accounts: store.listAccounts(), roles: store.db.prepare("SELECT id,name FROM rbac_role ORDER BY id").all() });
    }
    if (path === "/api/accounts" && req.method === "POST") {
      const admin = requireAdmin(req);
      if (!admin) return send(res, 403, { error: "admin_only" });
      const { username, password, email, display_name, role } = await readJson(req);
      const r = store.createAccount({ username, password, email, display_name, roles: [role === "admin" ? "admin" : "member"] });
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: admin.username, actor_kind: "human", kind: "account_create", to: username, used_refs: ["auth"], data_label: "meta" });
      return send(res, 200, r);
    }
    if (path === "/api/accounts/update" && req.method === "POST") {
      const admin = requireAdmin(req);
      if (!admin) return send(res, 403, { error: "admin_only" });
      const { id, email, display_name, role } = await readJson(req);
      if (id === admin.id && role === "member") return send(res, 400, { error: "cannot_change_own_role" });
      const r = store.updateAccount(id, { email, display_name, role });
      return send(res, r.error ? 400 : 200, r);
    }
    if (path === "/api/accounts/password" && req.method === "POST") {
      const admin = requireAdmin(req);
      if (!admin) return send(res, 403, { error: "admin_only" });
      const { id, password } = await readJson(req);
      const r = store.setAccountPassword(id, password);
      if (r.error) return send(res, 400, r);
      store.deleteAccountSessions(id);
      store.appendEvent({ actor_ref: admin.username, actor_kind: "human", kind: "account_password_reset", item_ref: id, used_refs: ["auth"], data_label: "meta" });
      if (id === admin.id) {
        const token = store.createSession(id);
        return send(res, 200, { ok: true, account: store.accountProfile(store.sessionAccount(token)) }, "application/json", { "set-cookie": sessionCookie(token, 12 * 3600) });
      }
      return send(res, 200, r);
    }
    if (path === "/api/accounts/mailbox" && req.method === "POST") {
      const admin = requireAdmin(req);
      if (!admin) return send(res, 403, { error: "admin_only" });
      const body = await readJson(req);
      const r = store.updateAccountMailbox(body.id, body);
      if (r.error) return send(res, 400, r);
      store.appendEvent({
        actor_ref: admin.username, actor_kind: "human", kind: "account_mailbox_update",
        to: `${r.mailbox.mailbox_provider}:${r.mailbox.mailbox_enabled ? "enabled" : "disabled"}`,
        used_refs: ["auth", "mailbox_metadata"], data_label: "meta"
      });
      return send(res, 200, r);
    }
    // 메일함 해제: provider=none·비활성 + 비번 env 파일 삭제(비활성 후 잔존하던 보안 공백 제거). 메일/할일은 보존.
    if (path === "/api/accounts/mailbox/disconnect" && req.method === "POST") {
      const admin = requireAdmin(req);
      if (!admin) return send(res, 403, { error: "admin_only" });
      const body = await readJson(req);
      const before = store.listAccounts().find((a) => a.id === body.id);
      if (!before) return send(res, 400, { error: "account_not_found" });
      const oldRef = before.mailbox_env_ref || mailboxEnvRelPath(body.id);
      const r = store.updateAccountMailbox(body.id, { provider: "none", enabled: false });
      if (r.error) return send(res, 400, r);
      let envDeleted = false;
      try { const repoRoot = resolve(HERE, "..", "..", ".."); envDeleted = !!deleteMailboxEnv(repoRoot, oldRef).deleted; } catch { /* env 정리 실패가 해제를 막지 않음 */ }
      store.appendEvent({ actor_ref: admin.username, actor_kind: "human", kind: "account_mailbox_disconnect", to: `none:env_deleted=${envDeleted}`, used_refs: ["auth", "mailbox_metadata", "mailbox_env"], data_label: "meta" });
      return send(res, 200, { ok: true, env_deleted: envDeleted, mailbox: r.mailbox });
    }
    // 메일 자격증명 등록: ERP에서 이메일+비번 입력 → env 파일에 기록(DB 아님) + 메일함 활성.
    // 비밀번호는 env 파일에만 들어가고 DB/이벤트/응답엔 남기지 않는다. 수신(fetch)은 별도 수집기 프로세스가 함(서버 외부접속 0).
    if (path === "/api/accounts/mailbox/credentials" && req.method === "POST") {
      const admin = requireAdmin(req);
      if (!admin) return send(res, 403, { error: "admin_only" });
      const body = await readJson(req);
      const acct = store.listAccounts().find((a) => a.id === body.id);
      if (!acct) return send(res, 400, { error: "account_not_found" });
      const provider = String(body.provider || "hiworks").trim().toLowerCase();
      if (provider !== "hiworks") return send(res, 400, { error: "mailbox_provider_unsupported_for_credentials" }); // POP 비번 흐름은 Hiworks
      const host = String(body.host || "").trim();
      const username = String(body.username || acct.email || "").trim();
      const password = String(body.password ?? "");
      if (!host || !username || !password) return send(res, 400, { error: "mailbox_credentials_incomplete" });
      const rel = mailboxEnvRelPath(acct.id); // 파일명은 계정 id 기반(ASCII·고유) — 한글 등 username 충돌 방지
      const repoRoot = resolve(HERE, "..", "..", "..");
      const w = writeMailboxEnv(repoRoot, rel, hiworksEnvUpdates({ host, username, password, port: body.port }));
      if (w.error) return send(res, 400, { error: w.error });
      const r = store.updateAccountMailbox(body.id, { provider: "hiworks", env_ref: rel, enabled: true });
      if (r.error) return send(res, 400, r);
      store.appendEvent({
        actor_ref: admin.username, actor_kind: "human", kind: "account_mailbox_credentials_set",
        to: `hiworks:${rel}`, used_refs: ["auth", "mailbox_env"], data_label: "meta"
      }); // 비밀번호는 로그/이벤트/DB에 남기지 않음 — env 파일에만
      return send(res, 200, { ok: true, env_ref: rel, mailbox: r.mailbox });
    }
    // 메일 연결 테스트(admin): 별도 수집기 프로세스를 dry-run 으로 띄워 접속·인증만 확인(메일 미저장).
    // 웹서버는 직접 외부접속 안 함 — 자식 프로세스(수집기)가 접속하고 결과만 받아 표시.
    if (path === "/api/accounts/mailbox/test" && req.method === "POST") {
      const admin = requireAdmin(req);
      if (!admin) return send(res, 403, { error: "admin_only" });
      const { id } = await readJson(req);
      const acct = store.listAccounts().find((a) => a.id === id);
      if (!acct || !acct.mailbox_env_ref) return send(res, 400, { error: "no_mailbox_env" });
      const repoRoot = resolve(HERE, "..", "..", "..");
      try {
        const { stdout } = await execFileP(
          process.platform === "win32" ? "python" : "python3",
          ["guild_hall/gateway/mail_fetch/cli.py", "--env-file", acct.mailbox_env_ref, "--dry-run", "--limit", "3", "--once", "--json"],
          { cwd: repoRoot, timeout: 25000, maxBuffer: 4 * 1024 * 1024 },
        );
        return send(res, 200, parseMailTestResult(stdout));
      } catch (e) {
        return send(res, 200, { ok: false, error: "test_run_error", message: String(e?.message || e).slice(0, 200) });
      }
    }
    // 메일 수집(수동 버튼 + 자동 인터벌 공용). 웹서버는 직접 egress 안 함 — 자식 수집기가 fetch 후 원장→core_mail ingest.
    if (path === "/api/mail/collect" && req.method === "POST") {
      const admin = requireAdmin(req);
      if (!admin) return send(res, 403, { error: "admin_only" });
      if (isCollecting()) return send(res, 200, { ok: false, error: "already_collecting" });
      const repoRoot = resolve(HERE, "..", "..", "..");
      const r = await collectAllMailboxes(store, { repoRoot, backendRoot: BACKEND_ROOT, appDir: HERE, dbRel: DB_IS_DEFAULT ? "data/dev-erp.db" : DB_PATH, log: console.log });
      store.appendEvent({ actor_ref: admin.username, actor_kind: "human", kind: "mail_collect_manual", used_refs: ["mail", "mailbox_env"], data_label: "meta" });
      return send(res, 200, r);
    }
    if (path === "/api/accounts/readiness" && req.method === "GET") {
      if (!requireAdmin(req)) return send(res, 403, { error: "admin_only" });
      return send(res, 200, store.teamReadiness({
        target_members: intParam(qp.target_members ?? qp.target, 5, { min: 1, max: 50 }),
        today: /^\d{4}-\d{2}-\d{2}$/.test(String(qp.today ?? "")) ? String(qp.today) : todayKey(),
      }));
    }
    if (path === "/api/accounts/status" && req.method === "POST") {
      const admin = requireAdmin(req);
      if (!admin) return send(res, 403, { error: "admin_only" });
      const { id, status } = await readJson(req);
      if (id === admin.id && status === "disabled") return send(res, 400, { error: "cannot_disable_self" });
      const r = store.setAccountStatus(id, status);
      return send(res, r.error ? 400 : 200, r);
    }
    // 계정 영구 삭제(admin): 계정/세션/역할/대시보드 제거 + 비번 env 파일 삭제. 메일·할일은 보존(전 담당 라벨로 남김).
    if (path === "/api/accounts/delete" && req.method === "POST") {
      const admin = requireAdmin(req);
      if (!admin) return send(res, 403, { error: "admin_only" });
      const { id } = await readJson(req);
      if (id === admin.id) return send(res, 400, { error: "cannot_delete_self" });
      const r = store.deleteAccount(id);
      if (r.error) return send(res, 400, r);
      erpMcp?.purgeAccountCredentials(id);
      const repoRoot = resolve(HERE, "..", "..", "..");
      let envDeleted = false;
      try { envDeleted = !!deleteMailboxEnv(repoRoot, r.mailbox_env_ref || mailboxEnvRelPath(id)).deleted; } catch { /* env 정리 실패가 계정 삭제를 막지 않음 */ }
      store.appendEvent({
        actor_ref: admin.username, actor_kind: "human", kind: "account_deleted",
        to: r.username, used_refs: ["auth"], data_label: "meta"
      });
      return send(res, 200, { ok: true, env_deleted: envDeleted, mail_kept: true });
    }
    // 보기 대상(팀/사용자) 선택지: 관리자는 전체 계정, 팀원은 본인만.
    if (path === "/api/accounts/scopes") {
      const a = currentAccount(req);
      if (!a) return send(res, 200, { scopes: [], self: null, is_admin: false });
      if (store.isAdmin(a.id)) {
        const scopes = store.listAccounts().filter((x) => x.status === "active")
          .map((x) => ({ id: x.id, label: x.display_name || x.username, email: x.email || null }));
        return send(res, 200, { scopes: [{ id: "team", label: "팀 전체", email: null }, ...scopes], self: a.id, is_admin: true });
      }
      const p = store.accountProfile(a);
      return send(res, 200, { scopes: [{ id: a.id, label: p.display_name || a.username, email: p.email }], self: a.id, is_admin: false });
    }
    if (path === "/api/summary") {
      const today = todayKey();
      const weekEnd = new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10);
      const scope = requestScope(req, qp);
      return send(res, 200, { today, week_end: weekEnd, freshness: lastIngestAt(), projects: store.summary(today, weekEnd, scope.all ? {} : scope) });
    }
    if (path === "/api/items" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const input = JSON.parse(body || "{}");
      // F3: 수동 생성 시 담당 미지정이면 작성자 본인으로 백필 — '내 할 일'에 본인 일이 안 뜨는 문제 방지.
      const me = currentAccount(req);
      if (!input.assignee_ref && me) input.assignee_ref = store.accountDisplayName(me) || me.username;
      const result = store.createItem({ ...input, created_by: actor });
      if (result.error) return send(res, 400, result);
      store.appendEvent({
        actor_ref: actor, actor_kind: "human", kind: "item_create",
        item_ref: result.item.id, to: result.item.title, project_ref: result.item.project_id,
        used_refs: result.item.guide_artifact_id ? ["items", "guide"] : ["items"], data_label: "real"
      });
      return send(res, 200, result);
    }
    if (path === "/api/projects" && req.method === "POST") {
      // F7: 앱에서 임시 과제 생성(정션 미연결). 팀 모드(계정 있음)에서는 관리자만.
      if (store.accountCount() > 0 && !requireAdmin(req)) return send(res, 403, { error: "admin_only" });
      const result = store.createProject(await readJson(req));
      if (result.error) return send(res, 400, result);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "project_create", project_ref: result.project.id, to: result.project.title, used_refs: ["projects"], data_label: "real" });
      return send(res, 200, result);
    }
    if (path === "/api/projects/update" && req.method === "POST") {
      if (store.accountCount() > 0 && !requireAdmin(req)) return send(res, 403, { error: "admin_only" });
      const { id, title, health } = await readJson(req);
      const result = store.updateProject(id, { title, health });
      if (result.error) return send(res, 400, result);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "project_update", project_ref: result.project.id, to: result.project.title, used_refs: ["projects"], data_label: "real" });
      return send(res, 200, result);
    }
    if (path === "/api/projects/archive" && req.method === "POST") {
      if (store.accountCount() > 0 && !requireAdmin(req)) return send(res, 403, { error: "admin_only" });
      const { id, archived } = await readJson(req);
      const result = store.archiveProject(id, archived !== false);
      if (result.error) return send(res, 400, result);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: archived !== false ? "project_archive" : "project_unarchive", project_ref: result.id, to: result.class, used_refs: ["projects"], data_label: "real" });
      return send(res, 200, result);
    }
    if (path === "/api/throughput") return send(res, 200, store.throughput({ days: Number(qp.days) || 14, project: qp.project }));
    if (path === "/api/completions") {
      // 완료 로그/집계(할일 로그·#4 분석). 관리자=전체, 그 외=본인 것만(감시경계).
      const scope = requestScope(req, qp);
      const days = Number(qp.days) || 30;
      // 관리자=전체(assignee_any=null). 그외=본인 식별자 배열 IN 매칭(다른 스코프 경로와 동일한 scopedInClause, 빈 배열이면 1=0 fail-closed). 단일 [0] 매칭은 본인 누락+타인 누수 위험이라 폐기.
      const assignee_any = scope.all ? null : (scope.assignee_any || []);
      return send(res, 200, { stats: store.completionStats({ days, assignee_any }), log: store.completionLog({ days, assignee_any }) });
    }
    if (path === "/api/me/memory") {
      // 내 메모리 — 본인 것만 조회/편집. ref=표시명(assignee_ref 규약). 시작 시 그 담당자 메모리로 주입됨.
      const me = currentAccount(req);
      if (!me) return send(res, 401, { error: "auth_required" });
      const ref = store.accountDisplayName(me) || me.username;
      if (req.method === "POST") {
        let body = ""; for await (const chunk of req) body += chunk;
        const { content } = JSON.parse(body || "{}");
        const r = store.setAssigneeMemory(ref, content);
        return send(res, r.error ? 400 : 200, r);
      }
      return send(res, 200, { ref, content: store.getAssigneeMemory(ref), items: store.listMemoryItems(ref) });
    }
    if (path === "/api/me/memory/item" && req.method === "POST") {
      // 내 누적 메모리 항목 — 본인 것만 추가/삭제(감시경계). add: {op:'add',type,text} / delete(보관): {op:'delete',id}.
      const me = currentAccount(req);
      if (!me) return send(res, 401, { error: "auth_required" });
      const ref = store.accountDisplayName(me) || me.username;
      let body = ""; for await (const chunk of req) body += chunk;
      const { op, id, type, text, project_id } = JSON.parse(body || "{}");
      if (op === "delete") return send(res, 200, store.deleteMemoryItem(ref, id));
      if (op === "add") { const r = store.addMemoryItem(ref, { type, text, project_id }); return send(res, r.error ? 400 : 200, r); }
      return send(res, 400, { error: "bad_op" });
    }
    if (path === "/api/memory/append" && req.method === "POST") {
      // 완료 지식 → 담당자 메모리 추가. 관리자는 누구에게나, 팀원은 본인 메모리에만(남의 메모리 편집 금지).
      const me = currentAccount(req);
      if (!me) return send(res, 401, { error: "auth_required" });
      let body = ""; for await (const chunk of req) body += chunk;
      const { ref, text, project_id } = JSON.parse(body || "{}");
      const mine = store.accountDisplayName(me) || me.username;
      if (!store.isAdmin(me.id) && ref !== mine) return send(res, 403, { error: "memory_forbidden" });
      const r = store.appendAssigneeMemory(ref, text, project_id);
      return send(res, r.error ? 400 : 200, r);
    }
    if (path === "/api/items/status" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { id, status, bottleneck_reason } = JSON.parse(body || "{}");
      if (!canAccessItem(req, id)) return send(res, 403, { error: "item_forbidden" });
      const result = store.setItemStatus(id, status);
      if (result.error) return send(res, 400, result);
      // D4(S8-4): no-op 전이(done→done 등)는 이벤트 무기록 — throughput 부풀림 방지.
      if (!result.unchanged) store.appendEvent({
        actor_ref: actor, actor_kind: "human", kind: "item_status",
        item_ref: id, from: result.from, to: status, project_ref: result.project_id,
        bottleneck_reason: bottleneck_reason ?? null, used_refs: ["items"], data_label: "real"
      });
      const itemAfterStatus = store.itemById(id);
      if (status === "done" && result.from !== "done") {
        afterWorkCompleted({ actor, accountId: currentAccount(req)?.id ?? null, item: itemAfterStatus, from: result.from, to: status });
      } else if (status === "doing" && result.from !== "doing") {
        afterWorkStarted({ actor, item: itemAfterStatus, from: result.from, to: status });
      }
      return send(res, 200, result);
    }
    if (path === "/api/items/priority" && req.method === "POST") {
      // 우선순위(⭐) 지정/해제 — urgency 재사용(high=우선). 본인 접근 가능한 항목만.
      let body = ""; for await (const chunk of req) body += chunk;
      const { id, urgency } = JSON.parse(body || "{}");
      if (!canAccessItem(req, id)) return send(res, 403, { error: "item_forbidden" });
      const result = store.setItemUrgency(id, urgency);
      if (result.error) return send(res, 400, result);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "item_priority", item_ref: id, from: result.from, to: urgency, project_ref: result.project_id, used_refs: ["items"], data_label: "real" });
      return send(res, 200, result);
    }
    if (path === "/api/items/split-suggest" && req.method === "POST") {
      // S4: 로컬 LLM이 분해 '제안'만 — 자식 생성은 owner가 확인 후(/api/items). 본문 미전달, 외부 egress 없음.
      let body = ""; for await (const chunk of req) body += chunk;
      const { id } = JSON.parse(body || "{}");
      if (!canAccessItem(req, id)) return send(res, 403, { error: "item_forbidden" });
      const item = store.itemById(id);
      if (!item) return send(res, 404, { error: "item_not_found" });
      const { types, typeToParty } = PARTY_MATCH; // 시작 시 캐시(검증 허용목록과 동일 소스 — 일관)
      const provider = process.env.ERP_CHAT_PROVIDER || "stub";
      const sug = await suggestSplit(item, types, { provider });
      const sub_tasks = (sug.sub_tasks || []).map((s) => ({ ...s, party_ref: typeToParty[s.monster_type] ?? null }));
      store.appendEvent({
        actor_ref: actor, actor_kind: "ai", kind: "split_suggest",
        item_ref: id, project_ref: item.project_id, to: String(sub_tasks.length),
        used_refs: ["items", "llm"], data_label: "meta",
        note: `provider=${provider} should_split=${sug.should_split} n=${sub_tasks.length}`
      });
      return send(res, 200, { ...sug, sub_tasks });
    }
    if (path === "/api/items/assign" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { id, assignee_ref } = JSON.parse(body || "{}");
      if (!canAccessItem(req, id)) return send(res, 403, { error: "item_forbidden" });
      const result = store.setItemAssignee(id, assignee_ref);
      if (result.error) return send(res, 400, result);
      // D4(S8-4): 같은 담당 재지정 no-op 은 이벤트 무기록(배치 경로의 변화-감지 가드와 대칭).
      if (!result.unchanged) store.appendEvent({
        actor_ref: actor, actor_kind: "human", kind: "item_assign",
        item_ref: id, from: result.from, to: assignee_ref || null, project_ref: result.project_id,
        used_refs: ["items"], data_label: "real"
      });
      return send(res, 200, result);
    }
    if (path === "/api/items/update" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { id, title, due } = JSON.parse(body || "{}");
      if (!canAccessItem(req, id)) return send(res, 403, { error: "item_forbidden" });
      const patch = {};
      if (title !== undefined) patch.title = title;
      if (due !== undefined) patch.due = due;
      const result = store.updateItem(id, patch);
      if (result.error) return send(res, 400, result);
      store.appendEvent({
        actor_ref: actor, actor_kind: "human", kind: "item_edit",
        item_ref: id, to: result.item.title, project_ref: result.item.project_id,
        used_refs: ["items"], data_label: "real"
      });
      return send(res, 200, result);
    }
    // 할일 과제 변경(2026-07-07 owner): 팝업에서 AI 과제 오분류를 사람이 교정. 메일 유래면 원본 메일도 동행.
    if (path === "/api/items/project" && req.method === "POST") {
      const { id, project_id } = await readJson(req);
      if (!canAccessItem(req, id)) return send(res, 403, { error: "item_forbidden" });
      const result = store.setItemProject(id, project_id);
      if (result.error) return send(res, 400, result);
      if (!result.unchanged) store.appendEvent({
        actor_ref: actor, actor_kind: "human", kind: "item_move",
        item_ref: id, from: result.from, to: project_id, project_ref: project_id,
        used_refs: result.mail_moved ? ["items", "mail"] : ["items"], data_label: "real"
      });
      return send(res, 200, result);
    }
    if (path === "/api/items/delete" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { id, reason } = JSON.parse(body || "{}");
      if (!canAccessItem(req, id)) return send(res, 403, { error: "item_forbidden" });
      const result = store.archiveItem(id);
      if (result.error) return send(res, 400, result);
      const rsn = String(reason ?? "").trim();
      store.appendEvent({
        actor_ref: actor, actor_kind: "human", kind: "item_archive",
        item_ref: id, from: result.from, to: result.title, project_ref: result.project_id,
        note: rsn || null, used_refs: ["items"], data_label: "real"
      });
      return send(res, 200, result);
    }
    if (path === "/api/items/restore" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { id } = JSON.parse(body || "{}");
      if (!canAccessItem(req, id)) return send(res, 403, { error: "item_forbidden" });
      const result = store.restoreItem(id);
      if (result.error) return send(res, 400, result);
      store.appendEvent({
        actor_ref: actor, actor_kind: "human", kind: "item_restore",
        item_ref: id, to: result.title, project_ref: result.project_id,
        used_refs: ["items"], data_label: "real"
      });
      return send(res, 200, result);
    }
    // ---------- 줄기 v2 조작(B6): 드래그 재부착 3종 — 계약 docs/slices/B6-STEM-REATTACH-API.md ----------
    if (path === "/api/items/reanchor" && req.method === "POST") {
      const input = await readJson(req);
      if (!canAccessItem(req, input.id)) return send(res, 403, { error: "item_forbidden" });
      const r = store.reanchorItem(input.id, input, { actor_ref: actor });
      return send(res, r.error ? 400 : 200, r);
    }
    if (path === "/api/items/set-origin-occurrence" && req.method === "POST") {
      const input = await readJson(req);
      if (!canAccessItem(req, input.id)) return send(res, 403, { error: "item_forbidden" });
      const r = store.setItemOriginOccurrence(input.id, input, { actor_ref: actor });
      return send(res, r.error ? 400 : 200, r);
    }
    if (path === "/api/mail/reattach" && req.method === "POST") {
      const input = await readJson(req);
      if (!canAccessMail(req, input.mail_id)) return send(res, 403, { error: "mail_forbidden" });
      if (!canAccessItem(req, input.item_id)) return send(res, 403, { error: "item_forbidden" });
      const r = store.reattachMail(input.mail_id, input.item_id, { actor_ref: actor });
      if (r.error) return send(res, 400, r);
      // 엔진 학습 피드백(교정 영수증) — best-effort: 실패해도 교정 자체(이벤트)는 성립, 결과에 표기.
      if (!r.unchanged) {
        try {
          const project = r.item?.project_id || "P00-000_INBOX";
          const historyKey = String(input.mail_id).includes(":") ? String(input.mail_id).slice(String(input.mail_id).indexOf(":") + 1) : String(input.mail_id);
          const { appendMailReceipts } = await import("./tools/mail_receipts.mjs");
          // 주의: 영수증은 history_key 멱등이라 기존 영수증(예: thread_followup)이 있으면 skip 됨 —
          // 교정의 정본 기록은 event_log(mail_reattach)이고 영수증은 학습 피드백 best-effort.
          const receipt = appendMailReceipts({
            workmetaRoot: BACKEND_WORKMETA_ROOT, projectId: project,
            rows: [{
              receipt_key: `mailreceipt:${historyKey}:human_reattach:${input.item_id}`,
              history_key: historyKey, project_id: project, disposition: "reference_only", status: "corrected",
              handled_at: new Date().toISOString(), reason: `human_reattach:${input.item_id}`,
              source_mail_ref: String(input.mail_id), generation_rule_ref: "stem_drag", body_access: "metadata_only",
            }],
          });
          r.receipt_written = receipt?.written ?? 0;
        } catch (e) { r.receipt_written = 0; r.receipt_error = String(e?.message ?? e).slice(0, 80); }
      }
      return send(res, 200, r);
    }
    if (path === "/api/items/confirm" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const input = JSON.parse(body || "{}");
      if (!canAccessItem(req, input.id)) return send(res, 403, { error: "item_forbidden" });
      if (!String(input.assignee_ref ?? "").trim()) {
        const item = store.db.prepare("SELECT assignee_ref,suggested_assignee_ref FROM core_item WHERE id=?").get(input.id);
        const me = currentAccount(req);
        input.assignee_ref = item?.assignee_ref || item?.suggested_assignee_ref || me?.display_name || me?.username || me?.email || null;
      }
      const result = store.confirmItem(input.id, input);
      if (result.error) return send(res, 400, result);
      store.appendEvent({
        actor_ref: actor, actor_kind: "human", kind: "item_confirm",
        item_ref: result.item.id, to: result.item.work_type ?? "", project_ref: result.item.project_id,
        used_refs: ["items"], data_label: "real"
      });
      return send(res, 200, result);
    }
    if (path === "/api/items/promote" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { mail_id } = JSON.parse(body || "{}");
      if (!canAccessMail(req, mail_id)) return send(res, 403, { error: "mail_forbidden" });
      const result = store.promoteMail(mail_id, actor);
      if (result.error) return send(res, 400, result);
      store.appendEvent({
        actor_ref: actor, actor_kind: "human", kind: "item_promote",
        item_ref: result.item.id, from: mail_id, to: result.item.title,
        project_ref: result.item.project_id, used_refs: ["items", "mail"], data_label: "real"
      });
      return send(res, 200, result);
    }
    if (path === "/api/items/counts") {
      const assignee_any = viewIdentities(req, qp);
      return send(res, 200, store.itemCounts({ project: qp.project, assignee_any }));
    }
    if (path === "/api/items") {
      // 보기 대상(view=계정id|team)·mine=1 → 담당자 식별자 필터. 일반 팀원의 기본은 본인 범위.
      // 단, status=unclassified 는 팀 공용 분류 큐라 개인 담당자 필터를 걸지 않는다.
      // #8 미배정 전용뷰: unassigned=1 이면 담당자 스코프(view/mine) 미적용 — '주인 없는 일'은 팀 전체에서 본다.
      const unassigned = qp.unassigned === "1";
      const assignee_any = (qp.status === "unclassified" || unassigned) ? undefined : viewIdentities(req, qp);
      const opts = {
        project: qp.project, status: qp.status, q: qp.q,
        due_before: qp.due === "soon" ? todayKey() : undefined,
        due_before_exclusive: qp.due === "overdue" ? todayKey() : undefined,
        assignee_any, unassigned,
        limit: intParam(qp.limit, wantsPage(qp) ? 100 : 500, { min: 1, max: wantsPage(qp) ? 500 : 1000 }),
        offset: intParam(qp.offset, 0, { min: 0, max: 1_000_000 })
      };
      return send(res, 200, wantsPage(qp) ? store.itemsPage(opts) : store.items(opts));
    }
    if (path === "/api/codex-task/capabilities" && req.method === "GET") {
      const item = store.itemById(qp.item_id || qp.id);
      if (!item) return send(res, 404, { error: "item_not_found" });
      if (!canAccessItem(req, item.id)) return send(res, 403, { error: "item_forbidden" });
      return send(res, 200, await codexTaskCapabilities({ item, account: currentAccount(req) }));
    }
    // legacy 전체권한은 팀 작업실 경계와 양립하지 않으므로 영구 비활성화한다.
    if (path === "/api/codex-task/full-access" && req.method === "POST") {
      return send(res, 410, { error: "codex_full_access_disabled", use: "codex_workspace_write_grant" });
    }
    if (path === "/api/codex-task/write-grant" && req.method === "POST") {
      const admin = requireAdmin(req);
      if (!admin) return send(res, 403, { error: "admin_only" });
      if (CODEX_TASK_BRIDGE_MODE === "worker") {
        return send(res, 409, { error: "workspace_write_unsupported" });
      }
      const { item_id, relative_prefix, reason, ttl_minutes } = await readJson(req, CODEX_TASK_JSON_MAX);
      const item = store.itemById(item_id);
      if (!item) return send(res, 404, { error: "item_not_found" });
      if (!canAccessItem(req, item.id)) return send(res, 403, { error: "item_forbidden" });
      const binding = store.codexTaskBinding(item.id);
      const workspace = await resolveCodexTaskWorkspace({ binding, item, account: admin });
      if (!workspace.ok) return send(res, 409, workspace);
      const prefix = String(relative_prefix ?? "").trim();
      const staticPolicy = workspace.registry.authorizeWritePrefixes(
        workspace.workspace_id,
        [prefix],
        workspace.authorization,
      );
      if (!staticPolicy.ok) return send(res, 400, { error: staticPolicy.error });
      let resolvedPrefix;
      if (CODEX_TASK_BRIDGE_MODE === "worker") {
        try {
          resolvedPrefix = await codexDedicatedWorkerClient().resolve({
            workspace_id: workspace.workspace_id,
            authorization: workspace.authorization,
            relative_path: prefix,
          }, { timeoutMs: 10_000 });
        } catch (error) {
          return send(res, 409, { error: safeCodexWorkerError(error) });
        }
        if (resolvedPrefix.workspace_revision !== workspace.mapping_revision
            || resolvedPrefix.root_fingerprint !== workspace.root_fingerprint) {
          return send(res, 409, { error: "workspace_write_binding_mismatch" });
        }
      } else {
        resolvedPrefix = await workspace.registry.resolvePathAsync(workspace.workspace_id, prefix, { timeoutMs: 2000 });
      }
      if (!resolvedPrefix.ok) return send(res, 400, { error: resolvedPrefix.error });
      if (!resolvedPrefix.target_is_directory) return send(res, 400, { error: "write_prefix_not_directory" });
      const ttl = Math.max(1, Math.min(480, Math.trunc(Number(ttl_minutes) || 60)));
      const approvedAt = new Date();
      const result = store.approveCodexWorkspaceWrite({
        item_id: item.id,
        workspace_id: workspace.workspace_id,
        relative_prefix: prefix,
        approved_by: actor,
        reason,
        approved_at: approvedAt.toISOString(),
        expires_at: new Date(approvedAt.getTime() + ttl * 60_000).toISOString(),
      });
      if (result.error) return send(res, 400, result);
      store.appendEvent({
        actor_ref: actor, actor_kind: "human", kind: "codex_workspace_write_grant",
        item_ref: item.id, project_ref: item.project_id, to: result.grant.id,
        used_refs: ["codex_thread_binding", "codex_workspace_write_grant"], data_label: "meta",
        note: `workspace_id=${workspace.workspace_id};relative_prefix=${result.grant.relative_prefix};expires_at=${result.grant.expires_at}`,
      });
      return send(res, 200, await codexTaskState(item, { write_grant_created: true }, admin));
    }
    if (path === "/api/codex-task/write-grant/revoke" && req.method === "POST") {
      const admin = requireAdmin(req);
      if (!admin) return send(res, 403, { error: "admin_only" });
      const { grant_id } = await readJson(req, CODEX_TASK_JSON_MAX);
      const grant = store.codexWorkspaceWriteGrant(grant_id);
      if (!grant) return send(res, 404, { error: "grant_not_found" });
      if (!canAccessItem(req, grant.item_id)) return send(res, 403, { error: "item_forbidden" });
      const result = store.revokeCodexWorkspaceWriteGrant({ id: grant.id, revoked_by: actor });
      if (result.error) return send(res, 400, result);
      const active = activeCodexTurns.get(grant.item_id);
      if (active?.grant_refs?.has(grant.id)) active.controller.abort();
      store.appendEvent({
        actor_ref: actor, actor_kind: "human", kind: "codex_workspace_write_revoke",
        item_ref: grant.item_id, project_ref: grant.project_id, to: grant.id,
        used_refs: ["codex_workspace_write_grant"], data_label: "meta",
      });
      return send(res, 200, await codexTaskState(store.itemById(grant.item_id), { write_grant_revoked: true }, admin));
    }
    if (path === "/api/codex-task/attachment" && req.method === "POST") {
      const item_id = qp.item_id || qp.id;
      const item = store.itemById(item_id);
      if (!item) return send(res, 404, { error: "item_not_found" });
      if (!canAccessItem(req, item.id)) return send(res, 403, { error: "item_forbidden" });
      const filename = safeAttachmentFilename(qp.filename || "image");
      const ext = extname(filename).toLowerCase();
      if (ext === ".hwp") return send(res, 400, { error: "hwp_preprocess_required" });
      const isImage = CODEX_TASK_IMAGE_EXTS.has(ext);
      const isFile = !isImage && CODEX_TASK_FILE_EXTS.has(ext);
      if (!isImage && !isFile) return send(res, 400, { error: "unsupported_attachment_type" });
      try {
        validateAttachmentFilename(filename);
        const binding = store.codexTaskBinding(item.id);
        if (!binding) return send(res, 409, { error: "codex_thread_not_open" });
        const workspace = await resolveCodexTaskWorkspace({ binding, item, account: currentAccount(req) });
        if (!workspace.ok) return send(res, 403, { error: "codex_workspace_forbidden" });
        const bytes = await readRawBody(req, isImage ? CODEX_TASK_IMAGE_MAX : CODEX_TASK_FILE_MAX);
        if (!bytes.length) return send(res, 400, { error: "empty_body" });
        // 저장 계약 v1: Soulforge service-owned item bucket만 사용한다.
        const resolved = resolveChatAttachmentDir(item);
        if (!resolved?.dir) return send(res, 400, { error: "unsafe_attachment_dir" });
        const currentManifest = readChatAttachManifest(resolved.dir)
          || createAttachmentManifest({ item_id: item.id });
        if (currentManifest.item_id !== item.id) return send(res, 409, { error: "attachment_manifest_item_mismatch" });
        if (currentManifest.attachments.length >= CODEX_TASK_ATTACHMENT_MAX_COUNT) {
          return send(res, 413, { error: "attachment_count_limit" });
        }
        const currentBytes = currentManifest.attachments.reduce((sum, row) => sum + row.size, 0);
        if (currentBytes + bytes.length > CODEX_TASK_ATTACHMENT_TOTAL_MAX) {
          return send(res, 413, { error: "attachment_total_limit" });
        }
        const attachmentId = createOpaqueAttachmentId();
        const storedName = `${attachmentId}${ext}`;
        const sha256 = createHash("sha256").update(bytes).digest("hex");
        const record = createAttachmentManifestRecord({
          attachment_id: attachmentId,
          item_id: item.id,
          name: filename,
          stored_name: storedName,
          size: bytes.length,
          sha256,
          type: isImage ? "localImage" : "localFile",
        }, {
          maxBytes: isImage ? CODEX_TASK_IMAGE_MAX : CODEX_TASK_FILE_MAX,
        });
        const written = writeAttachmentFileExclusive(resolved.dir, storedName, bytes);
        if (!written.ok) return send(res, 409, { error: written.error });
        try {
          appendChatAttachManifest(resolved.dir, item, record);
        } catch (error) {
          try { unlinkSync(written.target); } catch {}
          throw error;
        }
        store.appendEvent({
          actor_ref: actor, actor_kind: "human", kind: isImage ? "codex_task_image_attach" : "codex_task_file_attach",
          item_ref: item.id, project_ref: item.project_id, to: record.attachment_id,
          used_refs: ["items", "codex_task_thread", isImage ? "localImage" : "localFile"], data_label: "meta"
        });
        return send(res, 200, {
          ok: true,
          attachment: publicAttachmentDescriptor(record, { maxBytes: CODEX_TASK_FILE_MAX }),
        });
      } catch (error) {
        const code = error?.code || "attachment_failed";
        const status = code === "too_large" ? 413 : (code.startsWith("attachment_") ? 400 : 500);
        return send(res, status, { error: code });
      }
    }
    if (path === "/api/codex-task/thread" && req.method === "GET") {
      const item_id = qp.item_id || qp.id;
      const item = store.itemById(item_id);
      if (!item) return send(res, 404, { error: "item_not_found" });
      if (!canAccessItem(req, item.id)) return send(res, 403, { error: "item_forbidden" });
      const binding = store.codexTaskBinding(item.id);
      if (binding) {
        const workspace = await resolveCodexTaskWorkspace({ binding, item, account: currentAccount(req) });
        if (!workspace.ok) return send(res, 403, { error: "codex_workspace_forbidden" });
      }
      return send(res, 200, await codexTaskState(item, {}, currentAccount(req)));
    }
    if (path === "/api/codex-task/open" && req.method === "POST") {
      const input = await readJson(req, CODEX_TASK_JSON_MAX);
      if (["cwd", "path", "root", "workspace_root"].some((key) => Object.hasOwn(input, key))) {
        return send(res, 400, { error: "raw_workspace_path_forbidden" });
      }
      const { item_id, model, model_selection_origin, effort, service_tier, workspace_id } = input;
      const item = store.itemById(item_id);
      if (!item) return send(res, 404, { error: "item_not_found" });
      if (!canAccessItem(req, item.id)) return send(res, 403, { error: "item_forbidden" });
      const preflight = claimCodexPreflight({ itemId: item.id, accountId: currentAccount(req).id });
      if (!preflight.ok) return sendCodexAdmissionError(res, preflight);
      try {
      const selection = await normalizeCodexTaskSelection(model, effort, model_selection_origin);
      if (!selection.ok) return send(res, 400, selection);
      const existing = store.codexTaskBinding(item.id);
      const workspace = await resolveCodexTaskWorkspace({ requestedWorkspaceId: workspace_id, binding: existing, item, account: currentAccount(req) });
      if (!workspace.ok) return send(res, 409, workspace);
      const serviceTier = normalizeCodexTaskServiceTier(service_tier);
      if (existing) return send(res, 200, await codexTaskState(item, {}, currentAccount(req)));
      const controller = new AbortController();
      preflight.release();
      const admission = claimCodexOperation({
        itemId: item.id,
        accountId: currentAccount(req).id,
        controller,
        operation: "open",
      });
      if (!admission.ok) return sendCodexAdmissionError(res, admission);
      const authorizedAt = new Date().toISOString();
      const startedAt = Date.parse(authorizedAt);
      const startedAudit = store.startCodexTurnAudit({
        item_id: item.id,
        actor_ref: actor,
        workspace_id: workspace.workspace_id,
        workspace_revision: workspace.mapping_revision,
        workspace_root_fingerprint: workspace.root_fingerprint,
        model: selection.model,
        model_selection_origin: selection.selection_origin,
        reasoning_effort: selection.effort,
        sandbox_mode: "read-only",
        grant_refs: [],
        authorized_at: authorizedAt,
      });
      if (startedAudit.error) {
        activeCodexTurns.delete(item.id);
        return send(res, 500, { error: "codex_turn_audit_start_failed" });
      }
      try {
        const created = await createCodexTaskThread({
          item,
          actor,
          model: selection.model,
          modelSelectionOrigin: selection.selection_origin,
          effort: selection.effort,
          serviceTier,
          workspace,
          signal: controller.signal,
        });
        if (created.error) {
          store.finishCodexTurnAudit({
            audit_id: startedAudit.audit.id,
            effective_model: created.result?.effectiveModel ?? null,
            outcome: "rejected",
            duration_ms: Date.now() - startedAt,
            error_code: created.error,
          });
          return send(res, 400, created);
        }
        const finishedAudit = store.finishCodexTurnAudit({
          audit_id: startedAudit.audit.id,
          thread_id: created.result.threadId,
          effective_model: created.result.effectiveModel,
          outcome: "completed",
          duration_ms: Date.now() - startedAt,
        });
        if (finishedAudit.error) return send(res, 500, { error: "codex_turn_audit_failed" });
        return send(res, 200, await codexTaskState(item, { created: true }, currentAccount(req)));
      } catch (error) {
        const audit = store.finishCodexTurnAudit({
          audit_id: startedAudit.audit.id,
          outcome: "failed",
          duration_ms: Date.now() - startedAt,
          error_code: String(error?.message || "").includes("aborted") ? "codex_turn_aborted" : "codex_turn_failed",
        });
        if (audit.error) console.error("[dev-erp] codex failed-open audit failed:", audit.error);
        const publicError = cleanCodexHostError(error, "codex_error", 1000);
        try { store.markCodexTaskError(item.id, publicError); } catch {}
        try {
          await appendCodexTaskPayloadMessage({
            item_id: item.id,
            role: "error",
            text: publicError,
            actor_ref: "server",
            mode: CODEX_TASK_BRIDGE_MODE,
          });
        } catch {}
        return send(res, 502, await codexTaskErrorPayload(item, error));
      } finally {
        if (activeCodexTurns.get(item.id)?.controller === controller) activeCodexTurns.delete(item.id);
      }
      } finally {
        preflight.release();
      }
    }
    if (path === "/api/codex-task/message" && req.method === "POST") {
      const input = await readJson(req, CODEX_TASK_JSON_MAX);
      if (["cwd", "path", "root", "workspace_root"].some((key) => Object.hasOwn(input, key))) {
        return send(res, 400, { error: "raw_workspace_path_forbidden" });
      }
      const { item_id, message, model, model_selection_origin, effort, service_tier, attachments, workspace_id } = input;
      const text = String(message ?? "").trim();
      if (!text) return send(res, 400, { error: "message_required" });
      if (Buffer.byteLength(text, "utf8") > CODEX_TASK_MESSAGE_MAX) {
        return send(res, 413, { error: "codex_message_too_large" });
      }
      const item = store.itemById(item_id);
      if (!item) return send(res, 404, { error: "item_not_found" });
      if (!canAccessItem(req, item.id)) return send(res, 403, { error: "item_forbidden" });
      const preflight = claimCodexPreflight({ itemId: item.id, accountId: currentAccount(req).id });
      if (!preflight.ok) return sendCodexAdmissionError(res, preflight);
      try {
      const selection = await normalizeCodexTaskSelection(model, effort, model_selection_origin);
      if (!selection.ok) return send(res, 400, selection);
      const binding = store.codexTaskBinding(item.id);
      if (!binding) return send(res, 409, { error: "codex_thread_not_open" });
      const workspace = await resolveCodexTaskWorkspace({ requestedWorkspaceId: workspace_id, binding, item, account: currentAccount(req) });
      if (!workspace.ok) return send(res, 409, workspace);
      const serviceTier = normalizeCodexTaskServiceTier(service_tier);
      if (item.assignee_ref) item.assignee_memory = store.memoryForInjection(item.assignee_ref, 1800, [item.title, item.project_id, item.work_type].filter(Boolean).join(" "), item.project_id); // 담당자 메모리 주입(매 턴·이 일 맥락 관련도 우선·압축 바운드·과제 격리: 현재 과제+일반만)
      enrichItemForCodex(item); // 출처 포인터+지식 참조 주입(매 턴 — 지식 스캔은 10분 캐시)
      const skills = CODEX_TASK_BRIDGE_MODE === "worker" ? [] : mentionedCodexSkills(text);
      const attachmentContext = await resolveCodexAttachments(item, attachments);
      if (!attachmentContext.ok) return send(res, 400, { error: attachmentContext.error });
      const codexText = CODEX_TASK_BRIDGE_MODE === "worker"
        ? text
        : (attachmentContext.localFiles.length
          ? `${text}\n\nServer-verified item attachments (host paths; do not echo them to the user):\n${attachmentContext.localFiles.map((file) => `- ${file.name}: ${JSON.stringify(file.path)}`).join("\n")}`
          : text);
      if (activeCodexTurns.has(item.id)) return send(res, 409, { error: "codex_turn_already_active" });
      const access = await resolveCodexTurnAccess(item, workspace);
      if (access.error) return send(res, 409, { error: access.error });
      if (activeCodexTurns.has(item.id)) return send(res, 409, { error: "codex_turn_already_active" });
      const controller = new AbortController();
      preflight.release();
      const admission = claimCodexOperation({
        itemId: item.id,
        accountId: currentAccount(req).id,
        controller,
        grantRefs: access.grant_refs,
        operation: "message",
      });
      if (!admission.ok) return sendCodexAdmissionError(res, admission);
      const revalidated = revalidateCodexTurnGrantSnapshot(item, workspace, access);
      if (!revalidated.ok || controller.signal.aborted) {
        activeCodexTurns.delete(item.id);
        return send(res, 409, { error: revalidated.error || "workspace_write_authorization_changed" });
      }
      const authorizedAt = revalidated.authorized_at;
      const startedAt = Date.parse(authorizedAt);
      const leaseMs = access.lease_expires_at ? Date.parse(access.lease_expires_at) - startedAt : CODEX_TASK_TIMEOUT_MS;
      if (access.sandbox_mode === "workspace-write"
          && (!Number.isFinite(leaseMs) || leaseMs < (CODEX_TASK_BRIDGE_MODE === "worker" ? 1000 : 1))) {
        activeCodexTurns.delete(item.id);
        return send(res, 409, { error: "workspace_write_lease_expired" });
      }
      let turnTimeoutMs = Math.max(CODEX_TASK_BRIDGE_MODE === "worker" ? 1000 : 1, Math.min(CODEX_TASK_TIMEOUT_MS, leaseMs));
      const startedAudit = store.startCodexTurnAudit({
        item_id: item.id,
        thread_id: binding.thread_id,
        actor_ref: actor,
        workspace_id: workspace.workspace_id,
        workspace_revision: workspace.mapping_revision,
        workspace_root_fingerprint: workspace.root_fingerprint,
        model: selection.model,
        model_selection_origin: selection.selection_origin,
        reasoning_effort: selection.effort,
        sandbox_mode: access.sandbox_mode,
        grant_refs: access.grant_refs,
        authorized_at: authorizedAt,
      });
      if (startedAudit.error) {
        activeCodexTurns.delete(item.id);
        return send(res, 500, { error: "codex_turn_audit_start_failed" });
      }
      try {
        await appendCodexTaskPayloadMessage({
        item_id: item.id,
        thread_id: binding?.thread_id ?? null,
        role: "user",
        text,
        actor_ref: actor,
        mode: binding?.mode ?? CODEX_TASK_BRIDGE_MODE,
        });
        if (access.lease_expires_at) {
          const remainingLeaseMs = Date.parse(access.lease_expires_at) - Date.now();
          if (!Number.isFinite(remainingLeaseMs)
              || remainingLeaseMs < (CODEX_TASK_BRIDGE_MODE === "worker" ? 1000 : 1)) {
            throw new Error("workspace_write_lease_expired");
          }
          turnTimeoutMs = Math.max(CODEX_TASK_BRIDGE_MODE === "worker" ? 1000 : 1, Math.min(CODEX_TASK_TIMEOUT_MS, remainingLeaseMs));
        }
        const result = await runConfiguredCodexTaskTurn({
          item,
          workspace,
          access,
          threadRef: binding?.thread_id ?? null,
          userMessage: codexText,
          initial: false,
          timeoutMs: turnTimeoutMs,
          model: selection.model,
          modelSelectionOrigin: selection.selection_origin,
          effort: selection.effort,
          serviceTier,
          skills,
          attachmentContext,
          signal: controller.signal,
        });
        const up = store.upsertCodexTaskBinding({
          item_id: item.id,
          thread_id: result.threadId,
          thread_title: binding?.thread_title || store.codexThreadTitle(item),
          mode: result.mode,
        });
        if (up.error) throw new Error("codex_thread_binding_failed");
        const assistantText = cleanCodexAssistantText(result.text, CODEX_TASK_BRIDGE_MODE === "worker" ? [] : [
          access.cwd,
          ...access.writable_roots,
          ...attachmentContext.localImages.map((entry) => entry.path),
          ...attachmentContext.localFiles.map((entry) => entry.path),
          ...skills.map((entry) => entry.path),
        ]);
        await appendCodexTaskPayloadMessage({
          item_id: item.id,
          thread_id: result.threadId,
          role: "assistant",
          text: assistantText,
          actor_ref: "codex",
          mode: result.mode,
        });
        store.appendEvent({
          actor_ref: actor, actor_kind: "human", kind: "codex_task_message",
          item_ref: item.id, project_ref: item.project_id, to: "completed",
          used_refs: ["items", "codex_task_thread", ...(access.grant_refs.length ? ["codex_workspace_write_grant"] : [])],
          data_label: "meta",
          note: `workspace_id=${workspace.workspace_id};sandbox=${access.sandbox_mode};requested_model=${selection.model};effective_model=${result.effectiveModel};model_origin=${selection.selection_origin};requested_effort=${selection.effort};effective_effort=${result.effectiveEffort};effort_fallback=${result.effortFallback ? 1 : 0}`,
        });
        const audit = store.finishCodexTurnAudit({
          audit_id: startedAudit.audit.id,
          thread_id: result.threadId,
          effective_model: result.effectiveModel,
          outcome: "completed",
          duration_ms: Date.now() - startedAt,
        });
        if (audit.error) {
          console.error("[dev-erp] codex turn audit failed:", audit.error);
          return send(res, 500, { error: "codex_turn_audit_failed" });
        }
        return send(res, 200, await codexTaskState(item, {}, currentAccount(req)));
      } catch (error) {
        // Authorization evidence must become terminal before any secondary
        // persistence. Payload-store or binding-error reporting may itself fail.
        const audit = store.finishCodexTurnAudit({
          audit_id: startedAudit.audit.id,
          thread_id: binding.thread_id,
          outcome: "failed",
          duration_ms: Date.now() - startedAt,
          error_code: String(error?.message || "").includes("aborted")
            ? "codex_turn_aborted"
            : (String(error?.message || "").includes("binding_failed") ? "codex_thread_binding_failed" : "codex_turn_failed"),
        });
        if (audit.error) console.error("[dev-erp] codex failed-turn audit failed:", audit.error);
        const publicError = cleanCodexHostError(error, "codex_error", 1000);
        try { store.markCodexTaskError(item.id, publicError); } catch {}
        try {
          await appendCodexTaskPayloadMessage({
            item_id: item.id,
            thread_id: binding?.thread_id ?? null,
            role: "error",
            text: publicError,
            actor_ref: "server",
            mode: binding?.mode ?? CODEX_TASK_BRIDGE_MODE,
          });
        } catch {}
        return send(res, 502, await codexTaskErrorPayload(item, error));
      } finally {
        if (activeCodexTurns.get(item.id)?.controller === controller) activeCodexTurns.delete(item.id);
      }
      } finally {
        preflight.release();
      }
    }
    if (path === "/api/mail" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const input = JSON.parse(body || "{}");
      const me = currentAccount(req);
      const mailbox = me ? (store.isAdmin(me.id) && input.mailbox ? input.mailbox : me.email || null) : input.mailbox;
      const result = store.createMail({ ...input, mailbox, data_label: "real" });
      if (result.error) return send(res, 400, result);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "mail_register", to: result.mail.subject, project_ref: result.mail.project_id ?? null, used_refs: ["mail"], data_label: "real" });
      return send(res, 200, result);
    }
    if (path === "/api/mail/detail" && req.method === "GET") {
      if (!canAccessMail(req, qp.id)) return send(res, 403, { error: "mail_forbidden" });
      const mail = store.mailDetail(qp.id);
      if (!mail) return send(res, 404, { error: "mail_not_found" });
      return send(res, 200, mail);
    }
    if (path === "/api/mail") {
      const opts = {
      project: qp.project, days: qp.days !== undefined ? Number(qp.days) : 90,
      q: qp.q, direction: qp.direction, label_id: qp.label_id,
      mailbox: viewMailbox(req, qp),
      limit: intParam(qp.limit, wantsPage(qp) ? 100 : 500, { min: 1, max: wantsPage(qp) ? 500 : 1000 }),
      offset: intParam(qp.offset, 0, { min: 0, max: 1_000_000 })
      };
      return send(res, 200, wantsPage(qp) ? store.mailPage(opts) : store.mail(opts));
    }
    if (path === "/api/mail/promoted") {
      // 메일 화면 '✓ 할 일' 판정 전용(승격 진실원). 미분류 격리·assignee 스코프 우회.
      return send(res, 200, { ids: store.promotedMailIds(qp.project ?? null) });
    }
    if (path === "/api/mail/receipts") {
      // B-5: 자동 정리 영수증 집계(read-only, 메타데이터만 — 건수/사유 버킷/최근시각).
      // 진실원 = _workmeta/<code>/reports/haengbogwan_mail_receipts/mail_receipts.csv (이벤트는 best-effort라 영수증이 정본).
      return send(res, 200, mailReceiptsSummary(qp.project ?? null));
    }
    if (path === "/api/guide/templates") return send(res, 200, guideTemplates(qp.mode));
    if (path === "/api/doc/recipes") return send(res, 200, docRecipes(qp.mode));
    if (path === "/api/embeds" && req.method === "GET") return send(res, 200, store.listEmbeds({ project: qp.project ?? null }));
    // ERP 챗봇 — RAG: 매뉴얼 검색 → (provider 연결 시) 로컬 작은 모델이 '그 근거 안에서만' 표현.
    // 매뉴얼 밖 추론 금지. provider 없으면 검색 기반 사람형 폴백(끊기지 않음). 질문은 로그에 저장.
    // provider는 ERP_CHAT_PROVIDER 환경변수로 주입(기본 stub=외부0). 야간 매뉴얼 갱신은 별도 고급 LLM.
    if (path === "/api/chat" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      let parsed = {};
      try { parsed = JSON.parse(body || "{}"); }
      catch { return send(res, 400, { error: "invalid_json" }); }
      const { message, thread_id } = parsed;
      const provider = process.env.ERP_CHAT_PROVIDER || "stub";
      let r;
      try {
        r = await answerFromManual({ store, question: message, thread_id, actor_ref: actor, provider });
      } catch (error) {
        console.error("[dev-erp] chat failed:", error?.stack ?? error);
        try { store.logChatQuery({ actor_ref: actor, thread_id, question: message, matched_faq_id: null }); } catch { /* best effort */ }
        r = {
          text: "챗봇 응답이 잠깐 실패했어요. 같은 질문을 한 번만 다시 보내고, 반복되면 새 대화로 다시 시작해 주세요.",
          matched: false,
          source: null,
          candidates: [],
          mode: "chat_error_fallback",
          external: false,
          provider,
          model: null,
          llm: false,
          handled_by_llm: false,
          handled_by_runtime: false,
          context_used: false,
        };
      }
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "chat_query", to: r.matched ? "matched" : "unanswered", used_refs: ["chat", "faq"], data_label: "meta", note: thread_id ? `thread=${thread_id}` : null });
      const thinking = Boolean(r.thinking ?? r.reasoning ?? false);
      return send(res, 200, {
        text: r.text,
        matched: r.matched,
        source: r.source,
        candidates: r.candidates || [],
        mode: r.mode,
        external: r.external,
        provider: r.provider,
        model: r.model,
        thinking,
        reasoning: thinking,
        llm: r.llm,
        handled_by_llm: r.handled_by_llm || false,
        handled_by_runtime: r.handled_by_runtime || false,
        context_used: r.context_used || false,
        pipeline: r.pipeline_public || null,
        chatbot_version: CHATBOT_VERSION,
        runtime: runtimeVersion().runtime
      });
    }
    if (path === "/api/faq" && req.method === "GET") return send(res, 200, store.faqs({ topic: qp.topic }));
    if (path === "/api/faq" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const r = store.upsertFaq({ ...JSON.parse(body || "{}"), data_label: "real" });
      return send(res, r.error ? 400 : 200, r);
    }
    // P-10 지식 카탈로그 (검색·등재·통합검색 — 추론 0·외부전송 0)
    if (path === "/api/knowledge" && req.method === "GET") return send(res, 200, store.knowledge({ topic: qp.topic, q: qp.q }));
    if (path === "/api/knowledge" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const b = JSON.parse(body || "{}");
      const r = store.upsertKnowledge({ ...b, data_label: "real" });
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "knowledge_upsert", item_ref: r.id, to: b.title, used_refs: b.source_ref ? [b.source_ref] : [], data_label: "real" });
      return send(res, 200, r);
    }
    if (path === "/api/knowledge/search") return send(res, 200, store.catalogSearch(qp.q ?? ""));
    // P-11 계산기 (안전 평가·회귀검증·통과해야 active)
    if (path === "/api/calculators" && req.method === "GET") return send(res, 200, store.calculators({ category: qp.category }));
    if (path === "/api/calculators" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const r = store.upsertCalculator({ ...JSON.parse(body || "{}"), data_label: "real" });
      return send(res, r.error ? 400 : 200, r);
    }
    if (path === "/api/embeds" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const r = store.upsertEmbed({ ...JSON.parse(body || "{}"), data_label: "real" });
      if (!r.error) store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "embed_register", to: r.id, used_refs: ["embed_view"], data_label: "meta" });
      return send(res, r.error ? 400 : 200, r);
    }
    if (path === "/api/calculators/example" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const b = JSON.parse(body || "{}");
      return send(res, 200, store.addCalculatorExample(b.calculator_id, b.inputs, b.expected, b.tolerance ?? 1e-6));
    }
    if (path === "/api/calculators/eval" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const b = JSON.parse(body || "{}");
      return send(res, 200, store.evalCalculator(b.id, b.inputs));
    }
    if (path === "/api/calculators/verify" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      return send(res, 200, store.verifyCalculator(JSON.parse(body || "{}").id));
    }
    if (path === "/api/calculators/activate" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const id = JSON.parse(body || "{}").id;
      const r = store.activateCalculator(id);
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "calculator_activate", item_ref: id, used_refs: ["calculator"], data_label: "real" });
      return send(res, 200, r);
    }
    if (path === "/api/chat/unanswered") return send(res, 200, store.unansweredQueries(qp.limit ? Number(qp.limit) : 50));
    if (path === "/api/gates") return send(res, 200, { mode: store.gateMode(), stages: store.gates({ project: qp.project }) });
    if (path === "/api/gates/clear" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { stage_id, force, reason } = JSON.parse(body || "{}");
      // F8: 하드 게이트 강제통과는 SE 통제 우회 — 팀 모드(계정 있음)에서는 관리자만. 사유는 event_log에 기록.
      if (force && store.accountCount() > 0 && !requireAdmin(req)) return send(res, 403, { error: "admin_only" });
      const result = store.clearStage(stage_id, { force: !!force });
      if (result.error) return send(res, result.error === "stage_not_found" ? 404 : 409, result);
      const rsn = String(reason ?? "").trim();
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "gate_clear", to: stage_id, project_ref: result.project_id, used_refs: ["gates"], data_label: "real", note: result.forced ? `forced(${result.mode})${rsn ? `: ${rsn}` : ""}` : result.mode });
      return send(res, 200, result);
    }
    if (path === "/api/settings/gate_mode" && req.method === "GET") return send(res, 200, { mode: store.gateMode() });
    if (path === "/api/settings/gate_mode" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      // F8: hard↔soft 게이트 모드 전환도 팀 모드에서는 관리자만(강제 게이트 취지 보호).
      if (store.accountCount() > 0 && !requireAdmin(req)) return send(res, 403, { error: "admin_only" });
      const { mode } = JSON.parse(body || "{}");
      const r = store.setGateMode(mode);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "gate_mode_set", to: r.mode, used_refs: ["gates", "settings"], data_label: "real" });
      return send(res, 200, r);
    }
    // P-2 SE 스케줄러 + P-1 완결성 요구
    if (path === "/api/schedule/templates") return send(res, 200, store.scheduleTemplates());
    if (path === "/api/schedule/apply" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const { project_id, template_key, anchorDates } = JSON.parse(body || "{}");
      const r = store.applyTemplate(project_id, template_key, { anchorDates: anchorDates || {} });
      return send(res, r.error ? 400 : 200, r);
    }
    if (path === "/api/schedule/anchor" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const { project_id, anchor_stage_code, date } = JSON.parse(body || "{}");
      const r = store.setAnchor(project_id, anchor_stage_code, date);
      return send(res, r.error ? 400 : 200, r);
    }
    if (path === "/api/schedule/deliverable" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const b = JSON.parse(body || "{}");
      const r = store.upsertDeliverable(b.template_key, b.anchor_stage_code, b.deliverable_name, { offset_days: b.offset_days, default_artifact_type: b.default_artifact_type });
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "deliverable_edit", to: `${b.template_key}/${b.deliverable_name}=${b.offset_days}`, used_refs: ["se_stage_template"], data_label: "real" });
      return send(res, 200, r);
    }
    if (path === "/api/requirements" && req.method === "GET") return send(res, 200, store.artifactRequirements({ scope_kind: qp.scope_kind, scope_key: qp.scope_key }));
    if (path === "/api/requirements" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const r = store.setArtifactRequirement(JSON.parse(body || "{}"));
      return send(res, r.error ? 400 : 200, r);
    }
    if (path === "/api/parts/completeness") { const r = store.boardCompleteness(qp.part); return send(res, r.error ? 404 : 200, r); }
    if (path === "/api/risk") {
      const scope = requestScope(req, qp);
      return send(res, 200, store.riskAlerts({ project: qp.project ?? null, ...(scope.all ? {} : { assignee_any: scope.assignee_any }) }));
    }
    if (path === "/api/inputs/fulfillment") return send(res, 200, store.inputFulfillment(qp.project));
    if (path === "/api/inputs/generate" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const b = JSON.parse(body || "{}");
      const ful = store.inputFulfillment(b.project_id).find((d) => d.scope_key === b.deliverable_name);
      if (!ful || !ful.fulfilled) return send(res, 409, { error: "inputs_incomplete", missing: ful?.missing ?? [] });
      // 키스톤(P-4-ai-A) 머지됨 → 자동 생성 대신 ai_proposal 큐에 pending 적재(사람 승인 후에만 실제 생성).
      const r = store.createProposal({ source: "input_fulfillment", kind: "create_item", payload: { project_id: b.project_id, title: `${b.deliverable_name} 초안` }, summary: `입력 충족: ${b.deliverable_name}`, used_refs: ["inputs"], data_label: "real" });
      return send(res, r.error ? 400 : 200, { ok: !r.error, queued: !r.error, proposal_id: r.id, status: "pending", note: "입력 충족 — ai_proposal 큐 적재(승인 후 생성)" });
    }
    // 아침 브리핑 push v1 (2026-07-04 owner 승인): 미리보기(본인) + 관리자 수동 발송 트리거.
    if (path === "/api/brief/preview" && req.method === "GET") {
      const me = currentAccount(req);
      if (!me) return send(res, 401, { error: "login_required" });
      const brief = buildMorningBrief(store, me, localDateKey());
      return send(res, 200, { brief, would_send: hasContent(brief) });
    }
    if (path === "/api/admin/brief/send-test" && req.method === "POST") {
      if (!requireAdmin(req)) return send(res, 403, { error: "admin_only" });
      const me = currentAccount(req);
      if (!String(me?.email ?? "").trim()) return send(res, 400, { error: "admin_email_missing" });
      // 관리자 본인에게만 강제 재발송(멱등 우회) — 배포 검증·시연용. 타 계정 발송은 자동 스케줄 전용.
      const r = await runMorningBriefCycle(store, {
        repoRoot: resolve(HERE, "..", "..", ".."), appUrl: process.env.DEV_ERP_PUBLIC_URL || "",
        senderEnvOverride: process.env.DEV_ERP_BRIEF_SENDER_ENV || "", force: true, onlyAccountId: me.id,
      });
      return send(res, r.ok ? 200 : 400, r);
    }
    if (path === "/api/proposals" && req.method === "GET") {
      if (!requireAdmin(req)) return send(res, 403, { error: "admin_only" });
      return send(res, 200, store.proposals({ status: qp.status || "pending" }));
    }
    if (path === "/api/proposals" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const r = store.createProposal({ ...JSON.parse(body || "{}"), data_label: "real" });
      return send(res, r.error ? 400 : 200, r);
    }
    if (path === "/api/proposals/approve" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const r = store.approveProposal(JSON.parse(body || "{}").id, { decided_by: actor });
      return send(res, r.error ? 400 : 200, r);
    }
    if (path === "/api/proposals/reject" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const b = JSON.parse(body || "{}");
      const r = store.rejectProposal(b.id, { decided_by: actor, reason: b.reason ?? null });
      return send(res, r.error ? 400 : 200, r);
    }
    if (path === "/api/recommenders/run" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      // 수동 트리거(자동 cron 아님). 추천은 createProposal pending 만 — 자동 도메인 쓰기 0.
      let body = ""; for await (const chunk of req) body += chunk;
      const b = JSON.parse(body || "{}");
      return send(res, 200, store.runRecommenders({ scope: b.scope ?? "all", project: b.project ?? null }));
    }
    // P3 재고/BOM/부품 (내부 판정만·외부전송 0)
    if (path === "/api/parts" && req.method === "GET") return send(res, 200, store.parts({ type: qp.type, grp: qp.grp, project: qp.project, q: qp.q }));
    if (path === "/api/parts" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const r = store.upsertPart({ ...JSON.parse(body || "{}"), data_label: "real" });
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "part_upsert", to: r.id, used_refs: ["parts"], data_label: "real" });
      return send(res, 200, r);
    }
    if (path === "/api/parts/link" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const { part_id, project_id } = JSON.parse(body || "{}");
      const r = store.linkPartProject(part_id, project_id);
      return send(res, r.error ? 400 : 200, r);
    }
    if (path === "/api/bom" && req.method === "GET") return send(res, 200, store.bom(qp.parent ?? ""));
    if (path === "/api/bom" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const { parent_part_id, child_part_id, qty, ref_des } = JSON.parse(body || "{}");
      const r = store.addBomEdge(parent_part_id, child_part_id, qty, ref_des);
      return send(res, r.error ? 400 : 200, r);
    }
    if (path === "/api/locations" && req.method === "GET") return send(res, 200, store.locations());
    if (path === "/api/locations" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const r = store.upsertLocation({ ...JSON.parse(body || "{}"), data_label: "real" });
      return send(res, r.error ? 400 : 200, r);
    }
    if (path === "/api/stock" && req.method === "GET") return send(res, 200, store.stock({ part: qp.part, location: qp.location }));
    if (path === "/api/stock" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const { part_id, location_id, qty } = JSON.parse(body || "{}");
      const r = store.setStock(part_id, location_id, qty);
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "stock_set", item_ref: part_id, to: String(qty), used_refs: ["stock"], data_label: "real" });
      return send(res, 200, r);
    }
    if (path === "/api/stock/low") return send(res, 200, store.stockLow());
    if (path === "/api/bom/changes") return send(res, 200, store.bomChanges(qp.limit ? Number(qp.limit) : 20));
    // 연락처 마스터
    if (path === "/api/contacts" && req.method === "GET") return send(res, 200, store.contacts({ project: qp.project, party: qp.party }));
    if (path === "/api/contacts/delete" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const r = store.deleteContact(JSON.parse(body || "{}").id);
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "contact_delete", to: r.id, used_refs: ["contacts"], data_label: "real" });
      return send(res, 200, r);
    }
    if (path === "/api/contacts/update" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const { id, name, org, role, email, phone } = JSON.parse(body || "{}");
      const r = store.updateContact(id, { name, org, role, email, phone });
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "contact_update", to: r.id, used_refs: ["contacts"], data_label: "real" });
      return send(res, 200, r);
    }
    if (path === "/api/contacts" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const r = store.createContact({ ...JSON.parse(body || "{}"), data_label: "real" });
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "contact_create", to: r.id, used_refs: ["contacts"], data_label: "real" });
      return send(res, 200, r);
    }
    if (path === "/api/contacts/link" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const { contact_id, project_id } = JSON.parse(body || "{}");
      const r = store.linkContactProject(contact_id, project_id);
      if (r.error) return send(res, 400, r);
      return send(res, 200, r);
    }
    // 파일 첨부(메타 포인터) + 배치 제안(⑧ reversible, 적용 아님)
    if (path === "/api/attachments" && req.method === "GET") return send(res, 200, store.attachments({ entity_type: qp.entity_type, entity_id: qp.entity_id }));
    if (path === "/api/attachments/suggest") return send(res, 200, store.suggestPlacement(qp.name ?? ""));
    if (path === "/api/attachments" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const r = store.addAttachment({ ...JSON.parse(body || "{}"), created_by: actor, data_label: "real" });
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "attachment_add", to: r.id, used_refs: ["attachment"], data_label: "real" });
      return send(res, 200, r);
    }
    // 구매/발주
    if (path === "/api/parties/ledger") return send(res, 200, store.partyLedger());
    if (path === "/api/parties" && req.method === "GET") return send(res, 200, store.parties({ kind: qp.kind }));
    if (path === "/api/parties" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const r = store.upsertParty({ ...JSON.parse(body || "{}"), data_label: "real" });
      if (r.error) return send(res, 400, r);
      return send(res, 200, r);
    }
    if (path === "/api/purchases" && req.method === "GET") return send(res, 200, store.purchases({ project: qp.project, party: qp.party, stage: qp.stage }));
    if (path === "/api/purchases/delete" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const r = store.deletePurchase(JSON.parse(body || "{}").id);
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "purchase_delete", to: r.id, used_refs: ["purchases"], data_label: "real" });
      return send(res, 200, r);
    }
    if (path === "/api/purchases" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const r = store.createPurchase({ ...JSON.parse(body || "{}"), created_by: actor, data_label: "real" });
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "purchase_create", to: r.id, used_refs: ["purchase"], data_label: "real" });
      return send(res, 200, r);
    }
    if (path === "/api/purchases/stage" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const { id, stage } = JSON.parse(body || "{}");
      const r = store.setPurchaseStage(id, stage);
      if (r.error) return send(res, r.error === "purchase_not_found" ? 404 : 400, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "purchase_stage", item_ref: id, from: r.from, to: r.to, used_refs: ["purchase"], data_label: "real" });
      return send(res, 200, r);
    }
    if (path === "/api/purchases/link" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const { purchase_id, project_id } = JSON.parse(body || "{}");
      const r = store.linkPurchaseProject(purchase_id, project_id);
      if (r.error) return send(res, 400, r);
      return send(res, 200, r);
    }
    if (path === "/api/worklog/draft") {
      const scope = requestScope(req, qp);
      return send(res, 200, store.worklogDraft({ project: qp.project ?? null, days: qp.days ? Number(qp.days) : 7, ...(scope.all ? {} : { scope, assignee_any: scope.assignee_any, mailbox: scope.mailbox }) }));
    }
    if (path === "/api/report/draft") {
      const scope = requestScope(req, qp);
      return send(res, 200, store.reportDraft({ project: qp.project ?? null, kind: qp.kind === "note" ? "note" : "report", ...(scope.all ? {} : { assignee_any: scope.assignee_any, mailbox: scope.mailbox }) }));
    }
    if (path === "/api/guide/summary") return send(res, 200, store.guideSummary());
    if (path === "/api/guide") return send(res, 200, store.guideState(qp.project ?? ""));
    if (path === "/api/guide/artifact" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const { project_id, stage_code, name } = JSON.parse(body || "{}");
      const result = store.addGuideArtifact(project_id, stage_code, name);
      if (result.error) return send(res, 400, result);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "guide_artifact_add", item_ref: `${project_id}:${stage_code}`, to: name, project_ref: project_id, used_refs: ["guide", ".registry/skills/se_foldertree_generate"], data_label: "real" });
      return send(res, 200, result);
    }
    if (path === "/api/guide/step" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const { artifact_id, step_key, on } = JSON.parse(body || "{}");
      const result = store.setGuideStep(artifact_id, step_key, on !== false);
      if (result.error) return send(res, 400, result);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: on !== false ? "guide_step_done" : "guide_step_undo", item_ref: `guide:${artifact_id}`, to: step_key, project_ref: result.project_id, used_refs: ["guide"], data_label: "real" });
      return send(res, 200, result);
    }
    if (path === "/api/mail/assign" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { mail_ids, project_id, make_items, assignee_ref, open, single_item } = JSON.parse(body || "{}");
      const requestedMailIds = Array.isArray(mail_ids) ? mail_ids : [];
      if (requestedMailIds.some((mail_id) => !canAccessMail(req, mail_id))) return send(res, 403, { error: "mail_forbidden" });
      const result = store.assignMails(mail_ids, project_id, { make_items: make_items === true, created_by: actor, assignee_ref: assignee_ref || null, open: open === true, single_item: single_item === true });
      if (result.error) return send(res, 400, result);
      for (const r of result.results) {
        if (r.error) continue;
        // 이미 승격된 할일의 담당 재배정(#S7-4): 메일 unchanged 경로에서도 담당이 실제 바뀌면 감사 이벤트를 남긴다(단일항목 /api/items/assign 과 대칭).
        if (r.item_existing && r.assignee_to !== undefined && r.assignee_from !== r.assignee_to) {
          store.appendEvent({
            actor_ref: actor, actor_kind: "human", kind: "item_assign",
            item_ref: r.item_existing, from: r.assignee_from ?? null, to: r.assignee_to ?? null,
            project_ref: project_id, used_refs: ["items", "mail"], data_label: "real", note: "batch_reassign"
          });
        }
        if (r.unchanged) continue;
        store.appendEvent({
          actor_ref: actor, actor_kind: "human", kind: "mail_assign",
          item_ref: r.mail_id, from: r.from, to: project_id, project_ref: project_id,
          used_refs: ["mail"], data_label: "real"
        });
        if (r.item_moved) store.appendEvent({
          actor_ref: actor, actor_kind: "human", kind: "item_move",
          item_ref: r.item_moved, from: r.from, to: project_id, project_ref: project_id,
          used_refs: ["items", "mail"], data_label: "real"
        });
        if (r.item_created) store.appendEvent({
          actor_ref: actor, actor_kind: "human", kind: "item_promote",
          item_ref: r.item_created, from: r.mail_id, project_ref: project_id,
          used_refs: ["items", "mail"], data_label: "real", note: "assign_spawn"
        });
      }
      return send(res, 200, result);
    }
    if (path === "/api/labels" && req.method === "GET") return send(res, 200, store.labels());
    if (path === "/api/labels" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const { name, color } = JSON.parse(body || "{}");
      const result = store.createLabel(name, color);
      if (result.error) return send(res, 400, result);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "label_create", to: result.label.name, used_refs: ["mail_label"], data_label: "real" });
      return send(res, 200, result);
    }
    if (path === "/api/labels/delete" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const { id } = JSON.parse(body || "{}");
      const result = store.deleteLabel(id);
      if (result.error) return send(res, 400, result);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "label_delete", to: result.name, used_refs: ["mail_label"], data_label: "real" });
      return send(res, 200, result);
    }
    if (path === "/api/labels/update" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const { id, name, color } = JSON.parse(body || "{}");
      const result = store.updateLabel(id, { name, color });
      if (result.error) return send(res, 400, result);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "label_update", to: result.label.name, used_refs: ["mail_label"], data_label: "real" });
      return send(res, 200, result);
    }
    if (path === "/api/mail/unassign" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { mail_id } = JSON.parse(body || "{}");
      if (!canAccessMail(req, mail_id)) return send(res, 403, { error: "mail_forbidden" });
      const result = store.unassignMail(mail_id);
      if (result.error) return send(res, 400, result);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "mail_unassign", item_ref: mail_id, from: result.from, to: result.to, used_refs: ["core_mail"], data_label: "real" });
      return send(res, 200, result);
    }
    if (path === "/api/mail/delete" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { mail_id } = JSON.parse(body || "{}");
      if (!canAccessMail(req, mail_id)) return send(res, 403, { error: "mail_forbidden" });
      const result = store.deleteMail(mail_id);
      if (result.error) return send(res, 400, result);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "mail_delete", item_ref: mail_id, used_refs: ["core_mail"], data_label: "real" });
      return send(res, 200, result);
    }
    if (path === "/api/mail/update" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { mail_id, subject, counterpart, at, pointer_ref } = JSON.parse(body || "{}");
      if (!canAccessMail(req, mail_id)) return send(res, 403, { error: "mail_forbidden" });
      const result = store.updateMail(mail_id, { subject, counterpart, at, pointer_ref });
      if (result.error) return send(res, 400, result);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "mail_update", item_ref: mail_id, used_refs: ["core_mail"], data_label: "real" });
      return send(res, 200, result);
    }
    // 메일 제외 규칙(개인메일·차단 발신자) — admin 전용. 발신자/제목/수신함 기준, 매칭 메일은 수집 시 저장 전 드롭 + 기존도 숨김.
    if (path === "/api/mail/exclude-rules" && req.method === "GET") {
      if (!allowSharedWrite(req, res)) return;
      return send(res, 200, store.mailExcludeRules());
    }
    if (path === "/api/mail/exclude-rules" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      const { field, pattern, match, note } = await readJson(req);
      const result = store.addMailExcludeRule({ field, pattern, match, note, created_by: actor });
      if (result.error) return send(res, 400, result);
      const applied = store.applyMailExcludeToExisting(); // '기존도 숨김' — 이미 들어온 매칭 메일 소급 hidden
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "mail_rule_set", note: String(field ?? ""), used_refs: ["mail_exclude_rule"], data_label: "real" }); // 프라이버시: 패턴 값은 로그에 안 남김(필드명만)
      return send(res, 200, { ...result, hidden: applied.hidden });
    }
    if (path === "/api/mail/exclude-rules/delete" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      const { id } = await readJson(req);
      const result = store.deleteMailExcludeRule(id);
      if (result.error) return send(res, 400, result);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "mail_rule_delete", used_refs: ["mail_exclude_rule"], data_label: "real" });
      return send(res, 200, result);
    }
    // Outlook식 메일→과제 라우팅 규칙(2026-07-05 owner): 사용자 규칙 CRUD + '기존 메일에 지금 적용'.
    // GET 은 엔진 바인딩(정본 YAML, 읽기 전용)도 함께 반환 — 기존 규칙에 맞춰 추가하도록.
    if (path === "/api/mail/route-rules" && req.method === "GET") {
      if (!allowSharedWrite(req, res)) return;
      return send(res, 200, { user_rules: store.mailRouteRules(), engine: readRouterBinding(KNOWLEDGE_SHELL.root) });
    }
    if (path === "/api/mail/route-rules" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      const { field, pattern, match, project_id, note } = await readJson(req);
      const result = store.addMailRouteRule({ field, pattern, match, project_id, note, created_by: actor });
      if (result.error) return send(res, 400, result);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "mail_route_rule_set", to: String(project_id ?? ""), note: String(field ?? ""), used_refs: ["mail_route_rule"], data_label: "real" }); // 패턴 값은 로그 미기재(제외 규칙 관례)
      return send(res, 200, result);
    }
    if (path === "/api/mail/route-rules/delete" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      const { id } = await readJson(req);
      const result = store.deleteMailRouteRule(id);
      if (result.error) return send(res, 400, result);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "mail_route_rule_delete", used_refs: ["mail_route_rule"], data_label: "real" });
      return send(res, 200, result);
    }
    if (path === "/api/mail/route-rules/apply" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      const { rule_id } = await readJson(req);
      const result = store.applyMailRouteRulesToExisting({ rule_id: rule_id ?? null });
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "mail_route_apply", to: rule_id != null ? `rule:${rule_id}` : "all", note: `moved=${result.moved} items=${result.items_moved}`, used_refs: ["mail_route_rule", "core_mail"], data_label: "real" });
      return send(res, 200, result);
    }
    if (path === "/api/mail/label" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { mail_id, label_id, on } = JSON.parse(body || "{}");
      if (!canAccessMail(req, mail_id)) return send(res, 403, { error: "mail_forbidden" });
      const result = store.setMailLabel(mail_id, label_id, on !== false);
      if (result.error) return send(res, 400, result);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: on !== false ? "label_add" : "label_remove", item_ref: mail_id, to: String(label_id), used_refs: ["mail_label_map"], data_label: "real" });
      return send(res, 200, result);
    }
    if (path === "/api/artifacts") return send(res, 200, store.artifacts({ project: qp.project, kind: qp.kind }));
    if (path === "/api/people") return send(res, 200, store.people());
    // P-6 능력 매트릭스 + 콕핏 nudges (점수 미저장·감시 아닌 지원)
    if (path === "/api/capability/matrix") return send(res, 200, store.capabilityMatrix());
    if (path === "/api/people/skill" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const b = JSON.parse(body || "{}");
      const r = store.setPersonSkill(b.person_id, b.capability_label, { source_ref: b.source_ref ?? null, weight: b.weight ?? 1 });
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "person_skill_set", item_ref: b.person_id, to: b.capability_label, used_refs: b.source_ref ? [b.source_ref] : [], data_label: "real" });
      return send(res, 200, r);
    }
    if (path === "/api/nudges") {
      const scope = requestScope(req, qp);
      return send(res, 200, store.nudges({ person: qp.person, limit: qp.limit ? Number(qp.limit) : 5, ...(scope.all ? {} : { assignee_any: scope.assignee_any }) }));
    }
    if (path === "/api/workload") {
      const scope = requestScope(req, qp);
      return send(res, 200, store.workload(new Date().toISOString().slice(0, 10), scope.all ? {} : { assignee_any: scope.assignee_any }));
    }
    if (path === "/api/meetings/open") {
      const scope = requestScope(req, qp);
      return send(res, 200, store.meetingOpenRollup(scope.all ? {} : { assignee_any: scope.assignee_any }));
    }
    if (path === "/api/calendar.ics") {
      const scope = requestScope(req, qp);
      const ics = store.calendarIcs({ person: qp.person ?? null, ...(scope.all ? {} : { assignee_any: scope.assignee_any }) });
      return send(res, 200, ics, "text/calendar", { "content-disposition": `attachment; filename="dev-erp${qp.person ? `-${qp.person}` : ""}.ics"` });
    }
    // B10 캘린더: 월간 그리드(마감+일정). 마감 스코프는 calendar.ics 와 동일 관례(관리자=전체/계정 선택,
    // 팀원=본인 강등). 일정(core_meeting)은 담당 개념이 없어 팀 공용 표시.
    if (path === "/api/calendar") {
      const range = monthGridRange(qp.month ?? new Date().toISOString().slice(0, 7));
      if (!range) return send(res, 400, { error: "month_format" });
      const assignee_any = viewIdentities(req, qp);
      let items = store.calendarFeed({ from: range.from, to: range.to, assignee_any });
      const meetings = store.meetings({ from: range.from, to: range.to, project: qp.project || undefined });
      if (qp.project) items = items.filter((r) => r.project_id === qp.project);
      return send(res, 200, buildMonthGrid(range.month, { items, meetings }));
    }
    if (path === "/api/search") return send(res, 200, crossSearch(store, qp.q, { assignee_any: viewIdentities(req, qp), mailbox: viewMailbox(req, qp) }));
    if (path === "/api/lexicon") return send(res, 200, { mode: qp.mode ?? "business", modes: Object.keys(LEXICON), labels: getLexicon(qp.mode) });
    if (path === "/api/modules") return send(res, 200, modulesFor(qp.mode));
    // canon 지식 저장소를 분야 그룹별로(메타만). 인증 필요(읽기 게이트 대상).
    if (path === "/api/knowledge/registry") return send(res, 200, { groups: groupedKnowledge(KNOW_DIR, qp.mode || "business") });
    if (path === "/api/knowledge/shell/contract" && req.method === "GET") return send(res, 200, scanKnowledgeShellContract(KNOWLEDGE_SHELL));
    if (path === "/api/knowledge/spaces" && req.method === "GET") return send(res, 200, scanKnowledgeSpaces(KNOWLEDGE_SHELL));
    if (path === "/api/knowledge/wiki/pages" && req.method === "GET") return send(res, 200, scanWikiPageRefs(KNOWLEDGE_SHELL));
    if (path === "/api/knowledge/rag/routes" && req.method === "GET") return send(res, 200, scanRagRoutes(KNOWLEDGE_SHELL));
    if (path === "/api/knowledge/rag/work-cards" && req.method === "GET") return send(res, 200, scanRagWorkCards(KNOWLEDGE_SHELL));
    if (path === "/api/knowledge/ledgers" && req.method === "GET") return send(res, 200, scanKnowledgeLedgers(KNOWLEDGE_SHELL));
    // 지식 서가 현황(2026-07-04 owner): 계층 서가·자산 총량·과제별 수집이력·사용 rollup·위키 목록(메타만)
    if (path === "/api/knowledge/overview" && req.method === "GET") return send(res, 200, buildKnowledgeOverview(KNOWLEDGE_SHELL.root));
    // 위키 본문(owner 승인 예외 — 로그인 팀 한정, .md 페이지만, chunk/raw 차단은 모듈이 강제)
    if (path === "/api/knowledge/wiki/page" && req.method === "GET") {
      if (!currentAccount(req)) return send(res, 401, { error: "login_required" });
      const r = readWikiPage(KNOWLEDGE_SHELL.root, qp.ref || "");
      return send(res, r.error ? 400 : 200, r);
    }
    // 줄기(project_context) 그래프 — 로그인 팀 한정, 읽기 전용 메타.
    // 데이터 루트는 overview·wiki 와 동일하게 KNOWLEDGE_SHELL.root(=repo ROOT, --knowledge_shell_root 로 분리 가능).
    if (path === "/api/context/projects" && req.method === "GET") {
      if (!currentAccount(req)) return send(res, 401, { error: "login_required" });
      return send(res, 200, { projects: listContextProjects(KNOWLEDGE_SHELL.root) });
    }
    if (path === "/api/context/graph" && req.method === "GET") {
      if (!currentAccount(req)) return send(res, 401, { error: "login_required" });
      const r = buildContextGraph(KNOWLEDGE_SHELL.root, qp.project || "", { store });
      return send(res, r.error ? 400 : 200, r);
    }
    // B9a 가지 이야기(기원/경로/종결) — CSV(지식 루트)+DB(메일/이벤트/완료/산출물) 읽기전용 조인.
    if (path === "/api/context/branch_story" && req.method === "GET") {
      if (!currentAccount(req)) return send(res, 401, { error: "login_required" });
      const r = buildBranchStory(KNOWLEDGE_SHELL.root, qp.project || "", qp.branch || "", { store });
      return send(res, r.error ? 400 : 200, r);
    }
    // ENGINE-12 일일 생명수 — source-local 원장을 합치지 않는 metadata-only/read-only 파생.
    // project/day/filter는 fail-closed, exact project 접근과 project_context branch ref만 사용한다.
    if (path === "/api/context/life_tree" && req.method === "GET") {
      if (!currentAccount(req)) return send(res, 401, { error: "login_required" });
      const query = parseContextLifeTreeQuery({
        project: qp.project,
        days: qp.days,
        lanes: qp.lanes,
        temporal_roles: qp.temporal_roles,
      });
      if (query.error) return send(res, 400, query);
      if (!canAccessProject(req, query.project)) return send(res, 403, { error: "project_forbidden" });
      const r = buildContextLifeTree(KNOWLEDGE_SHELL.root, query.project, {
        store,
        days: query.days,
        lanes: query.lanes,
        temporalRoles: query.temporal_roles,
        scope: requestScope(req, qp),
      });
      return send(res, r.error ? 400 : 200, r);
    }
    if (path === "/api/events/recent") return send(res, 200, publicEventRows(store.recentEvents(qp.limit ? Number(qp.limit) : 30, qp.project ?? null, requestScope(req, qp))));
    if (path === "/api/events/audit") return send(res, 200, {
      // noise=0(기본, UI '조회·잡음 포함' 해제) → 잡음을 서버에서 제외해 limit 이 의미 이벤트에만 적용.
      // noise param 없으면(타 호출자) 종전대로 전체 포함(백워드 호환).
      events: publicEventRows(store.queryEvents({ project: qp.project || null, kind: qp.kind || null, actor: qp.actor || null, since: qp.since || null, limit: qp.limit ? Number(qp.limit) : 300, excludeKinds: qp.noise === "0" ? AUDIT_NOISE_KINDS : null, scope: requestScope(req, qp) })),
      facets: store.eventFacets(requestScope(req, qp)),
    });
    if (path === "/api/events" && req.method === "POST") {
      const evMe = currentAccount(req);
      if (store.accountCount() === 0) return send(res, 409, { error: "auth_bootstrap_required" });
      if (!evMe) return send(res, 401, { error: "login_required" });
      const event = await readJson(req);
      if (event.kind !== "view") return send(res, 403, { error: "client_event_kind_forbidden" });
      const view = String(event.to || "").trim();
      if (!/^[A-Za-z0-9._:-]{1,100}$/.test(view)) return send(res, 400, { error: "client_event_view_invalid" });
      const projectRef = event.project_ref == null || event.project_ref === "" ? null : String(event.project_ref).trim();
      if (projectRef && !canAccessProject(req, projectRef)) return send(res, 403, { error: "project_forbidden" });
      store.appendEvent({
        actor_ref: evMe.username,
        actor_kind: "human",
        kind: "view",
        to: view,
        project_ref: projectRef,
        used_refs: [`view:${view}`],
        data_label: "meta",
        note: "source_surface=erp_browser",
      });
      return send(res, 200, { ok: true });
    }
    // ---------- P2b: 계정·권한·계정별 레이아웃 ----------
    if (path === "/api/me") {
      // 클라이언트 정체성 계약. 익명이면 account_count 로 bootstrap 필요 여부 판단.
      const a = currentAccount(req);
      if (!a) return send(res, 200, { anonymous: true, account_count: store.accountCount(), allow_self_register: ALLOW_SELF_REGISTER });
      const prof = store.accountProfile(a);
      return send(res, 200, { account: prof, person_id: a.person_id, roles: prof.roles, perms: prof.perms, account_count: store.accountCount(), allow_self_register: ALLOW_SELF_REGISTER });
    }
    // (인증/계정 엔드포인트는 상단 P2b 블록에서 처리 — 여기 중복 제거됨)
    if (path === "/api/dashboard/layout" && req.method === "GET") {
      const a = currentAccount(req);
      return send(res, 200, { layout: a ? store.getLayout(a.id) : null });
    }
    if (path === "/api/dashboard/layout" && req.method === "PUT") {
      const a = currentAccount(req);
      if (!a) return send(res, 401, { error: "login_required" });
      let body = ""; for await (const chunk of req) body += chunk;
      const { layout } = JSON.parse(body || "{}");
      if (!Array.isArray(layout)) return send(res, 400, { error: "layout_array_required" });
      store.setLayout(a.id, layout);
      return send(res, 200, { ok: true });
    }

    // ---------- 개발요청함(인입 채널) ----------
    if (path === "/api/requests" && req.method === "GET") return send(res, 200, store.requests({ project: qp.project, status: qp.status }));
    if (path === "/api/requests/delete" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const r = store.deleteRequest(JSON.parse(body || "{}").id);
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "request_delete", to: r.id, used_refs: ["requests"], data_label: "real" });
      return send(res, 200, r);
    }
    if (path === "/api/requests/update" && req.method === "POST") {
      if (!allowSharedWrite(req, res)) return;
      let body = ""; for await (const chunk of req) body += chunk;
      const { id, title, requester, category } = JSON.parse(body || "{}");
      const r = store.updateRequest(id, { title, requester, category });
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "request_update", to: r.id, used_refs: ["requests"], data_label: "real" });
      return send(res, 200, r);
    }
    if (path === "/api/requests" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const input = JSON.parse(body || "{}");
      const result = store.createRequest({ ...input, data_label: "real" });
      if (result.error) return send(res, 400, result);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "request_create", to: result.id, project_ref: input.project_id ?? null, used_refs: ["requests"], data_label: "real" });
      return send(res, 200, result);
    }
    if (path === "/api/requests/promote" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { id } = JSON.parse(body || "{}");
      const result = store.promoteRequest(id, actor);
      if (result.error) return send(res, 400, result);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "item_promote", item_ref: result.item.id, from: id, to: result.item.title, project_ref: result.item.project_id, used_refs: ["items", "requests"], data_label: "real" });
      return send(res, 200, result);
    }

    // ---------- SE 산출물 레지스터(목록은 ingest: tools/scan_se_foldertree.mjs --apply. 일정만 owner 편집 가능) ----------
    if (path === "/api/deliverables" && req.method === "GET") return send(res, 200, store.coreDeliverables({ project: qp.project, stage: qp.stage }));
    // owner 직접 산출물 등록 — 고정 단계 밖 중간번호(31·32…) 등 실제 산출물 추가.
    if (path === "/api/deliverables" && req.method === "POST") {
      const input = await readJson(req);
      const r = store.addDeliverable(input);
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "deliverable_add", to: input.name, project_ref: input.project_id, used_refs: ["deliverables"], data_label: "real" });
      return send(res, 200, r);
    }
    // 산출물 입력파일(메타·포인터 전용). 종류별 In 하위폴더 제안 + 등록/조회/상태.
    if (path === "/api/deliverables/input-subfolders") return send(res, 200, { subfolders: store.inputSubfoldersFor(qp.type) });
    if (path === "/api/deliverables/inputs" && req.method === "GET")
      return send(res, 200, store.deliverableInputs({ deliverable_id: qp.deliverable, project: qp.project }));
    if (path === "/api/deliverables/inputs" && req.method === "POST") {
      const r = store.registerDeliverableInput(await readJson(req));
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "deliverable_input", to: r.id, used_refs: ["deliverables", "input"], data_label: "real" });
      return send(res, 200, r);
    }
    if (path === "/api/deliverables/inputs/status" && req.method === "POST") {
      const { id, status } = await readJson(req);
      const r = store.setDeliverableInputStatus(id, status);
      return send(res, r.error ? 400 : 200, r);
    }
    // 입력파일 다운로드/서빙 — 등록된 입력만(화이트리스트) + filevault 경로 봉쇄. 기본 OFF.
    if (path === "/api/deliverables/inputs/file") {
      if (!FILEIO) return send(res, 404, { error: "fileio_disabled" });
      const inp = store.deliverableInput(qp.id);
      if (!inp || !inp.pointer) return send(res, 404, { error: "input_or_pointer_missing" });
      const safe = safeWorkspacePath(BACKEND_ROOT, inp.pointer, { mustExist: true }); // 등록 포인터만 + 봉쇄
      if (safe.error) return send(res, 400, { error: `unsafe_${safe.error}` });
      const r = readSafe(safe);
      if (r.error) return send(res, 500, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "input_download", to: qp.id, used_refs: ["fileio"], data_label: "meta" });
      res.writeHead(200, { "content-type": "application/octet-stream", "cache-control": "no-store",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(inp.file_name || "file")}` });
      return res.end(r.bytes);
    }
    // 입력파일 업로드 — 산출물 in_pointer(02_Input) 하위 subfolder/filename 으로 기록 + 장부 등록. 기본 OFF.
    // body = 원본 바이트(브라우저 fetch 의 파일 blob). 메타(deliverable/subfolder/filename)는 쿼리.
    if (path === "/api/deliverables/inputs/upload" && req.method === "POST") {
      if (!FILEIO) return send(res, 404, { error: "fileio_disabled" });
      const did = qp.deliverable, subfolder = qp.subfolder || "", filename = qp.filename || "";
      const d = store.db.prepare("SELECT in_pointer, project_id FROM core_deliverable WHERE id=?").get(did);
      if (!d) return send(res, 404, { error: "deliverable_not_found" });
      if (!d.in_pointer) return send(res, 400, { error: "in_pointer_unset" }); // 02_Input 경로 미설정(스캔/등록 필요)
      // 원본 바이트 수신(상한 초과 시 중단 — 메모리 남용 방지).
      const chunks = []; let total = 0;
      for await (const c of req) { total += c.length; if (total > UPLOAD_MAX) return send(res, 413, { error: "too_large" }); chunks.push(c); }
      const bytes = Buffer.concat(chunks);
      if (!bytes.length) return send(res, 400, { error: "empty_body" });
      const target = safeUploadTarget(BACKEND_ROOT, d.in_pointer, subfolder, filename);
      if (target.error) return send(res, 400, { error: `unsafe_${target.error}` });
      const w = commitUpload(BACKEND_ROOT, target, bytes);
      if (w.error) return send(res, 400, { error: `write_${w.error}` });
      const reg = store.registerDeliverableInput({ deliverable_id: did, subfolder, file_name: filename, pointer: w.rel, source: "erp", sha256: w.sha256, size: w.size, status: "received" });
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "input_upload", to: reg.id, project_ref: d.project_id, used_refs: ["fileio"], data_label: "real" });
      return send(res, 200, { ok: true, id: reg.id, rel: w.rel, size: w.size, sha256: w.sha256 });
    }
    // 일정(due) owner 직접 지정 — '언제'는 RAG/스캔에 없어 사람이 변경한다(나중에 Codex 자동 분석 예정).
    if (path === "/api/deliverables/due" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const b = JSON.parse(body || "{}");
      const r = store.setDeliverableDue(b.id, b.due);
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "deliverable_due_edit", to: `${b.id}=${r.due ?? "(해제)"}`, used_refs: ["deliverables"], data_label: "real" });
      return send(res, 200, r);
    }
    // 일정→할일: 산출물 1건 → 그 산출물 작성 할일 생성(SE앵커·연결·마감 상속). 중복 spawn 방지.
    if (path === "/api/deliverables/spawn-task" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const b = JSON.parse(body || "{}");
      const r = store.spawnTaskFromDeliverable(b.id, { work_type: b.work_type, created_by: actor });
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "task_spawn_deliverable", item_ref: r.item.id, to: r.item.title, project_ref: r.item.project_id, used_refs: ["deliverables", "items"], data_label: "real" });
      return send(res, 200, r);
    }
    // 완료게이트 검토단계 진행/되돌리기(작성됨→본인→팀→리드=완료). 검토자 식별은 이벤트 actor 에 기록.
    if (path === "/api/deliverables/review" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const b = JSON.parse(body || "{}");
      const r = store.setDeliverableReview(b.id, b.stage);
      if (r.error) return send(res, 400, r);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "deliverable_review", to: `${b.id}=${r.review_stage}`, used_refs: ["deliverables"], data_label: "real" });
      return send(res, 200, r);
    }

    // ---------- 회의록(메타 전용) ----------
    if (path === "/api/meetings" && req.method === "GET") return send(res, 200, store.meetings({ project: qp.project }));
    if (path === "/api/meetings" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const input = JSON.parse(body || "{}");
      const result = store.createMeeting({ ...input, data_label: "real" });
      if (result.error) return send(res, 400, result);
      store.appendEvent({ actor_ref: actor, actor_kind: "human", kind: "meeting_create", to: result.id, project_ref: input.project_id ?? null, used_refs: ["meetings"], data_label: "real" });
      return send(res, 200, result);
    }
    // B10 캘린더: 일정 갱신·소프트삭제. 권한 v1=로그인 사용자 전원(생성과 대칭 — 패킷 설계결정 3).
    if (path === "/api/meetings/update" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { id, title, at, project_id, attendees } = JSON.parse(body || "{}");
      const result = store.updateMeeting(id, { title, at, project_id, attendees }, { actor_ref: actor });
      if (result.error) return send(res, 400, result);
      return send(res, 200, result);
    }
    if (path === "/api/meetings/delete" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { id } = JSON.parse(body || "{}");
      const result = store.deleteMeeting(id, { actor_ref: actor });
      if (result.error) return send(res, 400, result);
      return send(res, 200, result);
    }
    if (path === "/api/meetings/actions" && req.method === "GET") {
      const scope = requestScope(req, qp);
      return send(res, 200, store.meetingActions(qp.meeting ?? "", scope.all ? {} : { assignee_any: scope.assignee_any }));
    }
    if (path === "/api/meetings/action" && req.method === "POST") {
      let body = ""; for await (const chunk of req) body += chunk;
      const { meeting_id, item_id } = JSON.parse(body || "{}");
      if (!canAccessItem(req, item_id)) return send(res, 403, { error: "item_forbidden" });
      const result = store.linkActionItem(meeting_id, item_id);
      if (result.error) return send(res, 400, result);
      return send(res, 200, result);
    }

    if (path.startsWith("/api/")) return send(res, 404, { error: "not_found" });

    // 스킨 이미지는 공유 워크스페이스(OneDrive) → 로컬 fallback 순서로 찾는다.
    if (path.startsWith("/skins/")) {
      const rel = path.slice("/skins/".length);
      for (const root of SKIN_ROOTS) {
        if (serveFromRoot(res, root, rel)) return;
      }
      return send(res, 404, "not found", "text/plain");
    }

    // owner 지식그래프 뷰어(3D/2D) 산출물 서빙 — 로그인 팀 한정, 안전 확장자만, dotfile·탈출 차단.
    if (path.startsWith("/knowledge-graph/")) {
      if (!currentAccount(req)) return send(res, 401, "login required", "text/plain");
      const rel = path.slice("/knowledge-graph/".length).replace(/^\/+/, "");
      const ext = extname(rel).toLowerCase();
      if (!rel || rel.includes("..") || /(^|\/)\./.test(rel) || ![".html", ".js", ".json", ".css"].includes(ext)) {
        return send(res, 404, "not found", "text/plain");
      }
      if (serveFromRoot(res, GRAPH_VIEW_ROOT, rel)) return;
      return send(res, 404, "not found", "text/plain");
    }

    // HTTPS 신뢰 등록용 앵커 배포. 무결성 주의: 설치 전 서버 시작 로그의 SHA-256 지문과
    // certutil -hashfile 대조가 절차(런북 3.4). CA:TRUE 상주키 앵커는 배포 차단(위 가드).
    if (TLS_ENABLED && path === "/dev-erp-ca.crt") {
      if (!TLS_TRUST_ANCHOR_PATH) return send(res, 404, "trust anchor distribution blocked: server.crt is CA:TRUE with a live key — follow runbook 3.4 (one-shot local CA, CA:FALSE leaf)", "text/plain");
      res.writeHead(200, { "Content-Type": "application/x-x509-ca-cert", "Content-Disposition": 'attachment; filename="dev-erp-ca.crt"' });
      return res.end(readFileSync(TLS_TRUST_ANCHOR_PATH));
    }

    // 정적 파일 (no-build 클라이언트)
    const file = path === "/" ? "index.html" : path.replace(/^\/+/, "");
    if (serveFromRoot(res, STATIC_ROOT, file)) return;
    return send(res, 404, "not found", "text/plain");
  } catch (error) {
    // BE-3: 내부 예외 메시지(SQLite 바인드·JSON 파서 등)를 클라이언트에 노출하지 않음 — 서버 로그에만 남기고 일반화 응답.
    if (error?.code === "too_large") return send(res, 413, { error: "request_too_large" });
    if (error instanceof ErpMcpError) return send(res, error.status, { error: error.code });
    const redactedPath = path.replace(/(\/api\/mcp\/uploads\/)[^/]+/g, "$1<redacted>");
    console.error("[dev-erp] unhandled:", req.method, redactedPath, error?.stack ?? error);
    return send(res, 500, { error: "internal" });
  }
});

const onReady = () => {
  console.log(`[dev-erp] backend write root: ${BACKEND_ROOT}${resolve(BACKEND_ROOT) !== resolve(ROOT) ? " (external data plane)" : " (self checkout)"}`);
  console.log(`[dev-erp] ${TLS_ENABLED ? "https" : "http"}://${HOST}:${PORT} (db: ${DB_PATH})${TLS_ENABLED ? " — 직접 TLS, 신뢰 등록용 인증서: /dev-erp-ca.crt" : ""}`);
  // 데이터 평면 아키텍처(2026-07-05 owner): Soulforge=백엔드, runtime=무상태 앱 서버.
  // 지식/위키/줄기 읽기는 --knowledge_shell_root 로 백엔드를 가리킨다(분리 시 명시 로그).
  console.log(`[dev-erp] 데이터 평면 루트: ${KNOWLEDGE_SHELL.root}${resolve(KNOWLEDGE_SHELL.root) !== resolve(ROOT) ? " (백엔드 분리 — 이 checkout 은 앱 서버)" : " (자기 checkout)"}`);
  if (TLS_ENABLED) {
    // 앵커 무결성 대조값: 팀원은 설치 전 `certutil -hashfile dev-erp-ca.crt SHA256` 결과를 이 값과 대조(런북 3.4).
    if (TLS_TRUST_ANCHOR_PATH) console.log(`[dev-erp] 신뢰 앵커 SHA-256: ${createHash("sha256").update(readFileSync(TLS_TRUST_ANCHOR_PATH)).digest("hex")}`);
    else console.error("[dev-erp] 경고: server.crt 가 CA:TRUE 상주키 인증서 — 신뢰 앵커 배포(/dev-erp-ca.crt)를 차단함. 런북 3.4 의 1회용 CA 절차로 재발급 권장.");
  }
  if (HOST !== "127.0.0.1") {
    console.log("[dev-erp] 주의: 같은 네트워크에 열려 있음 - 계정/RBAC와 trusted LAN 전제");
  }
  // 챗봇 매뉴얼: tracked manual/manual_faq.json 을 startup 에 upsert(data_label="manual"). 멱등.
  // 챗봇(answerFromManual)이 core_faq 를 검색하므로, 이 파일이 '로컬 LLM 챗봇이 보고 답하는 매뉴얼'.
  try {
    const manualPath = join(HERE, "manual", "manual_faq.json");
    if (existsSync(manualPath)) {
      const entries = JSON.parse(readFileSync(manualPath, "utf-8"));
      let n = 0;
      for (const f of (Array.isArray(entries) ? entries : entries.faqs || [])) {
        if (f && f.question && f.answer) { store.upsertFaq({ ...f, data_label: "manual" }); n++; }
      }
      if (n) console.log(`[dev-erp] 챗봇 매뉴얼 FAQ ${n}건 적재(manual_faq.json)`);
    }
  } catch (e) { console.error("[dev-erp] 매뉴얼 FAQ 적재 오류:", e.message); }
  // 자동화(기본 자동 / 수동 폴백): '각자 메일=각자 일' 시작 시 1회 backfill. 팀 모드 아니면 no-op.
  try { const r = store.applyMailboxAutoAssign(); if (r.applied) console.log(`[dev-erp] 메일 자동배정(각자 메일=각자 일): 시작 backfill ${r.applied}건`); }
  catch (e) { console.error("[dev-erp] 메일 자동배정 backfill 오류:", e.message); }
  // autosync Phase 2: 할일_장부 → ERP 자동 import 폴링(결정적·LLM 무관). 동기 버튼 불필요.
  // 기본 OFF(테스트·:memory: 무영향). 켜기: 환경변수 DEV_ERP_AUTOSYNC=1 또는 --autosync. 간격 DEV_ERP_AUTOSYNC_MS(기본 10s).
  if (process.env.DEV_ERP_AUTOSYNC === "1" || args.includes("--autosync")) {
    const root = BACKEND_ROOT;
    // Phase 2: 할일_장부 → ERP 자동 import 폴링.
    startAutosyncPoll(store, { root, intervalMs: Number(process.env.DEV_ERP_AUTOSYNC_MS) || 10000, log: console.log });
    // 자동화: import 폴링과 같은 간격으로 '각자 메일=각자 일' 재적용(신규 import 분 자동 확정). 수동 재배정은 폴백.
    setInterval(() => { try { store.applyMailboxAutoAssign(); } catch (e) { console.error("[dev-erp] 메일 자동배정 오류:", e.message); } }, Number(process.env.DEV_ERP_AUTOSYNC_MS) || 10000);
    // Phase 1: ERP 할일 생성/수정 → 할일_장부 write-through(동기 버튼 없이). 실패는 로그(향후 sync_error 표면화).
    store.afterItemWrite = (id) => {
      try { const r = writeTaskToLedger(store, id, { root }); if (r?.error && r.error !== "item_or_project_missing") console.error("[autosync] write-through 실패:", id, r.error); }
      catch (e) { console.error("[autosync] write-through 오류:", id, e.message); } // TODO: 항목 sync_error 상태 + 재시도(Phase 3)
    };
    // 입력파일: ERP 등록/상태변경 → 입력파일_장부 write-through(같은 양방향 패턴).
    store.afterInputWrite = (id) => {
      try { const r = writeInputToLedger(store, id, { root }); if (r?.error && r.error !== "input_or_project_missing") console.error("[autosync] 입력 write-through 실패:", id, r.error); }
      catch (e) { console.error("[autosync] 입력 write-through 오류:", id, e.message); }
    };
    console.log(`[dev-erp] autosync ON — 할일_장부·입력파일_장부 ↔ ERP 양방향(import 폴링 ${Number(process.env.DEV_ERP_AUTOSYNC_MS) || 10000}ms + write-through). root: ${root}`);
  }
  // 메일 자동 수집: 활성 메일함을 주기적으로 fetch → 원장 → core_mail ingest(수동 버튼과 같은 경로).
  // 기본 OFF(테스트·:memory: 무영향). 켜기: DEV_ERP_MAIL_COLLECT_SEC=<초>(예: 900=15분).
  const mailCollectSec = Number(process.env.DEV_ERP_MAIL_COLLECT_SEC) || 0;
  if (mailCollectSec > 0) {
    const repoRoot = resolve(HERE, "..", "..", "..");
    const collectDbRel = DB_IS_DEFAULT ? "data/dev-erp.db" : DB_PATH;
    setInterval(() => {
      collectAllMailboxes(store, { repoRoot, backendRoot: BACKEND_ROOT, appDir: HERE, dbRel: collectDbRel, log: console.log })
        .catch((e) => console.error("[mail-collect] 자동수집 오류:", e.message));
    }, mailCollectSec * 1000);
    console.log(`[dev-erp] 메일 자동수집 ON: ${mailCollectSec}s 간격`);
  }
  // 아침 브리핑 push v1: 기본 OFF. DEV_ERP_MORNING_BRIEF=1 + 시각 DEV_ERP_MORNING_BRIEF_HHMM(기본 0800).
  // 수신=활성+이메일 계정(도메인 allowlist 게이트), 빈 브리핑(행동 걸이 0건)은 스킵.
  // 완주 판정(적대검토 반영): brief_run 이벤트 to='ok' 면 그날 종료. 실패가 남으면 10분 간격,
  // 하루 3회까지 재시도 — 계정별 morning_brief_sent 멱등이 있어 성공분 이중발송은 없다.
  if (process.env.DEV_ERP_MORNING_BRIEF === "1") {
    const hhmmRaw = process.env.DEV_ERP_MORNING_BRIEF_HHMM || "";
    const hhmm = /^([01]\d|2[0-3])[0-5]\d$/.test(hhmmRaw) ? hhmmRaw : "0800";
    const repoRoot = resolve(HERE, "..", "..", "..");
    setInterval(async () => {
      try { // store 호출 포함 전체 — async setInterval 의 throw 는 unhandled rejection 으로 프로세스를 죽인다
        const now = new Date();
        const nowHHMM = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
        if (nowHHMM < hhmm) return;
        const date = localDateKey(now);
        const runKey = `brief_run:${date}`;
        const attempts = store.queryEvents({ kind: "morning_brief_run", limit: 200 }).filter((e) => e.item_ref === runKey);
        if (attempts.some((e) => e.to_val === "ok")) return;                     // 그날 완주
        if (attempts.length >= 3) return;                                        // 시도 상한
        if (attempts.length && now - new Date(attempts[0].at) < 10 * 60 * 1000) return; // 재시도 간격 10분
        const r = await runMorningBriefCycle(store, {
          todayKey: date, repoRoot, appUrl: process.env.DEV_ERP_PUBLIC_URL || "",
          senderEnvOverride: process.env.DEV_ERP_BRIEF_SENDER_ENV || "", log: console.log,
        });
        const sent = r.results.filter((x) => x.ok).length;
        const failed = r.ok ? r.results.filter((x) => x.ok === false).length : 1;
        store.appendEvent({
          kind: "morning_brief_run", item_ref: runKey, actor_ref: "system", actor_kind: "system", data_label: "real",
          to: failed === 0 ? "ok" : "retry_pending",
          note: `발송 ${sent}, 실패 ${failed}, 스킵 ${r.results.length - sent - failed}, 발신 ${r.sender_env ?? "-"}${r.error ? `, ${r.error}` : ""}`,
        });
        console.log(`[dev-erp] 아침 브리핑 ${date} (시도 ${attempts.length + 1}/3): 발송 ${sent}, 실패 ${failed}${r.error ? ` (${r.error})` : ""}`);
      } catch (e) { console.error("[dev-erp] 아침 브리핑 오류:", e.message); }
    }, 60_000);
    console.log(`[dev-erp] 아침 브리핑 push ON: 매일 ${hhmm}`);
  }
};

let runtimeListener = null;
let shutdownStarted = false;
async function shutdownDevErp(signalName) {
  if (shutdownStarted) return;
  shutdownStarted = true;
  try { runtimeListener?.close?.(); } catch {}
  for (const active of activeCodexTurns.values()) active.controller.abort();
  const deadline = Date.now() + 5000;
  while (activeCodexTurns.size && Date.now() < deadline) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
  try { store.recoverInterruptedCodexTurnAudits(`service_${String(signalName || "shutdown").toLowerCase()}`); } catch {}
  process.exit(0);
}
process.once("SIGINT", () => { void shutdownDevErp("SIGINT"); });
process.once("SIGTERM", () => { void shutdownDevErp("SIGTERM"); });

if (TLS_ENABLED) {
  // 사내망 직접 HTTPS: 한 포트에서 TLS/평문 겸용(polyglot). 첫 바이트 0x16(TLS handshake)이면
  // https 서버로, 아니면 평문 처리기(인증서 다운로드 + https 301)로 넘긴다. 외부 의존성 0 유지(node:tls/net).
  let httpsServer;
  try {
    httpsServer = createHttpsServer({ cert: readFileSync(TLS_CERT_PATH), key: readFileSync(TLS_KEY_PATH) });
  } catch (e) {
    console.error(`[dev-erp] TLS 인증서 로드 실패(${TLS_CERT_PATH}): ${e.message}`);
    process.exit(2);
  }
  httpsServer.on("request", (req, res) => server.emit("request", req, res));
  const isLoopback = (addr) => addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
  const plainHandler = createServer((req, res) => {
    // HTTPS 종단 프록시(Tailscale Serve 등) 뒤: 이미 암호화된 요청이므로 앱으로 직행.
    // 헤더는 위조 가능하므로 loopback 소스(로컬 프록시)에서만 신뢰한다 — LAN 클라이언트의 자발적
    // 다운그레이드 시도는 301 로 되돌린다.
    if (isLoopback(req.socket.remoteAddress) && (req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https") return server.emit("request", req, res);
    const reqPath = (req.url || "/").split("?")[0];
    if (reqPath === "/api/health") {
      // 모니터링 예외(적대검토 확정): watchdog·runtime_ops 등 기존 평문 프로브가 301→자체서명
      // 거부로 영구 실패해 재시작 루프를 만들지 않게, 비민감 health 만 평문 응답 유지.
      return server.emit("request", req, res);
    }
    if (reqPath === "/dev-erp-ca.crt") {
      // 신뢰 등록 부트스트랩. 평문 구간이므로 설치 전 SHA-256 지문 대조가 절차(런북 3.4).
      if (!TLS_TRUST_ANCHOR_PATH) return send(res, 404, "trust anchor distribution blocked: server.crt is CA:TRUE with a live key — follow runbook 3.4 (one-shot local CA, CA:FALSE leaf)", "text/plain");
      res.writeHead(200, { "Content-Type": "application/x-x509-ca-cert", "Content-Disposition": 'attachment; filename="dev-erp-ca.crt"' });
      return res.end(readFileSync(TLS_TRUST_ANCHOR_PATH));
    }
    res.writeHead(301, { Location: `https://${req.headers.host || `${HOST}:${PORT}`}${req.url || "/"}` });
    return res.end();
  });
  const polyglot = createNetServer((socket) => {
    socket.on("error", () => socket.destroy()); // handshake 전 리셋·포트스캔 소음 무해화
    socket.setTimeout(30000, () => socket.destroy()); // 첫 바이트 없이 붙잡는 연결 정리
    socket.once("data", (firstChunk) => {
      socket.setTimeout(0);
      socket.pause();
      socket.unshift(firstChunk);
      (firstChunk[0] === 0x16 ? httpsServer : plainHandler).emit("connection", socket);
      process.nextTick(() => socket.resume());
    });
  });
  runtimeListener = polyglot;
  polyglot.listen(PORT, HOST, onReady);
} else {
  runtimeListener = server;
  server.listen(PORT, HOST, onReady);
}
