/**
 * agent_write_boundary.mjs — paths no automated agent may write.
 *
 * `dev_worker` bounds an agent by the packet's own `allowed_write_paths`. That is
 * a per-packet fence, and a fence a packet declares is a fence a packet can move:
 * nothing stops a packet from naming the very files that decide what the agent is
 * allowed to do. No bad intent is required for that to happen - "the check keeps
 * failing" is the ordinary road to a widened fence, and an agent whose success is
 * measured by green checks has every reason to take it.
 *
 * So this list sits outside the packet. It is checked in addition to
 * `allowed_write_paths`, never instead of it, and it cannot be satisfied by a
 * packet declaring anything at all.
 *
 * ## Why these paths
 *
 * Each entry decides what an agent may do, or proves what it did. An agent that
 * can edit them can widen its own authority or make a failed change look like a
 * successful one - which is a different class of risk from an ordinary bug, and
 * the reason this file exists rather than a comment in a prompt.
 *
 * ## Where this file lives
 *
 * `guild_hall/shared/`, deliberately - it must be outside `guild_hall/dev_worker/`,
 * which the auto-approval policy lists as a safe path. A deny list the agent may
 * auto-approve edits to is not a deny list.
 *
 * ## What this is not
 *
 * Not a security boundary against a hostile actor: an agent that can run arbitrary
 * commands is not stopped by a list. It is a guard against the ordinary drift of
 * an agent widening its own fence while trying to finish its work, which is the
 * failure this codebase actually has to survive.
 */

export const AGENT_WRITE_BOUNDARY_SCHEMA = "soulforge.agent_write_boundary.v1";

/**
 * Prefixes and exact files an automated agent may never write. A prefix ending in
 * `/` denies the whole subtree; anything else is an exact path.
 */
