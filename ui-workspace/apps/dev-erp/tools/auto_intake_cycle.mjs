#!/usr/bin/env node
// tools/auto_intake_cycle.mjs — 메일→할일 자동 인입 사이클(수집 이후 구간 오케스트레이터).
//   체인: pending(결정적 신규 델타) → LLM 분류(로컬 Ollama, 메타 전용, src/llm.mjs classifyMailForTasks)
//        → mail_to_task_ledger --auto-open --apply(결정적 행 작성, 멱등)
//        → haengbogwan_run --apply-context(줄기 project_context 갱신, 메타 전용)
//   LLM 미가용 기본값: 후보 생성 없이 pending 유지(다음 사이클 재판단, rubric V1) + 줄기 갱신은 수행.
//   DEV_ERP_INTAKE_FALLBACK=deterministic 이면 haengbogwan_run --apply 의 결정적 후보(전건 격리)로 폴백.
//   기본 dry-run(계획·건수만 출력, 쓰기 0). --apply 일 때만 자식 도구에 쓰기 전달.
//   원문·첨부·secret 미접촉(메타 전용). stdout 은 건수·이력키·exit code 만(제목 등 업무 메타 미출력).
//   동시 실행 방지: <data>/auto_intake.lock (stale 15분). 실행 기록: <data>/auto_intake_receipts.jsonl + event_log(meta).
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { classifyMailForTasks, intakeLlmProvider } from "../src/llm.mjs";
import { scanPending } from "./mail_to_task_pending.mjs";

const execFileP = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "..");
const REPO = resolve(HERE, "..", "..", "..", "..");
const LOCK_STALE_MS = 15 * 60 * 1000;

