import { spawn, spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { homedir } from "node:os";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, extname, join } from "node:path";

// 근본 원인 self-heal: codex-cli(현재 버전)는 service_tier 가 fast/flex 만 허용한다. 호스트 전역 ~/.codex/config.toml 에
// priority 등 미지원 값이 있으면 codex 가 config 를 '먼저' 파싱하다 죽어, ERP 의 -c service_tier override 도 닿지 못한다
// (그래서 DEV_ERP_CODEX_SERVICE_TIER override 만으로는 안 막혔고 매번 재발). codex 실행 직전에 그 줄만 주석 중립화(idempotent).
export function sanitizeCodexConfigServiceTier(configPath) {
  const path = configPath || join(homedir(), ".codex", "config.toml");
  try {
    if (!existsSync(path)) return { ok: true, changed: 0 };
    const src = readFileSync(path, "utf8");
    const re = /^(\s*)(service_tier|default-service-tier)\s*=\s*"?([^"\s#]+)/;
    let changed = 0;
    const out = src.split(/\r?\n/).map((ln) => {
      const m = re.exec(ln);
      if (!m) return ln;                                   // 무관 줄·이미 주석(#)인 줄은 그대로
      if (m[3] === "fast" || m[3] === "flex") return ln;   // 유효값 유지
      changed++;
      return `# ${ln}  # auto: codex-cli 미지원 tier(fast|flex만) — dev-erp 중립화`;
    });
    if (changed) writeFileSync(path, out.join("\n"), "utf8");
    return { ok: true, changed, path };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

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
function codexSandboxPolicy(mode = CODEX_SANDBOX_MODE) {
  if (mode === "danger-full-access") return { type: "dangerFullAccess" };
  if (mode === "workspace-write") return { type: "workspaceWrite", networkAccess: true };
  return { type: "readOnly", networkAccess: true };
}
// 대화별 권한: 유효 sandbox 모드 정규화. per-chat 토글이 주는 값(override)을 우선, 없으면 서버 기본(env).
function resolveSandboxMode(override) {
  const v = String(override ?? "").trim();
  return ["read-only", "workspace-write", "danger-full-access"].includes(v) ? v : CODEX_SANDBOX_MODE;
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

export function windowsCodexDirectSpawnSpec(commandPath, appServerArgs = buildCodexAppServerArgs()) {
  const raw = String(commandPath ?? "").trim();
  if (!raw) return null;
  const ext = extname(raw).toLowerCase();
  const shimPath = ext ? raw : (existsSync(`${raw}.cmd`) ? `${raw}.cmd` : raw);
  const shimExt = extname(shimPath).toLowerCase();
  if (shimExt === ".cmd" || shimExt === ".bat") {
    const jsPath = join(dirname(shimPath), "node_modules", "@openai", "codex", "bin", "codex.js");
    if (!existsSync(jsPath)) return null;
    const localNode = join(dirname(shimPath), "node.exe");
    return { command: existsSync(localNode) ? localNode : "node", args: [jsPath, ...appServerArgs], direct: true };
  }
  if (shimExt === ".exe") return { command: shimPath, args: appServerArgs, direct: true };
  return null;
}

function resolveWindowsCodexDirectSpawnSpec(appServerArgs) {
  const raw = String(CODEX_BIN || "").trim();
  const candidates = [];
  const seen = new Set();
  const add = (value) => {
    const s = String(value || "").trim();
    if (!s || seen.has(s.toLowerCase())) return;
    seen.add(s.toLowerCase());
    candidates.push(s);
  };
  add(raw);
  if (raw && !/[\\/:]/.test(raw)) {
    try {
      const found = spawnSync("where.exe", [raw], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"], timeout: 5000 });
      if (!found.error && found.status === 0) {
        for (const line of String(found.stdout || "").split(/\r?\n/)) add(line);
      }
    } catch {}
  } else if (raw && !extname(raw)) {
    add(`${raw}.cmd`);
    add(`${raw}.exe`);
  }
  for (const candidate of candidates) {
    const spec = windowsCodexDirectSpawnSpec(candidate, appServerArgs);
    if (spec) return spec;
  }
  return null;
}

function codexAppServerSpawnSpec() {
  const appServerArgs = buildCodexAppServerArgs();
  if (process.platform !== "win32") return { command: CODEX_BIN, args: appServerArgs };
  const direct = resolveWindowsCodexDirectSpawnSpec(appServerArgs);
  if (direct) return direct;
  return {
    command: "cmd.exe",
    args: ["/d", "/s", "/c", [CODEX_BIN, ...appServerArgs].map(quoteCmdArg).join(" ")],
  };
}

export function codexAppServerProcessTreeKillSpec(pid, platform = process.platform) {
  const n = Number(pid);
  if (platform !== "win32" || !Number.isInteger(n) || n <= 0) return null;
  return { command: "taskkill.exe", args: ["/pid", String(n), "/T", "/F"] };
}

export function stopCodexAppServerProcess(child, { platform = process.platform, spawnSyncImpl = spawnSync, preferChildKill = false } = {}) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return false;
  if (preferChildKill) {
    try { if (child.kill()) return true; } catch {}
  }
  const killSpec = codexAppServerProcessTreeKillSpec(child.pid, platform);
  if (killSpec) {
    try {
      const result = spawnSyncImpl(killSpec.command, killSpec.args, { windowsHide: true, stdio: "ignore", timeout: 5000 });
      if (!result?.error && (result?.status === 0 || result?.status === null)) return true;
    } catch {}
  }
  try { return !!child.kill(); } catch { return false; }
}

export function buildTaskThreadTitle(item) {
  const project = String(item?.project_id || "INBOX").trim() || "INBOX";
  const title = String(item?.title || "untitled").replace(/\s+/g, " ").trim() || "untitled";
  return `[${project}] ${title}`;
}

export function buildTaskDeveloperInstructions(item) {
  const lines = [
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
  ];
  // 담당자별 메모리(업무 스타일·규칙) — 서버가 item.assignee_memory 로 주입. 사람마다 다른 규칙을 시작부터 들고 감.
  if (item?.assignee_memory && String(item.assignee_memory).trim()) {
    lines.push("", `담당자(${item?.assignee_ref ?? ""}) 업무 메모리/규칙 — 이 담당자의 작업 방식으로 따르라:`, String(item.assignee_memory).trim());
  }
  return lines.join("\n");
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
  sandboxMode = null,
} = {}) {
  if (mode === "mock") {
    return runMockTaskTurn({ threadId, threadTitle, item, userMessage, initial });
  }
  if (mode !== "app-server") throw new Error(`unsupported_codex_task_bridge_mode:${mode}`);
  return runCodexAppServerTurn({ threadId, threadTitle, cwd, item, userMessage, initial, timeoutMs, model, effort, serviceTier, skills, localImages, sandboxMode });
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

function runCodexAppServerTurn({ threadId, threadTitle, cwd, item, userMessage, initial, timeoutMs, model, effort, serviceTier, skills, localImages, sandboxMode = null }) {
  const sbMode = resolveSandboxMode(sandboxMode); // 대화별 토글 우선, 없으면 서버 기본
  return new Promise((resolve, reject) => {
    sanitizeCodexConfigServiceTier(); // 실행 직전 호스트 config 의 미지원 tier(priority 등) 자동 중립화 → "unknown variant" 파싱오류 구조적 방지
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
      stopCodexAppServerProcess(child, { preferChildKill: spec.direct === true });
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
          sandbox: sbMode,
          developerInstructions,
        });
      } else {
        const started = await request("thread/start", {
          cwd,
          approvalPolicy: CODEX_APPROVAL_POLICY,
          sandbox: sbMode,
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
        sandboxPolicy: codexSandboxPolicy(sbMode),
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
