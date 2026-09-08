import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, parse, resolve } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { digestOf, isSafeLabel, isSafeRef } from '../../../../guild_hall/agent_observation/guard_primitives.mjs';
import { normalizeWorkBindingRequest, evaluateWorkBinding } from '../../../../guild_hall/shared/work_binding.mjs';
import { taskHierarchyDataDigest } from '../../../../guild_hall/engineering_engine/engines/systems_engineering/rules/task_hierarchy_mapper.mjs';
import { validateTaskHierarchyNodes } from '../../../../guild_hall/engineering_engine/engines/systems_engineering/schemas/task_hierarchy_v1_schema_validator.mjs';
import hierarchySchema from '../../../../guild_hall/engineering_engine/engines/systems_engineering/schemas/task_hierarchy_v1.schema.json' with { type: 'json' };

const SHA = /^sha256:[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/u;
const SCOPE = ['project_code', 'product_ref', 'work_package_ref', 'stage_code', 'artifact_family_id'];
const sha = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const same = (a, b) => digestOf(a) === digestOf(b);
const scopeOf = value => Object.fromEntries(SCOPE.map(key => [key, value[key]]));
const sameScope = (a, b) => a && b && SCOPE.every(key => a[key] === b[key]);
const id = value => typeof value === 'string' && ID.test(value) && isSafeRef(value);
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const fail = code => { throw Object.assign(new Error(code), { workbenchCode: code }); };
const assert = (condition, code) => { if (!condition) fail(code); };
const sameFile = (a, b) => a.dev === b.dev && a.ino === b.ino;
const samePath = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
const requestSelection = request => {
  const { requester, idempotency_key, directives, revision_of, revision_no, ...selection } = request;
  return selection;
};

/** No admin alias and no optional salt. The separately pinned realm is part of the domain. */
export function requesterForAccount(realmId, accountId) {
  if (!id(realmId) || typeof accountId !== 'string' || accountId.length < 1 || accountId.length > 256
    || /\p{C}/u.test(accountId)) throw new TypeError('Exact realm and account identity required');
  return `member.${createHash('sha256').update(JSON.stringify(['soulforge.workbench.account.v1', realmId, accountId])).digest('hex').slice(0, 16)}`;
}

/**
 * Read-only adapter for an operator-approved metadata bundle. expectedBinding is supplied
 * independently by the server configuration; a document cannot approve or pin itself.
 * All source bytes are bounded and rechecked per operation. Source files are metadata,
 * Blueprint definitions and code only; this adapter never follows revision refs to bodies.
 */
export function createWorkbenchCurrentSources({ root, expectedBinding, now = () => new Date(), linearReaderFactory } = {}) {
  if (typeof root !== 'string' || !isAbsolute(root) || resolve(root) === parse(resolve(root)).root
    || !exact(expectedBinding, ['binding_id', 'realm_id', 'content_sha256'])
    || !id(expectedBinding.binding_id) || !id(expectedBinding.realm_id) || !SHA.test(expectedBinding.content_sha256)) {
    throw new TypeError('Explicit source root and independently approved binding pins required');
  }
  const rootPath = resolve(root);
  const pins = structuredClone(expectedBinding);
  const intakeKeyPrefix = `wb.${pins.content_sha256.slice(7)}.`;
  let rootIdentity;
  const linearReaders = new Map();

  async function readPinned(descriptor) {
    assert(exact(descriptor, ['path', 'content_sha256']) && SHA.test(descriptor.content_sha256)
      && typeof descriptor.path === 'string' && /^[A-Za-z0-9_-][A-Za-z0-9_./-]{0,239}$/u.test(descriptor.path)
      && !descriptor.path.split('/').some(part => !part || part === '.' || part === '..'), 'SOURCE_DESCRIPTOR_INVALID');
    const target = join(rootPath, descriptor.path);
    let cursor = target;
    while (true) {
      const stat = await lstat(cursor);
      assert(!stat.isSymbolicLink() && (cursor === target ? stat.isFile() : stat.isDirectory()), 'SOURCE_PATH_UNSAFE');
      if (cursor === rootPath) {
        assert(!rootIdentity || sameFile(rootIdentity, stat), 'SOURCE_ROOT_CHANGED');
        rootIdentity ??= stat;
      }
      const parent = dirname(cursor);
      if (parent === cursor) break;
      cursor = parent;
    }
    assert(samePath(await realpath(rootPath), rootPath), 'SOURCE_PATH_UNSAFE');
    const before = await lstat(target);
    assert(before.size > 0 && before.size <= 2 * 1024 * 1024 && before.nlink === 1, 'SOURCE_SIZE_OR_LINK_INVALID');
    const handle = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const opened = await handle.stat();
      assert(sameFile(before, opened), 'SOURCE_CHANGED');
      const bytes = await handle.readFile();
      const after = await lstat(target);
      const final = await handle.stat();
      assert([after, final].every(stat => sameFile(before, stat) && !stat.isSymbolicLink()
        && stat.size === before.size && stat.mtimeMs === before.mtimeMs && stat.nlink === 1)
        && bytes.length === before.size, 'SOURCE_CHANGED');
      assert(sha(bytes) === descriptor.content_sha256, 'SOURCE_DIGEST_MISMATCH');
      return bytes;
    } finally { await handle.close(); }
  }
  async function json(descriptor) {
    const bytes = await readPinned(descriptor);
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { return fail('SOURCE_JSON_INVALID'); }
  }
  function validTime(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
      && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
  }
  function currentWindow(value) {
    const time = new Date(now()).getTime();
    return Number.isFinite(time) && validTime(value.observed_at) && validTime(value.valid_until)
      && Date.parse(value.observed_at) <= time && time < Date.parse(value.valid_until);
  }
  async function snapshot() {
    const binding = await json({ path: 'binding.json', content_sha256: pins.content_sha256 });
    assert(exact(binding, ['binding_id', 'realm_id', 'generation', 'state', 'observed_at', 'valid_until', 'authority', 'catalogue'])
      && binding.binding_id === pins.binding_id && binding.realm_id === pins.realm_id
      && id(binding.generation) && binding.state === 'current' && currentWindow(binding), 'SOURCE_BINDING_NOT_CURRENT');
    const authority = await json(binding.authority);
    assert(exact(authority, ['binding_id', 'realm_id', 'generation', 'observed_at', 'valid_until', 'grants'])
      && authority.binding_id === pins.binding_id && authority.realm_id === pins.realm_id
      && authority.generation === binding.generation && currentWindow(authority)
      && Array.isArray(authority.grants) && authority.grants.length <= 256, 'AUTHORITY_BINDING_UNAVAILABLE');
    for (const grant of authority.grants) {
      assert(exact(grant, ['requester', ...SCOPE, 'state', 'epoch', 'receipt_ref'])
        && /^member\.[a-f0-9]{16}$/u.test(grant.requester)
        && ['current', 'revoked', 'expired'].includes(grant.state)
        && Number.isSafeInteger(grant.epoch) && grant.epoch >= 0 && id(grant.receipt_ref), 'AUTHORITY_BINDING_INVALID');
    }
    const catalogue = await json(binding.catalogue);
    assert(exact(catalogue, ['binding_id', 'realm_id', 'generation', 'entries'])
      && catalogue.binding_id === pins.binding_id && catalogue.realm_id === pins.realm_id
      && catalogue.generation === binding.generation && Array.isArray(catalogue.entries)
      && catalogue.entries.length <= 64, 'CATALOGUE_BINDING_INVALID');
    assert(new Set(catalogue.entries.map(row => row.id)).size === catalogue.entries.length, 'CATALOGUE_AMBIGUOUS');
    return { binding, authority, entries: catalogue.entries };
  }

  async function materialize(row, requester, current, canAccessProject) {
    assert(exact(row, ['id', 'label', 'request', 'sources', 'linear', 'applicability']) && id(row.id) && isSafeLabel(row.label)
      && ['synthetic_sfx', 'real_work'].includes(row.applicability), 'CATALOGUE_ENTRY_INVALID');
    const normalized = normalizeWorkBindingRequest({ ...row.request, requester });
    assert(normalized.status === 'NORMALIZED', 'CATALOGUE_REQUEST_INVALID');
    const request = normalized.request;
    assert(row.applicability !== 'synthetic_sfx' || (/^(?:SYN|SFX)(?:-|_)[A-Z0-9_-]+$/u.test(request.project_code)
      && request.policy_refs.task_ref === null && row.linear === null), 'SYNTHETIC_SCOPE_REQUIRED');
    assert(await canAccessProject(request.project_code) === true, 'SCOPE_VIOLATION');
    const grants = current.authority.grants.filter(grant => grant.requester === requester && sameScope(grant, request));
    assert(grants.length === 1 && grants[0].state === 'current', 'SCOPE_VIOLATION');
    assert(exact(row.sources, ['policy', 'hierarchy', 'input', 'recipe', 'blueprint', 'code']), 'CATALOGUE_SOURCES_INVALID');
    const policy = await json(row.sources.policy);
    assert(policy.schema_version === 'se_stage_expected_artifact_policy_v0'
      && policy.policy_identity?.policy_id === request.policy_refs.stage_policy_ref
      && Array.isArray(policy.stage_family_defaults)
      && policy.stage_family_defaults.filter(stage => stage.stage_code === request.stage_code)
        .flatMap(stage => stage.required_artifact_families ?? [])
        .filter(family => family.artifact_family_id === request.artifact_family_id).length === 1, 'POLICY_SLOT_UNKNOWN');
    const input = await json(row.sources.input);
    assert(exact(input, ['scope', 'generation', 'revisions']) && sameScope(input.scope, request)
      && input.generation === current.binding.generation && Array.isArray(input.revisions) && input.revisions.length > 0
      && input.revisions.length <= 256 && input.revisions.every(revision => exact(revision, ['source_ref', 'content_sha256'])
        && id(revision.source_ref) && SHA.test(revision.content_sha256))
      && new Set(input.revisions.map(revision => revision.source_ref)).size === input.revisions.length, 'INPUT_REVISION_UNAVAILABLE');
    assert(digestOf(input.revisions) === request.input_revision, 'INPUT_REVISION_STALE');
    const mappings = [];
    const allowedBlueprints = [];
    if (row.sources.hierarchy !== null) {
      const hierarchy = await json(row.sources.hierarchy);
      assert(Array.isArray(hierarchy.nodes) && hierarchy.nodes.length > 0
        && validateTaskHierarchyNodes(hierarchy.nodes, hierarchySchema).length === 0
        && hierarchy.receipt?.output_data_sha256 === taskHierarchyDataDigest(hierarchy.nodes), 'TASK_HIERARCHY_INVALID');
      const tasks = hierarchy.nodes.filter(node => node.layer === 'Task' && node.id === request.rune_task_id
        && node.scope.project_id === request.project_code && node.scope.product_id === request.product_ref
        && node.stage_code === request.stage_code && node.artifact_type_id === request.artifact_family_id
        && node.work_package_ref?.id === request.work_package_ref);
      assert(tasks.length === 1 && tasks[0].order_index === request.work_order_ref?.order_index
        && `sha256:${hierarchy.receipt.upstream_receipt?.output_digests?.stages}` === request.work_order_ref?.receipt_digest, 'TASK_BINDING_MISMATCH');
      assert(same(tasks[0].blueprint_ref, request.blueprint_ref), 'BLUEPRINT_TASK_MISMATCH');
      mappings.push({ ...scopeOf(request), rune_task_id: request.rune_task_id,
        work_order_ref: request.work_order_ref, task_ref: request.policy_refs.task_ref });
      if (request.blueprint_ref !== null) {
        const blueprint = await json(row.sources.blueprint);
        assert(blueprint.workflow_id === request.blueprint_ref.workflow_id && Array.isArray(blueprint.steps)
          && blueprint.steps.length > 0, 'BLUEPRINT_DEFINITION_INVALID');
        const provenance = hierarchy.receipt.source_provenance?.filter(source => source.input_name === 'blueprint_sources'
          && source.task_id === request.rune_task_id);
        assert(provenance?.length === 1 && `sha256:${provenance[0].source_ref.sha256}` === row.sources.blueprint.content_sha256
          && provenance[0].definition_data_sha256 === taskHierarchyDataDigest(blueprint), 'BLUEPRINT_BYTES_OR_MEMBERSHIP_MISMATCH');
        allowedBlueprints.push(request.blueprint_ref);
      }
    } else assert(request.rune_task_id === null && request.blueprint_ref === null && row.sources.blueprint === null, 'TASK_BINDING_MISMATCH');
    let recipeHashes = null;
    if (row.sources.recipe !== null) {
      const recipe = await json(row.sources.recipe);
      assert(exact(recipe, ['recipe_id', 'kind', 'scope', 'rune_task_id', 'task_ref', 'linear_issue_id', 'blueprint_ref', 'input_revision', 'generation', 'blueprint_sha256', 'code_sha256'])
        && recipe.recipe_id === request.policy_refs.recipe_id && recipe.kind === request.kind && sameScope(recipe.scope, request)
        && recipe.rune_task_id === request.rune_task_id && same(recipe.blueprint_ref, request.blueprint_ref)
        && same(recipe.task_ref, request.policy_refs.task_ref) && recipe.linear_issue_id === (row.linear?.issue_id ?? null)
        && recipe.input_revision === request.input_revision && recipe.generation === current.binding.generation
        && recipe.blueprint_sha256 === row.sources.blueprint?.content_sha256
        && recipe.code_sha256 === row.sources.code?.content_sha256, 'RECIPE_BINDING_MISMATCH');
      await readPinned(row.sources.code); // Hash code; never import or execute it.
      recipeHashes = { recipe_sha256: row.sources.recipe.content_sha256, blueprint_sha256: recipe.blueprint_sha256,
        code_sha256: recipe.code_sha256, data_sha256: row.sources.input.content_sha256 };
    } else assert(request.policy_refs.recipe_id === null && row.sources.code === null, 'RECIPE_BINDING_MISMATCH');
    let linearTask = null;
    let linearHold = null;
    if (row.linear !== null) {
      assert(exact(row.linear, ['root', 'expected_binding', 'issue_id']) && typeof linearReaderFactory === 'function', 'LINEAR_SOURCE_UNAVAILABLE');
      const key = digestOf(row.linear);
      if (!linearReaders.has(key)) linearReaders.set(key, linearReaderFactory({ root: row.linear.root, expectedBinding: row.linear.expected_binding, now }));
      const result = await linearReaders.get(key).resolve({ issueId: row.linear.issue_id });
      linearTask = result.status === 'CURRENT' ? result.linear_task : null;
      linearHold = result.status === 'CURRENT' ? null : result.hold_code;
      if (linearTask !== null) assert(same(linearTask.task_ref, request.policy_refs.task_ref)
        && linearTask.project_code === request.project_code, 'TASK_BINDING_MISMATCH');
    }
    const evidence = {
      evaluation_ref: `wb.evaluation.${randomBytes(16).toString('hex')}`, authenticated_requester: requester,
      acl: grants[0], policy_slots: [{ ...scopeOf(request), stage_policy_ref: request.policy_refs.stage_policy_ref }],
      mapping_phase: row.sources.hierarchy === null ? 'pre_phase0' : 'phase0', mappings,
      current_input_revision: request.input_revision, historical_input_approval: null,
      allowed_blueprints: allowedBlueprints, approved_instruction_refs: [],
      linear_applicability: row.applicability, linear_task: linearTask,
    };
    const binding = evaluateWorkBinding(request, evidence);
    assert(binding.status !== 'HOLD', binding.hold_code);
    assert(currentWindow(current.binding) && currentWindow(current.authority), 'AUTHORITY_BINDING_UNAVAILABLE');
    return { request, evidence, view: { id: row.id, label: row.label, request, source_generation: current.binding.generation,
      source_hashes: recipeHashes, mapping_status: binding.status,
      hold_code: linearHold ?? binding.hold_code ?? (row.sources.recipe === null ? 'EXECUTOR_NOT_BOUND' : null),
      claim_created: false, execution_started: false } };
  }

  return Object.freeze({
    realmId: pins.realm_id,
    approvedBundleDigest: pins.content_sha256,
    // Server-only companion reader. Descriptors must come from an independently pinned
    // deployment document; no HTTP route accepts descriptors or exposes this method.
    readPinnedMetadata: json,
    async authorizeRecordedScope({ request, requester, canAccessProject }) {
      const normalized = normalizeWorkBindingRequest(request);
      assert(normalized.status === 'NORMALIZED' && normalized.request.requester === requester,
        'SCOPE_VIOLATION');
      assert(await canAccessProject(normalized.request.project_code) === true, 'SCOPE_VIOLATION');
      const granted = current => current.authority.grants.filter(grant => grant.requester === requester
        && grant.state === 'current' && sameScope(grant, normalized.request));
      const first = granted(await snapshot());
      assert(first.length === 1, 'SCOPE_VIOLATION');
      assert(await canAccessProject(normalized.request.project_code) === true, 'SCOPE_VIOLATION');
      const last = granted(await snapshot());
      assert(last.length === 1 && same(first[0], last[0]), 'SCOPE_VIOLATION');
      // Historical snapshot reads need current scope authority, not a fresh
      // execution approval or the still-unchanged source body/recipe.
      return { status: 'SCOPE_READ_AUTHORIZED', authority_receipt_ref: last[0].receipt_ref, acl_epoch: last[0].epoch };
    },
    async catalogue({ requester, canAccessProject }) {
      const current = await snapshot();
      const entries = [];
      const holds = [];
      for (const row of current.entries) {
        // Do not expose foreign project labels, source paths, counts or failure detail.
        if (await canAccessProject(row.request?.project_code) !== true
          || !current.authority.grants.some(grant => grant.requester === requester && grant.state === 'current' && sameScope(grant, row.request))) continue;
        try {
          const view = (await materialize(row, requester, current, canAccessProject)).view;
          entries.push({ ...view, request: { ...view.request, idempotency_key: `${intakeKeyPrefix}${randomBytes(16).toString('hex')}` } });
        }
        catch (error) { holds.push({ id: id(row.id) ? row.id : 'unavailable', hold_code: error.workbenchCode ?? 'CURRENT_SOURCE_UNAVAILABLE' }); }
      }
      assert(new Set(entries.map(row => digestOf(requestSelection(row.request)))).size === entries.length, 'CATALOGUE_AMBIGUOUS');
      await snapshot(); // Do not return an authority snapshot replaced or expired during source IO.
      return { status: 'CURRENT', source_generation: current.binding.generation, entries, holds };
    },
    async evidence({ request, requester, canAccessProject }) {
      // The existing closed request schema has no code-digest field. Bind its retry identity
      // to the entire approved bundle so a restart with new same-ID code cannot reinterpret
      // old records. This is a revision pin, not a secret or an execution permit.
      assert(typeof request.idempotency_key === 'string' && request.idempotency_key.startsWith(intakeKeyPrefix), 'CATALOGUE_SELECTION_CHANGED');
      const current = await snapshot();
      const rows = current.entries.filter(row => same(requestSelection(row.request), requestSelection(request)));
      assert(rows.length === 1, 'CATALOGUE_SELECTION_CHANGED');
      const result = await materialize(rows[0], requester, current, canAccessProject);
      await snapshot();
      return result.evidence;
    },
  });
}
