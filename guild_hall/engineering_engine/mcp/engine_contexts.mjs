// One server, many projects — the small piece that holds a context per project code.
//
// 부록 B's first bottleneck was that the door was "one process, one project": to ask about a second
// project you started a second server, and at ten projects a client is configuring ten servers and
// an assistant is choosing between a hundred and thirty tools. So the door now reads a registry and
// builds a context per project on demand.
//
// Three properties this module is responsible for:
//
//   * a project is resolved by code against the registry, never by a path a caller supplies;
//   * contexts are capped (LRU) so a hundred projects cannot grow the process without bound, and
//     a context that falls out of the cache is rebuilt from the same profile, not repaired;
//   * nothing is shared between two projects except the immutable rule assets they both point at.
//
// It holds no rules and no judgement: it is a map with a lid on it.

import { EngineMcpError, createEngineContext, lastJudgeRunAtFor } from './engine_context.mjs';
import { REGISTRY_ERROR_CODES, projectRow } from './project_registry.mjs';
import { resolveAccessView } from './access_table.mjs';

export const DEFAULT_CONTEXT_CACHE_MAX = 8;

/**
 * @param options `{ registry, profiles, repo_root, engine_root, engine_version, write_enabled,
 *   access_table, principal, shared, context_cache_max }`
 */
export function createProjectContexts(options) {
  const {
    registry, profiles, repo_root: repoRoot, engine_root: engineRoot,
    engine_version: engineVersion, write_enabled: writeEnabled,
    access_table: accessTable, principal = null,
  } = options;
  const max = options.context_cache_max ?? DEFAULT_CONTEXT_CACHE_MAX;
  const contexts = new Map();
  const shared = { ...(options.shared ?? {}) };

  const statusOf = (projectCode) => projectRow(registry, projectCode)?.status ?? null;

  /**
   * A caller may name a project or leave it out; leaving it out means the registry's default.
   * A registry of several projects with no default refuses rather than picking the first row.
   *
   * The refusal counts the projects rather than listing them. Resolution happens before the access
   * decision — it has to, because the decision is made against the project's own view — so a
   * refusal that named every project code would let a caller with no principal at all enumerate
   * the registry by guessing.
   */
  const resolveProjectCode = (requested) => {
    if (requested === undefined || requested === null) {
      if (registry.default_project === null) {
        throw new EngineMcpError(REGISTRY_ERROR_CODES.PROJECT_UNKNOWN,
          'this registry names no default project, so a call must state project_code',
          { known_count: registry.projects.length });
      }
      return registry.default_project;
    }
    if (typeof requested !== 'string' || projectRow(registry, requested) === null) {
      throw new EngineMcpError(REGISTRY_ERROR_CODES.PROJECT_UNKNOWN,
        'this registry carries no such project', { known_count: registry.projects.length });
    }
    return requested;
  };

  const get = async (projectCode) => {
    const held = contexts.get(projectCode);
    if (held !== undefined) {
      // Touched: re-inserting moves it to the end, which is what makes the eviction below LRU
      // rather than "whichever project was asked about first".
      contexts.delete(projectCode);
      contexts.set(projectCode, held);
      return held;
    }
    const profile = profiles.get(projectCode);
    if (profile === undefined) {
      throw new EngineMcpError(REGISTRY_ERROR_CODES.PROJECT_UNKNOWN,
        'this registry carries no such project', { known_count: profiles.size });
    }
    const context = await createEngineContext({
      profile,
      repo_root: repoRoot,
      engine_root: engineRoot,
      engine_version: engineVersion,
      write_enabled: writeEnabled,
      view: resolveAccessView({ table: accessTable, principal, project_code: projectCode }),
      shared,
    });
    contexts.set(projectCode, context);
    while (contexts.size > max) {
      const oldest = contexts.keys().next().value;
      if (oldest === projectCode) break;
      contexts.delete(oldest);
    }
    return context;
  };

  /**
   * The listing answer, built without opening a context per project.
   *
   * Everything on a row comes from the registry or from the profile that was validated at start —
   * except the last judgement time, which is read from the run index if the project has one. There
   * is no index yet (부록 B, 변경 8번), and `null` says so rather than walking every run folder.
   */
  const listProjects = async () => {
    const rows = [];
    for (const row of registry.projects) {
      const profile = profiles.get(row.project_code) ?? null;
      rows.push({
        project_code: row.project_code,
        display_label: row.display_label,
        status: row.status,
        is_default: row.project_code === registry.default_project,
        added_at: row.added_at,
        business_type: profile?.business_type ?? null,
        prime: profile?.prime ?? null,
        quality_grade: profile?.quality_grade ?? null,
        profile: profile === null ? null : relativeTo(repoRoot, row.profile),
        last_judge_run_at: profile === null ? null : await lastJudgeRunAtFor(profile),
        loaded: contexts.has(row.project_code),
      });
    }
    return rows;
  };

  const api = {
    registry,
    profiles,
    resolveProjectCode,
    statusOf,
    get,
    listProjects,
    stats: () => ({ held: contexts.size, max, codes: [...contexts.keys()] }),
    /** Only for a test or a shutdown: contexts hold no state a drop would lose. */
    clear: () => contexts.clear(),
  };
  shared.projects = api;
  api.shared = shared;
  return api;
}

function relativeTo(repoRoot, absolute) {
  const left = String(absolute).split('\\').join('/');
  const right = String(repoRoot).split('\\').join('/').replace(/\/$/u, '');
  return left.toLowerCase().startsWith(`${right.toLowerCase()}/`)
    ? left.slice(right.length + 1) : null;
}