export const AGENT_DENIED_WRITE_PATHS = Object.freeze([
  // 자기 복구가 무엇을 할 수 있는지 정하는 목록과 그 진단·감독 축.
  { path: "guild_hall/watchtower/health_recovery_coordinator.mjs", why: "recovery action allowlist" },
  { path: "guild_hall/watchtower/recovery_diagnostics.mjs", why: "diagnostic and disposition table" },
  { path: "guild_hall/watchtower/recovery_supervision.mjs", why: "circuit breaker and history bounds" },
  { path: "guild_hall/watchtower/alert_policy.mjs", why: "what reaches a person at all" },

  // 어디에 쓸 수 있는지를 정하는 축.
  { path: "guild_hall/path_registry/", why: "which roots may be written" },
  { path: "guild_hall/shared/agent_write_boundary.mjs", why: "this list itself" },
  { path: "guild_hall/shared/soulforge_state_root.mjs", why: "which state root every writer resolves" },

  // 에이전트 자신의 권한 정책.
  { path: "guild_hall/dev_worker/candidate_queue.mjs", why: "auto-approval policy" },
  { path: "guild_hall/dev_worker/claim_task.mjs", why: "packet eligibility gate" },
  { path: "guild_hall/dev_worker/automations/", why: "the agent's own prompt and schedule" },
  ...["feedback_cycle", "feedback_linear_source", "feedback_request_provider", "feedback_worktree_runner",
    "feedback_watchdog", "feedback_polling"].flatMap(name => [
    { path: `guild_hall/dev_worker/${name}.mjs`, why: "continuous developer authority, execution, budget or independent supervision" },
    { path: `guild_hall/dev_worker/${name}.test.mjs`, why: "continuous developer authority regression proof" },
  ]),
  ...["feedback_runtime.mjs", "feedback_runtime_cli.mjs", "feedback_runtime_io.mjs",
    "feedback_runtime_source.mjs", "feedback_publication_currentness.mjs", "feedback_runtime_model.mjs", "feedback_runtime_acp.mjs",
    "feedback_runtime_validator.mjs", "feedback_runtime_stage.mjs", "feedback_runtime.test.mjs",
    "feedback_runtime_model.test.mjs", "feedback_runtime_acp.test.mjs", "feedback_runtime_validator.test.mjs",
    "feedback_runtime_stage.test.mjs", "feedback_runtime_review.test.mjs", "FEEDBACK_RUNTIME.md"].map(name => ({
    path: `guild_hall/dev_worker/${name}`, why: "continuous developer runtime authority and its verification contract",
  })),

  // 무엇이 위반인지 판정하는 검사기. 이것을 고칠 수 있으면 위반이 사라진다.
  ...["feedback_readbox.mjs", "feedback_dispatch.mjs", "feedback_readbox_cli.mjs", "feedback_readbox_stage.mjs",
    "feedback_buzz_bridge.py", "feedback_buzz_bridge_install.py", "FEEDBACK_READBOX.md",
    "feedback_readbox.test.mjs", "feedback_dispatch.test.mjs", "feedback_readbox_fixture.mjs",
    "feedback_readbox_native_fixture.py", "feedback_readbox_native_integration.test.mjs", "test_feedback_buzz_bridge.py",
    "feedback_restore.test.mjs", "feedback_readbox_history.test.mjs"].map(name => ({
    path: `guild_hall/dev_worker/${name}`, why: "manager read authority and independent delivery proof",
  })),
  ...["server.mjs", "src/feedback_readbox_http.mjs", "src/feedback_readbox_view.mjs",
    "test/feedback_readbox_http.test.mjs", "test/feedback_readbox_server.test.mjs", "test/feedback_recovery.test.mjs"].map(name => ({
    path: `ui-workspace/apps/dev-erp/${name}`, why: "manager read authority and server integration proof",
  })),
  ...["src/buzz_pilot_owner_attention.mjs", "src/buzz_pilot_auth_source.mjs",
    "src/owner_attention_source.mjs", "src/owner_attention_service.mjs", "src/owner_attention_http.mjs",
    "src/owner_attention_buzz_link.mjs", "test/buzz_pilot_owner_attention.test.mjs",
    "test/buzz_pilot_owner_attention_server.test.mjs", "test/buzz_pilot_auth_source.test.mjs",
    "test/owner_attention_source.test.mjs", "test/owner_attention_service.test.mjs", "test/owner_attention_http.test.mjs"].map(name => ({
    path: `ui-workspace/apps/dev-erp/${name}`, why: "exact Owner question authority, reversible preferences and delivery evidence",
  })),
  ...["g2_linear_custody_reader.mjs", "g2_linear_custody_cli.mjs", "G2_LINEAR_CUSTODY.md",
    "g2_feedback_publisher.mjs", "feedback_currentness_contract.mjs", "feedback_currentness_transport.mjs",
    "sfx.mjs", "execution_authority.mjs", "src/soulforge_secure_work/launch_runtime.py", "src/soulforge_secure_work/ipc_pipe.py",
    "src/soulforge_secure_work/feedback_currentness_pipe.py", "src/soulforge_secure_work/feedback_prepare.py",
    "src/soulforge_secure_work/feedback_verify.py", "tests/g2_feedback_publisher.test.mjs",
    "tests/feedback_currentness_transport.test.mjs", "G2_FEEDBACK_PUBLISHER.md",
    "tests/g2_linear_custody.test.mjs"].map(name => ({
    path: `guild_hall/secure_work/${name}`, why: "current SOURCE custody authority and its proof",
  })),
  ...["adapter", "context", "documents", "evaluation", "http", "io", "judge", "linear", "rule_profile", "runtime", "source", "store"].flatMap(name => [
    { path: `ui-workspace/apps/dev-erp/src/work_intake_${name}.mjs`, why: "released input, current project authority and work candidate evidence" },
    { path: `ui-workspace/apps/dev-erp/test/work_intake_${name}.test.mjs`, why: "work candidate authority regression proof" },
  ]),
  ...["tools/work_intake_cli.mjs", "tools/work_intake_stage.mjs", "tools/work_intake_packet_reader.py",
    "test/test_work_intake_packet_reader.py", "test/work_intake_server.test.mjs", "test/work_intake_recovery.test.mjs",
    "docs/WORK_INTAKE_RUNTIME.md", "docs/WORK_INTAKE_SHADOW_ADAPTER.md"].map(name => ({
    path: `ui-workspace/apps/dev-erp/${name}`, why: "work intake launch, release verification and installation contract",
  })),
  { path: "guild_hall/validate/", why: "the validators that decide what counts as a violation" },

  // 어떤 바이트가 운영에 도달하는지 정하는 조립 도구. 저장소 안의 코드는
  // 이것을 통과해야만 실행되므로, 여기를 고칠 수 있으면 검증 전체를 우회할 수 있다.
  { path: "guild_hall/deployment_pack/tools/", why: "what bytes reach a running lane at all" },

  // 실행 계약과 라우터. 규칙 자체.
  { path: "AGENTS.md", why: "the agent instruction router" },
  { path: "docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md", why: "the execution contract" },

  // 비밀·private 평면. 애초에 열람도 금지지만 명시해 둔다.
  { path: "private-state/", why: "cross-project protected state" },
  { path: "_workspaces/", why: "canonical or legacy working data is not automated source repair" },
  { path: "_workmeta/", why: "metadata lineage is not automated source repair" },
  { path: ".git/", why: "repository control metadata and hooks" },
  { path: ".github/workflows/", why: "CI that runs with repository credentials" },
]);

