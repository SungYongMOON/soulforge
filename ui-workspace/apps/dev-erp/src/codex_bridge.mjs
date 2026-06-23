import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

export const CODEX_TASK_BRIDGE_VERSION = Object.freeze({
  release: "v0.2.1",
  source: "src/codex_bridge.mjs",
});

const CLIENT_INFO = Object.freeze({
  name: "dev_erp_codex_task_bridge",
  title: "dev-ERP Codex Task Bridge",
  version: CODEX_TASK_BRIDGE_VERSION.release,
});

const CODEX_BIN = process.env.DEV_ERP_CODEX_BIN || "codex";

// 채팅 Codex 세션의 샌드박스/승인 정책. 기본은 안전(read-only·never) — owner가 DEV_ERP_CODEX_SANDBOX 를
// 명시적으로 켤 때만 로컬 실행/파일 쓰기 허용(Outlook 실행 등). 값:
//   read-only(기본): 저장소 읽기+네트워크만, 로컬 실행/쓰기 불가
//   workspace-write: 작업 폴더 쓰기 + 명령 실행 가능(블래스트 반경=ERP 폴더)
//   danger-full-access: 전체 접근(가드 없음)
// ⚠ 채팅에 메일 등 외부 내용이 섞이므로, 풀수록 프롬프트 인젝션→임의 명령 실행 위험이 커진다. 필요할 때만 켜고 끝나면 read-only 로 되돌릴 것.
const CODEX_SANDBOX_MODE = ["read-only", "workspace-write", "danger-full-access"].includes(String(process.env.DEV_ERP_CODEX_SANDBOX || "").trim())
  ? String(process.env.DEV_ERP_CODEX_SANDBOX).trim() : "read-only";
const CODEX_APPROVAL_POLICY = ["never", "on-request", "on-failure", "untrusted"].includes(String(process.env.DEV_ERP_CODEX_APPROVAL || "").trim())
  ? String(process.env.DEV_ERP_CODEX_APPROVAL).trim() : "never";
function codexSandboxPolicy() {
  if (CODEX_SANDBOX_MODE === "danger-full-access") return { type: "dangerFullAccess" };
  if (CODEX_SANDBOX_MODE === "workspace-write") return { type: "workspaceWrite", networkAccess: true };
  return { type: "readOnly", networkAccess: true };
}