function truthyEnv(name, env = process.env) {
  const v = String(env[name] ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export function parseCycleArgs(argv = process.argv.slice(2), env = process.env) {
  const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d; };
  const has = (n) => argv.includes(`--${n}`);
  const projects = [];
  for (let i = 0; i < argv.length; i += 1) if (argv[i] === "--project" && argv[i + 1] && !argv[i + 1].startsWith("--")) projects.push(argv[i + 1]);
  return {
    apply: has("apply"),
    json: has("json"),
    db: arg("db", "data/dev-erp.db"),
    workmeta: arg("workmeta", join(REPO, "_workmeta")),
    dataDir: arg("data-dir", join(APP, "data")),
    projects,
    limit: Math.max(1, Number(arg("limit", env.DEV_ERP_INTAKE_LIMIT || "12")) || 12),
    provider: arg("provider", intakeLlmProvider(env)),
    fallback: arg("fallback", String(env.DEV_ERP_INTAKE_FALLBACK ?? "skip").trim().toLowerCase() === "deterministic" ? "deterministic" : "skip"),
    knowledge: has("knowledge") || truthyEnv("DEV_ERP_INTAKE_KNOWLEDGE", env),
    skipContext: has("skip-context"),
    runId: arg("run-id", `auto_intake_${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}`),
  };
}

// 단순 파일 락(단일 호스트용). 손상/정지 대비 stale 15분 후 탈취.
export function acquireLock(dataDir, { now = Date.now() } = {}) {
  mkdirSync(dataDir, { recursive: true });
  const lockPath = join(dataDir, "auto_intake.lock");
  const payload = JSON.stringify({ pid: process.pid, at: now });
  try {
    writeFileSync(lockPath, payload, { flag: "wx" });
    return lockPath;
  } catch {
    try {
      const prev = JSON.parse(readFileSync(lockPath, "utf8"));
      if (now - Number(prev?.at ?? 0) > LOCK_STALE_MS) { writeFileSync(lockPath, payload); return lockPath; }
    } catch { /* 깨진 락은 탈취 */ writeFileSync(lockPath, payload); return lockPath; }
    return null;
  }
}

export function releaseLock(lockPath) {
  try { if (lockPath && existsSync(lockPath)) unlinkSync(lockPath); } catch { /* noop */ }
}

function defaultExec(cmd, args, { timeout }) {
  return execFileP(cmd, args, { cwd: APP, timeout, maxBuffer: 8 * 1024 * 1024 });
}

// 사이클 본체. deps 주입(테스트: exec/classify 모킹). 각 단계는 독립 try/catch — 한 단계 실패가 전체를 막지 않는다.
export async function runCycle(opts, deps = {}) {
  const exec = deps.exec ?? defaultExec;
  const classify = deps.classify ?? classifyMailForTasks;
  const started = Date.now();
  const summary = {
    ok: true, run_id: opts.runId, apply: opts.apply, provider: opts.provider, fallback: opts.fallback,
    pending_total: 0, judged: 0, candidate_count: 0,
    skipped: { not_task: 0, llm_error: 0, busy: 0 },
    ledger: {}, context: null, errors: [], body_access: "metadata_only",
  };

  // 1) pending 델타(결정적, 메일 메타만)
  let scanned = [];
  try {
    scanned = scanPending(opts.workmeta, {});
    if (opts.projects.length) scanned = scanned.filter((s) => opts.projects.includes(s.project));
    scanned = scanned.map((s) => ({ project: s.project, pending: s.pending.slice(0, opts.limit) }));
    summary.pending_total = scanned.reduce((a, s) => a + s.pending.length, 0);
  } catch (e) { summary.errors.push(`pending:${String(e?.message ?? e).slice(0, 120)}`); }

  // 2) LLM 분류(프로젝트별) — provider none 이면 전건 보류
  const perProject = [];
  for (const s of scanned) {
    if (!s.pending.length) continue;
    try {
      const r = await classify(s.pending, { provider: opts.provider, maxItems: opts.limit });
      summary.judged += r.judged ?? 0;
      for (const skip of r.skipped ?? []) {
        if (skip.reason === "not_task") summary.skipped.not_task += 1;
        else if (skip.reason === "busy") summary.skipped.busy += 1;
        else summary.skipped.llm_error += 1;
      }
      const keys = Object.keys(r.candidates ?? {});
      if (keys.length) perProject.push({ project: s.project, candidates: r.candidates, keys });
      summary.candidate_count += keys.length;
    } catch (e) { summary.errors.push(`classify:${s.project}:${String(e?.message ?? e).slice(0, 120)}`); }
  }

  // 3) 장부 작성(결정적 엔진 위임, 멱등) — apply 일 때만 자식 실행
  for (const p of perProject) {
    if (!opts.apply) { summary.ledger[p.project] = { planned: p.keys.length }; continue; }
    try {
      const tmpDir = join(opts.dataDir, "tmp");
      mkdirSync(tmpDir, { recursive: true });
      const candFile = join(tmpDir, `auto_intake_${p.project}_${opts.runId}.json`);
      writeFileSync(candFile, JSON.stringify(p.candidates, null, 2));
      const args = ["tools/mail_to_task_ledger.mjs", "--project", p.project, "--candidates", candFile,
        "--db", opts.db, "--workmeta", opts.workmeta, "--auto-open", "--run-id", opts.runId, "--apply"];
      await exec("node", args, { timeout: 60000 });
      summary.ledger[p.project] = { applied: p.keys.length, exit: 0 };
    } catch (e) {
      summary.ledger[p.project] = { error: String(e?.message ?? e).slice(0, 160) };
      summary.errors.push(`ledger:${p.project}`);
    }
  }

  // 4) 줄기 갱신(+ 선택: 결정적 폴백 후보). haengbogwan_run 은 메타 전용이며 dry-run 이 기본이라
  //    apply 플래그를 우리 opts.apply 에 종속시킨다. LLM 미가용이어도 줄기는 자란다.
  if (!opts.skipContext) {
    const useDeterministic = opts.fallback === "deterministic" && summary.candidate_count === 0 && summary.judged === 0;
    const args = ["tools/haengbogwan_run.mjs", "--db", opts.db, "--workmeta-root", opts.workmeta, "--json"];
    for (const code of opts.projects) args.push("--project", code);
    if (opts.apply) {
      args.push("--apply-context");
      if (opts.knowledge) args.push("--apply-knowledge-candidates");
      if (useDeterministic) args.push("--apply", "--auto-open");
    }
    try {
      const { stdout } = await exec("node", args, { timeout: 180000 });
      let totals = null;
      try { totals = JSON.parse(String(stdout))?.totals ?? null; } catch { /* 텍스트 모드 무시 */ }
      summary.context = {
        exit: 0, deterministic_fallback: useDeterministic,
        accepted_events: totals?.context_accepted_event_count ?? null,
        knowledge_appended: totals?.knowledge_candidate_appended_count ?? null,
        fallback_candidates: useDeterministic ? (totals?.candidate_count ?? null) : 0,
      };
    } catch (e) {
      summary.context = { error: String(e?.message ?? e).slice(0, 160), deterministic_fallback: useDeterministic };
      summary.errors.push("context");
    }
  }

  summary.ok = summary.errors.length === 0;
  summary.elapsed_ms = Date.now() - started;

  // 5) 실행 기록(메타만): receipts JSONL + event_log. 실패해도 사이클 결과에는 영향 없음.
  if (opts.apply) {
    try {
      mkdirSync(opts.dataDir, { recursive: true });
      appendFileSync(join(opts.dataDir, "auto_intake_receipts.jsonl"), `${JSON.stringify({ at: new Date().toISOString(), ...summary })}\n`);
    } catch { /* noop */ }
    if (deps.appendEvent !== null) {
      try {
        const dbPath = /^([A-Za-z]:[\\/]|\/)/.test(opts.db) ? opts.db : resolve(APP, opts.db);
        if (existsSync(dbPath)) {
          const { openStore } = await import("../src/store.mjs");
          const s = openStore(dbPath);
          s.appendEvent({
            actor_ref: "erp", actor_kind: "ai", kind: "auto_intake_run",
            used_refs: ["mail_to_task_classify", "haengbogwan_run", `run:${opts.runId}`], data_label: "meta",
            note: `provider=${summary.provider} pending=${summary.pending_total} judged=${summary.judged} candidates=${summary.candidate_count} not_task=${summary.skipped.not_task} errors=${summary.errors.length}`,
          });
          s.db.close();
        }
      } catch { /* DB 미가용은 무시(수집 PC 밖 standalone 실행 허용) */ }
    }
  }
  return summary;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const opts = parseCycleArgs();
  const lock = acquireLock(opts.dataDir);
  if (!lock) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: "already_running" })}\n`);
    process.exitCode = 1;
  } else {
    try {
      const summary = await runCycle(opts);
      if (opts.json) process.stdout.write(`${JSON.stringify(summary)}\n`);
      else process.stdout.write(`# auto intake ${summary.apply ? "apply" : "dry-run"} provider=${summary.provider} pending=${summary.pending_total} judged=${summary.judged} candidates=${summary.candidate_count} not_task=${summary.skipped.not_task} errors=${summary.errors.join(",") || "none"} ${summary.elapsed_ms}ms\n`);
      process.exitCode = summary.ok ? 0 : 1;
    } catch (e) {
      process.stderr.write(`[auto_intake_cycle] ${String(e?.message ?? e)}\n`);
      process.exitCode = 2;
    } finally {
      releaseLock(lock);
    }
  }
}
