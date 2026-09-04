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

  // 무엇이 위반인지 판정하는 검사기. 이것을 고칠 수 있으면 위반이 사라진다.
  { path: "guild_hall/validate/", why: "the validators that decide what counts as a violation" },

  // 실행 계약과 라우터. 규칙 자체.
  { path: "AGENTS.md", why: "the agent instruction router" },
  { path: "docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md", why: "the execution contract" },

  // 비밀·private 평면. 애초에 열람도 금지지만 명시해 둔다.
  { path: "private-state/", why: "cross-project protected state" },
  { path: ".github/workflows/", why: "CI that runs with repository credentials" },
]);

function normalize(value) {
  return typeof value === "string" ? value.trim().replaceAll("\\", "/").replace(/^\.\//u, "") : "";
}

/**
 * True when `candidate` falls under a denied entry. Prefix entries deny their
 * subtree; a candidate that is itself a parent of a denied entry is also denied,
 * because `guild_hall/` as an allowed write path would otherwise swallow every
 * file below it.
 */
export function isDeniedAgentWritePath(candidate) {
  const value = normalize(candidate);
  if (value === "") return false;
  // The repository root contains every denied entry, so naming it is the widest
  // possible way to ask for them. A blank entry is noise and stays allowed; `.`
  // is a deliberate request for everything and is not.
  if (value === "." || value === "/") return true;
  return AGENT_DENIED_WRITE_PATHS.some(({ path: denied }) => {
    if (denied.endsWith("/")) {
      return value === denied || value.startsWith(denied) || `${value}/`.startsWith(denied)
        || denied.startsWith(value.endsWith("/") ? value : `${value}/`);
    }
    return value === denied
      || denied.startsWith(value.endsWith("/") ? value : `${value}/`);
  });
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
      if (isDeniedAgentWritePath(value) && matches(value, denied.path)) {
        hits.push({ requested: value, denied: denied.path, why: denied.why });
      }
    }
  }
  return hits;
}

function matches(value, denied) {
  if (denied.endsWith("/")) {
    return value === denied || value.startsWith(denied) || `${value}/`.startsWith(denied)
      || denied.startsWith(value.endsWith("/") ? value : `${value}/`);
  }
  return value === denied || denied.startsWith(value.endsWith("/") ? value : `${value}/`);
}