function quoteCmdArg(value) {
  const s = String(value);
  return /[\s"&|<>^]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s;
}

export function codexAppServerServiceTierOverride(serviceTier) {
  const tier = cleanTurnOption(serviceTier, new Set(["fast", "flex"]));
  return tier === "fast" ? tier : null;
}

export function buildCodexAppServerArgs({ serviceTier = process.env.DEV_ERP_CODEX_SERVICE_TIER || "" } = {}) {
  const args = ["app-server"];
  const tier = codexAppServerServiceTierOverride(serviceTier);
  if (tier) args.push("-c", `service_tier=${tier}`);
  return args;
}

function codexAppServerSpawnSpec() {
  const appServerArgs = buildCodexAppServerArgs();
  if (process.platform !== "win32") return { command: CODEX_BIN, args: appServerArgs };
  return {
    command: "cmd.exe",
    args: ["/d", "/s", "/c", [CODEX_BIN, ...appServerArgs].map(quoteCmdArg).join(" ")],
  };
}

export function buildTaskThreadTitle(item) {
  const project = String(item?.project_id || "INBOX").trim() || "INBOX";
  const title = String(item?.title || "untitled").replace(/\s+/g, " ").trim() || "untitled";
  return `[${project}] ${title}`;
}

export function buildTaskDeveloperInstructions(item) {
  return [
    "You are attached to an ERP task thread.",
    "Default to concise Korean responses for this ERP task UI.",
    "Use only the task metadata below unless the user explicitly provides more context.",
    "Do not claim raw mail, attachment, or private source contents were provided.",
    "The visible user messages in Codex should stay clean; do not echo this metadata block unless the user asks for it.",
    "",
    "ERP task metadata:",
    `- item_id: ${item?.id ?? ""}`,
    `- project_id: ${item?.project_id ?? ""}`,
    `- title: ${item?.title ?? ""}`,
    `- status: ${item?.status ?? ""}`,
    `- due: ${item?.due ?? ""}`,
    `- assignee_ref: ${item?.assignee_ref ?? ""}`,
    `- work_type: ${item?.work_type ?? ""}`,
    `- link_kind: ${item?.link_kind ?? ""}`,
    `- link_ref: ${item?.link_ref ?? ""}`,
    `- completion_criteria: ${item?.completion_criteria ?? ""}`,
  ].join("\n");
}

export function buildTaskPrompt(item, userMessage, { initial = false } = {}) {
  if (initial) return "이 ERP 할일 스레드를 열었습니다. 짧게 확인하고 다음 지시를 기다려주세요.";
  return String(userMessage ?? "").trim();
}

export function buildCodexTurnInput({ text, skills = [], localImages = [] } = {}) {
  const input = [];
  for (const skill of skills || []) {
    if (!skill?.name || !skill?.path) continue;
    input.push({ type: "skill", name: String(skill.name), path: String(skill.path) });
  }
  input.push({ type: "text", text: String(text ?? ""), text_elements: [] });
  for (const image of localImages || []) {
    if (!image?.path) continue;
    input.push({ type: "localImage", path: String(image.path) });
  }
  return input;
}

function cleanTurnOption(value, allowed = null) {
  const s = String(value ?? "").trim();
  if (!s) return null;
  if (allowed && !allowed.has(s)) return null;
  return s;
}

export async function runCodexTaskTurn({
  mode = "app-server",
  threadId = null,
  threadTitle,
  cwd,
  item,
  userMessage,
  initial = false,
  timeoutMs = 120000,
  model = null,
  effort = null,
  serviceTier = null,
  skills = [],
  localImages = [],
} = {}) {
  if (mode === "mock") {
    return runMockTaskTurn({ threadId, threadTitle, item, userMessage, initial });
  }
  if (mode !== "app-server") throw new Error(`unsupported_codex_task_bridge_mode:${mode}`);
  return runCodexAppServerTurn({ threadId, threadTitle, cwd, item, userMessage, initial, timeoutMs, model, effort, serviceTier, skills, localImages });
}

function runMockTaskTurn({ threadId, threadTitle, item, userMessage, initial }) {
  const id = threadId || `mock_${item.id}`;
  const text = initial
    ? `TEST 연결됨: ${threadTitle}\n\n이 창은 ERP 서버가 할일 ${item.id}에 연결한 Codex 스레드 자리입니다.`
    : `TEST 응답: ${String(userMessage ?? "").trim() || "(빈 메시지)"}\n\n실제 서버에서는 이 자리에 Codex 스레드 응답이 들어옵니다.`;
  return Promise.resolve({
    ok: true,
    mode: "mock",
    threadId: id,
    text,
    created: !threadId,
  });
}

function runCodexAppServerTurn({ threadId, threadTitle, cwd, item, userMessage, initial, timeoutMs, model, effort, serviceTier, skills, localImages }) {
  return new Promise((resolve, reject) => {
    const spec = codexAppServerSpawnSpec();
    const child = spawn(spec.command, spec.args, {
      cwd,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const pending = new Map();
    const stdoutNoise = [];
    let stderr = "";
    let nextId = 1;
    let settled = false;
    let activeThreadId = threadId || null;
    let responseText = "";
    let completionPayload = null;
    const events = [];

    const cleanup = () => {
      clearTimeout(timer);
      for (const [, p] of pending) p.reject(new Error("codex_app_server_closed"));
      pending.clear();
      try { child.kill(); } catch {}
    };
    const finish = (result) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    const fail = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };
    const timer = setTimeout(() => fail(new Error(`codex_app_server_timeout:${timeoutMs}`)), timeoutMs);

    const sendMessage = (message) => {
      child.stdin.write(`${JSON.stringify(message)}\n`);
    };
    const request = (method, params = {}) => {
      const id = nextId++;
      sendMessage({ id, method, params });
      return new Promise((resolveRequest, rejectRequest) => {
        pending.set(id, { resolve: resolveRequest, reject: rejectRequest, method });
      });
    };
    const notify = (method, params = {}) => {
      sendMessage({ method, params });
    };
    const handleNotification = (method, params = {}) => {
      if (method === "item/started" || method === "item/completed") {
        events.push({
          method,
          threadId: params?.threadId || null,
          type: params?.item?.type || null,
          status: params?.item?.status || params?.item?.state?.status || null,
          title: params?.item?.title || params?.item?.name || params?.item?.toolName || null,
        });
      }
      if (method === "item/agentMessage/delta") {
        if (params?.threadId && activeThreadId && params.threadId !== activeThreadId) return;
        responseText += params.delta || "";
      }
      if (method === "turn/completed") {
        if (params?.threadId && activeThreadId && params.threadId !== activeThreadId) return;
        completionPayload = params;
        const finalText = responseText.trim() || extractAgentMessageText(params.turn).trim();
        finish({
          ok: true,
          mode: "app-server",
          threadId: activeThreadId,
          text: finalText || "Codex turn completed.",
          created: !threadId,
          turn: completionPayload?.turn ?? null,
          events,
        });
      }
      if (method === "error") {
        const msg = params?.message || params?.error?.message || JSON.stringify(params);
        fail(new Error(`codex_app_server_error:${msg}`));
      }
    };

    createInterface({ input: child.stdout }).on("line", (line) => {
      if (!line.trim()) return;
      let msg;
      try { msg = JSON.parse(line); }
      catch { stdoutNoise.push(line); return; }
      if (msg.id != null) {
        const p = pending.get(msg.id);
        if (!p) return;
        pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else p.resolve(msg.result);
        return;
      }
      if (msg.method) handleNotification(msg.method, msg.params || {});
    });
    child.stderr.on("data", (buf) => { stderr += buf.toString(); });
    child.on("error", fail);
    child.on("exit", (code) => {
      if (settled) return;
      const detail = [stderr.trim(), stdoutNoise.join("\n").trim()].filter(Boolean).join("\n");
      const msg = detail || `exit_code:${code}`;
      fail(new Error(`codex_app_server_failed:${msg}`));
    });

    (async () => {
      await request("initialize", { clientInfo: CLIENT_INFO, capabilities: { experimentalApi: true } });
      notify("initialized", {});
      const developerInstructions = buildTaskDeveloperInstructions(item);
      const selectedModel = cleanTurnOption(model);
      const selectedEffort = cleanTurnOption(effort, new Set(["none", "minimal", "low", "medium", "high", "xhigh"]));
      const selectedTier = codexAppServerServiceTierOverride(serviceTier);
      if (activeThreadId) {
        await request("thread/resume", {
          threadId: activeThreadId,
          cwd,
          approvalPolicy: CODEX_APPROVAL_POLICY,
          sandbox: CODEX_SANDBOX_MODE,
          developerInstructions,
        });
      } else {
        const started = await request("thread/start", {
          cwd,
          approvalPolicy: CODEX_APPROVAL_POLICY,
          sandbox: CODEX_SANDBOX_MODE,
          developerInstructions,
          serviceName: "dev-erp",
          threadSource: "user",
          ...(selectedModel ? { model: selectedModel } : {}),
          ...(selectedTier ? { serviceTier: selectedTier } : {}),
        });
        activeThreadId = started?.thread?.id;
        if (!activeThreadId) throw new Error("codex_thread_id_missing");
        if (threadTitle) await request("thread/name/set", { threadId: activeThreadId, name: threadTitle });
      }
      const prompt = buildTaskPrompt(item, userMessage, { initial });
      const turnParams = {
        threadId: activeThreadId,
        cwd,
        approvalPolicy: CODEX_APPROVAL_POLICY,
        sandboxPolicy: codexSandboxPolicy(),
        input: buildCodexTurnInput({ text: prompt, skills, localImages }),
        ...(selectedModel ? { model: selectedModel } : {}),
        ...(selectedEffort ? { effort: selectedEffort } : {}),
        ...(selectedTier ? { serviceTier: selectedTier } : {}),
      };
      await request("turn/start", turnParams);
    })().catch(fail);
  });
}

function extractAgentMessageText(turn) {
  const items = Array.isArray(turn?.items) ? turn.items : [];
  return items
    .filter((item) => item?.type === "agentMessage" && typeof item.text === "string")
    .map((item) => item.text)
    .join("\n\n");
}