function normalize(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  return value.trim().replaceAll("\\", "/").replace(/^\.\//u, "") || ".";
}

function comparisonScope(value) {
  const normalized = normalize(value);
  if (!normalized) return "";
  if (normalized === "." || normalized === "/") return ".";
  // A cross-platform scope cannot silently normalize into another file/root.
  // An invalid scope conservatively intersects every protected entry.
  if (normalized.startsWith("/") || /[\u0000-\u001f\u007f:]/u.test(normalized)
    || normalized.includes("//") || normalized.split("/").some(segment => segment === "." || segment === ".."
      || /[. ]$/u.test(segment) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(segment))) return ".";
  // Globs under a protected parent are intentionally conservative: enumerate
  // exact allowed files instead of letting a packet include its own guards.
  const wildcard = normalized.search(/[*?\[\]{}()!]/u);
  const prefix = wildcard < 0 ? normalized : normalized.slice(0, normalized.lastIndexOf("/", wildcard) + 1);
  return prefix.replace(/\/$/u, "").toLowerCase() || ".";
}

/**
 * True when `candidate` falls under a denied entry. Prefix entries deny their
 * subtree; a candidate that is itself a parent of a denied entry is also denied,
 * because `guild_hall/` as an allowed write path would otherwise swallow every
 * file below it.
 */
export function isDeniedAgentWritePath(candidate) {
  return AGENT_DENIED_WRITE_PATHS.some(({ path: denied }) => matches(candidate, denied));
}

/**
 * Every denied entry a packet's `allowed_write_paths` would reach, with the reason.
 * Empty means the packet stays outside the boundary.
 */
export function findDeniedAgentWritePaths(allowedWritePaths = []) {
  const list = Array.isArray(allowedWritePaths) ? allowedWritePaths : [];
  const hits = [];
  for (const entry of list) {
    const value = normalize(entry);
    if (value === "") continue;
    for (const denied of AGENT_DENIED_WRITE_PATHS) {
      if (matches(value, denied.path)) {
        hits.push({ requested: value, denied: denied.path, why: denied.why });
      }
    }
  }
  return hits;
}

function matches(value, denied) {
  const scope = comparisonScope(value);
  if (!scope) return false;
  const target = denied.replace(/\/$/u, "").toLowerCase();
  return scope === "." || scope === target || target.startsWith(`${scope}/`)
    || (denied.endsWith("/") && scope.startsWith(`${target}/`));
}
