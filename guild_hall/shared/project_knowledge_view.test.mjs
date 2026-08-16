import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalise, compareCodePoints } from '../engineering_engine/kernel/canonical.mjs';
import { sha256Hex } from '../engineering_engine/kernel/fingerprint.mjs';
import { exactRefIdentityKey } from '../engineering_engine/kernel/identity.mjs';
import {
  PROJECT_KNOWLEDGE_VIEW_AUTHORITY_GRANT_HASH_DOMAIN,
  PROJECT_KNOWLEDGE_VIEW_AUTHORITY_GRANT_SCHEMA_VERSION,
  PROJECT_KNOWLEDGE_VIEW_CODES,
  PROJECT_KNOWLEDGE_VIEW_REQUEST_SCHEMA_VERSION,
  PROJECT_KNOWLEDGE_VIEW_SCHEMA_VERSION,
  ProjectKnowledgeViewError,
  selectProjectKnowledgeView,
} from './project_knowledge_view.mjs';

function exactRef(seed) {
  const token = String(seed).padStart(12, '0');
  return {
    entity_id: `00000000-0000-4000-8000-${token}`,
    revision_id: `10000000-0000-4000-8000-${token}`,
    content_id: `sha256:${String(seed).padStart(64, '0')}`,
    content_hash_alg: 'sha256',
  };
}

function bindAuthorityGrant(grantDraft) {
  const approved = [...grantDraft.approved_common_revision_refs].sort((left, right) => (
    compareCodePoints(exactRefIdentityKey(left), exactRefIdentityKey(right))
  ));
  const material = {
    schema_version: grantDraft.schema_version,
    feature_state: grantDraft.feature_state,
    authority_ceiling: grantDraft.authority_ceiling,
    policy_ref: grantDraft.policy_ref,
    project_binding_ref: grantDraft.project_binding_ref,
    project_root_path: grantDraft.project_root_path,
    common_root_path: grantDraft.common_root_path,
    containment_root_path: grantDraft.containment_root_path,
    approved_common_revision_refs: approved,
  };
  const contentId = `sha256:${sha256Hex(
    `${PROJECT_KNOWLEDGE_VIEW_AUTHORITY_GRANT_HASH_DOMAIN}\0${canonicalise(material, {
      approved_common_revision_refs: 'insertion_ordered',
    })}`,
  )}`;
  return {
    ...grantDraft,
    grant_ref: { ...grantDraft.grant_ref, content_id: contentId },
  };
}

// Most semantic fixtures use a matching synthetic pin. This helper is not
// evidence that the pin came from an independent authority; the direct API
// test below covers omission and mismatch at that boundary.
function admit(request, authorityGrant, expectedAuthorityGrantRef = authorityGrant.grant_ref) {
  return selectProjectKnowledgeView(
    request,
    authorityGrant,
    expectedAuthorityGrantRef,
  );
}

function fixture() {
  const tempRoot = mkdtempSync(join(tmpdir(), 'soulforge-kv-'));
  const containmentRoot = join(tempRoot, 'workspace');
  const projectRoot = join(containmentRoot, 'project');
  const commonRoot = join(containmentRoot, 'common');
  mkdirSync(projectRoot, { recursive: true });
  mkdirSync(commonRoot, { recursive: true });

  const projectRef = exactRef(1);
  const request = {
    schema_version: PROJECT_KNOWLEDGE_VIEW_REQUEST_SCHEMA_VERSION,
    feature_state: 'off',
    project_binding_refs: [projectRef],
    common_revision_refs: [],
  };
  const authorityGrant = bindAuthorityGrant({
    schema_version: PROJECT_KNOWLEDGE_VIEW_AUTHORITY_GRANT_SCHEMA_VERSION,
    feature_state: 'off',
    authority_ceiling: 'synthetic_validation_only',
    grant_ref: exactRef(2),
    policy_ref: exactRef(3),
    project_binding_ref: projectRef,
    project_root_path: projectRoot,
    common_root_path: commonRoot,
    containment_root_path: containmentRoot,
    approved_common_revision_refs: [],
  });
  return {
    request,
    authorityGrant,
    projectRef,
    containmentRoot,
    projectRoot,
    commonRoot,
    cleanup: () => rmSync(tempRoot, { recursive: true, force: true }),
  };
}

function expectCode(callback, code) {
  assert.throws(callback, (error) => {
    assert.ok(error instanceof ProjectKnowledgeViewError);
    assert.equal(error.code, code);
    return true;
  });
}

test('selects exactly one project with an explicit empty common allowlist and refuses zero or many', () => {
  const state = fixture();
  try {
    const view = admit(state.request, state.authorityGrant);
    assert.equal(view.schema_version, PROJECT_KNOWLEDGE_VIEW_SCHEMA_VERSION);
    assert.equal(view.kind, 'project_knowledge_view');
    assert.equal(view.status, 'selected');
    assert.equal(view.feature_state, 'off');
    assert.equal(view.route, 'validation_only');
    assert.deepEqual(view.project_binding_ref, state.projectRef);
    assert.deepEqual(view.common_revision_refs, []);
    assert.deepEqual(view.common_root_commitment, { selected: false });
    assert.match(
      view.project_root_local_path_commitment_sha256,
      /^sha256:[a-f0-9]{64}$/u,
    );
    assert.equal(view.boundary.project_count, 1);
    assert.equal(view.boundary.common_revision_count, 0);
    assert.equal(view.boundary.root_resolution_count, 1);
    assert.equal(view.boundary.body_loaded, false);
    assert.equal(view.boundary.retrieval_performed, false);
    assert.equal(view.boundary.enumeration_performed, false);
    assert.equal(view.boundary.foreign_lookup_performed, false);
    assert.equal(view.boundary.filesystem_writes, 0);
    assert.equal(view.boundary.model_calls, 0);
    assert.equal(view.boundary.explicit_network_calls, 0);
    assert.equal(view.authority.project_read_allowed, false);
    assert.equal(view.authority.common_read_allowed, false);
    assert.equal(view.authority.engine_input_allowed, false);
    assert.equal(view.authority.activation_allowed, false);
    assert.match(view.knowledge_scope_fingerprint_sha256, /^sha256:[a-f0-9]{64}$/u);
    assert.match(view.local_admission_fingerprint_sha256, /^sha256:[a-f0-9]{64}$/u);
    assert.equal(view.expected_authority_grant_ref_match_verified, true);
    assert.equal(Object.isFrozen(view), true);
    assert.equal(Object.isFrozen(view.boundary), true);
    assert.equal(Object.isFrozen(view.authority), true);
    assert.equal(Object.isFrozen(view.common_root_commitment), true);
    assert.equal(JSON.stringify(view).includes(state.projectRoot), false);

    expectCode(
      () => admit(
        { ...state.request, project_binding_refs: [] },
        state.authorityGrant,
      ),
      PROJECT_KNOWLEDGE_VIEW_CODES.SCOPE_REFUSED,
    );
    expectCode(
      () => admit(
        { ...state.request, project_binding_refs: [state.projectRef, exactRef(9)] },
        state.authorityGrant,
      ),
      PROJECT_KNOWLEDGE_VIEW_CODES.SCOPE_REFUSED,
    );
  } finally {
    state.cleanup();
  }
});

test('refuses a grant that reclassifies the selected project revision as common', () => {
  const state = fixture();
  try {
    expectCode(
      () => admit(
        state.request,
        bindAuthorityGrant({
          ...state.authorityGrant,
          approved_common_revision_refs: [structuredClone(state.projectRef)],
        }),
      ),
      PROJECT_KNOWLEDGE_VIEW_CODES.SCOPE_REFUSED,
    );
  } finally {
    state.cleanup();
  }
});

test('requires a separately supplied expected grant ref before a matching foreign grant can select', () => {
  const state = fixture();
  const foreignRef = exactRef(8);
  const forgedGrant = bindAuthorityGrant({
    ...state.authorityGrant,
    grant_ref: exactRef(9),
    project_binding_ref: foreignRef,
  });
  try {
    expectCode(
      () => selectProjectKnowledgeView(state.request, state.authorityGrant),
      PROJECT_KNOWLEDGE_VIEW_CODES.INPUT_REFUSED,
    );
    expectCode(
      () => admit(
        { ...state.request, project_binding_refs: [foreignRef] },
        forgedGrant,
        state.authorityGrant.grant_ref,
      ),
      PROJECT_KNOWLEDGE_VIEW_CODES.SCOPE_REFUSED,
    );
  } finally {
    state.cleanup();
  }
});

test('binds every authority-grant field to the externally expected grant ref before root lookup', () => {
  const state = fixture();
  const marker = 'tampered-root-must-not-be-resolved';
  try {
    expectCode(
      () => admit(
        state.request,
        {
          ...state.authorityGrant,
          project_root_path: join(state.containmentRoot, marker),
        },
        state.authorityGrant.grant_ref,
      ),
      PROJECT_KNOWLEDGE_VIEW_CODES.SCOPE_REFUSED,
    );
  } finally {
    state.cleanup();
  }
});

test('keeps project, grant, policy, and common logical roles distinct', () => {
  const state = fixture();
  try {
    const grantAsProject = bindAuthorityGrant({
      ...state.authorityGrant,
      grant_ref: structuredClone(state.projectRef),
    });
    expectCode(
      () => admit(state.request, grantAsProject),
      PROJECT_KNOWLEDGE_VIEW_CODES.SCOPE_REFUSED,
    );

    const policyAsProject = bindAuthorityGrant({
      ...state.authorityGrant,
      policy_ref: structuredClone(state.projectRef),
    });
    expectCode(
      () => admit(state.request, policyAsProject),
      PROJECT_KNOWLEDGE_VIEW_CODES.SCOPE_REFUSED,
    );

    const grantEntityAsProject = bindAuthorityGrant({
      ...state.authorityGrant,
      grant_ref: {
        ...state.authorityGrant.grant_ref,
        entity_id: state.projectRef.entity_id,
        revision_id: exactRef(21).revision_id,
      },
    });
    expectCode(
      () => admit(state.request, grantEntityAsProject),
      PROJECT_KNOWLEDGE_VIEW_CODES.SCOPE_REFUSED,
    );

    const policyEntityAsProject = bindAuthorityGrant({
      ...state.authorityGrant,
      policy_ref: {
        ...state.authorityGrant.policy_ref,
        entity_id: state.projectRef.entity_id,
        revision_id: exactRef(22).revision_id,
      },
    });
    expectCode(
      () => admit(state.request, policyEntityAsProject),
      PROJECT_KNOWLEDGE_VIEW_CODES.SCOPE_REFUSED,
    );

    const commonAsPolicy = {
      ...state.authorityGrant.policy_ref,
      content_id: `sha256:${'e'.repeat(64)}`,
    };
    const commonGrant = bindAuthorityGrant({
      ...state.authorityGrant,
      approved_common_revision_refs: [commonAsPolicy],
    });
    expectCode(
      () => admit(
        { ...state.request, common_revision_refs: [commonAsPolicy] },
        commonGrant,
      ),
      PROJECT_KNOWLEDGE_VIEW_CODES.SCOPE_REFUSED,
    );

    for (const reservedRef of [
      state.authorityGrant.grant_ref,
      state.authorityGrant.policy_ref,
    ]) {
      const commonWithReservedEntity = {
        ...exactRef(23),
        entity_id: reservedRef.entity_id,
      };
      const grant = bindAuthorityGrant({
        ...state.authorityGrant,
        approved_common_revision_refs: [commonWithReservedEntity],
      });
      expectCode(
        () => admit(
          { ...state.request, common_revision_refs: [commonWithReservedEntity] },
          grant,
        ),
        PROJECT_KNOWLEDGE_VIEW_CODES.SCOPE_REFUSED,
      );
    }
  } finally {
    state.cleanup();
  }
});

test('refuses a common ref that contradicts the project logical revision', () => {
  const state = fixture();
  const conflictingCommon = {
    ...state.projectRef,
    content_id: `sha256:${'f'.repeat(64)}`,
  };
  try {
    expectCode(
      () => admit(
        { ...state.request, common_revision_refs: [conflictingCommon] },
        bindAuthorityGrant({
          ...state.authorityGrant,
          approved_common_revision_refs: [conflictingCommon],
        }),
      ),
      PROJECT_KNOWLEDGE_VIEW_CODES.SCOPE_REFUSED,
    );
  } finally {
    state.cleanup();
  }
});

test('maps canonicalization-hostile identifiers to one no-echo input refusal before root lookup', () => {
  const state = fixture();
  try {
    for (const hostile of ['1e5', '2026-08-14T1']) {
      const hostileRef = { ...state.projectRef, entity_id: hostile };
      let captured;
      try {
        admit(
          { ...state.request, project_binding_refs: [hostileRef] },
          { ...state.authorityGrant, project_binding_ref: hostileRef },
        );
        assert.fail('expected input refusal');
      } catch (error) {
        captured = error;
      }
      assert.ok(captured instanceof ProjectKnowledgeViewError);
      assert.equal(captured.code, PROJECT_KNOWLEDGE_VIEW_CODES.INPUT_REFUSED);
      assert.equal(JSON.stringify(captured).includes(hostile), false);
      assert.equal(String(captured.message).includes(hostile), false);
    }
  } finally {
    state.cleanup();
  }
});

test('selects only an approved common revision set and canonicalizes its order', () => {
  const state = fixture();
  const commonA = exactRef(4);
  const commonB = exactRef(5);
  try {
    const request = {
      ...state.request,
      common_revision_refs: [commonB, commonA],
    };
    const grant = bindAuthorityGrant({
      ...state.authorityGrant,
      approved_common_revision_refs: [commonA, commonB],
    });
    const before = JSON.stringify({ request, grant });
    const view = admit(request, grant);
    const replayGrant = bindAuthorityGrant({
      ...grant,
      approved_common_revision_refs: [commonB, commonA],
    });
    const replay = admit(
      { ...request, common_revision_refs: [commonA, commonB] },
      replayGrant,
    );

    assert.deepEqual(view.common_revision_refs, [commonA, commonB]);
    assert.deepEqual(view.common_root_commitment, {
      selected: true,
      local_path_commitment_sha256:
        view.common_root_commitment.local_path_commitment_sha256,
    });
    assert.match(
      view.common_root_commitment.local_path_commitment_sha256,
      /^sha256:[a-f0-9]{64}$/u,
    );
    assert.equal(view.boundary.root_relation, 'disjoint');
    assert.equal(view.boundary.common_revision_count, 2);
    assert.equal(
      view.knowledge_scope_fingerprint_sha256,
      replay.knowledge_scope_fingerprint_sha256,
    );
    assert.equal(
      view.local_admission_fingerprint_sha256,
      replay.local_admission_fingerprint_sha256,
    );
    assert.deepEqual(view, replay);
    assert.equal(JSON.stringify({ request, grant }), before);
    assert.equal(Object.isFrozen(view.common_revision_refs), true);
    assert.equal(Object.isFrozen(view.common_revision_refs[0]), true);
  } finally {
    state.cleanup();
  }
});

test('separates the portable knowledge scope fingerprint from local path admission', () => {
  const first = fixture();
  const second = fixture();
  try {
    const firstView = admit(first.request, first.authorityGrant);
    const secondView = admit(second.request, second.authorityGrant);
    assert.equal(
      firstView.knowledge_scope_fingerprint_sha256,
      secondView.knowledge_scope_fingerprint_sha256,
    );
    assert.notEqual(
      firstView.local_admission_fingerprint_sha256,
      secondView.local_admission_fingerprint_sha256,
    );
  } finally {
    first.cleanup();
    second.cleanup();
  }
});

test('refuses unapproved, duplicate, contradictory, and project-as-common revisions', () => {
  const state = fixture();
  const common = exactRef(4);
  const contradictory = {
    ...common,
    content_id: `sha256:${'f'.repeat(64)}`,
  };
  try {
    const cases = [
      {
        request: { ...state.request, common_revision_refs: [common] },
        grant: state.authorityGrant,
      },
      {
        request: {
          ...state.request,
          common_revision_refs: [common, structuredClone(common)],
        },
        grant: bindAuthorityGrant({
          ...state.authorityGrant,
          approved_common_revision_refs: [common],
        }),
      },
      {
        request: {
          ...state.request,
          common_revision_refs: [common, contradictory],
        },
        grant: bindAuthorityGrant({
          ...state.authorityGrant,
          approved_common_revision_refs: [common, contradictory],
        }),
      },
      {
        request: {
          ...state.request,
          common_revision_refs: [structuredClone(state.projectRef)],
        },
        grant: bindAuthorityGrant({
          ...state.authorityGrant,
          approved_common_revision_refs: [structuredClone(state.projectRef)],
        }),
      },
    ];
    for (const entry of cases) {
      expectCode(
        () => admit(entry.request, entry.grant),
        PROJECT_KNOWLEDGE_VIEW_CODES.SCOPE_REFUSED,
      );
    }
  } finally {
    state.cleanup();
  }
});

test('refuses a foreign project before resolving any root and never echoes refs or paths', () => {
  const state = fixture();
  const foreignRef = exactRef(8);
  const marker = 'foreign-root-must-not-be-observed';
  const request = { ...state.request, project_binding_refs: [foreignRef] };
  try {
    const capture = (grant) => {
      try {
        admit(request, grant);
        assert.fail('expected refusal');
      } catch (error) {
        assert.ok(error instanceof ProjectKnowledgeViewError);
        assert.equal(error.code, PROJECT_KNOWLEDGE_VIEW_CODES.SCOPE_REFUSED);
        return JSON.stringify({ name: error.name, code: error.code, message: error.message });
      }
    };
    const normal = capture(state.authorityGrant);
    const impossible = capture(bindAuthorityGrant({
      ...state.authorityGrant,
      project_root_path: join(state.containmentRoot, marker),
      common_root_path: join(state.containmentRoot, `${marker}-common`),
    }));
    assert.equal(normal, impossible);
    assert.equal(normal.includes(marker), false);
    assert.equal(normal.includes(foreignRef.entity_id), false);
    assert.equal(normal.includes(state.projectRoot), false);
  } finally {
    state.cleanup();
  }
});

test('refuses identical or nested project/common roots and maps root failures to one code', () => {
  const state = fixture();
  const common = exactRef(4);
  const request = { ...state.request, common_revision_refs: [common] };
  const baseGrant = bindAuthorityGrant({
    ...state.authorityGrant,
    approved_common_revision_refs: [common],
  });
  const nestedCommon = join(state.projectRoot, 'nested-common');
  mkdirSync(nestedCommon);
  try {
    for (const commonRootPath of [state.projectRoot, nestedCommon]) {
      expectCode(
        () => admit(
          request,
          bindAuthorityGrant({ ...baseGrant, common_root_path: commonRootPath }),
        ),
        PROJECT_KNOWLEDGE_VIEW_CODES.ROOT_REFUSED,
      );
    }
    expectCode(
      () => admit(
        request,
        bindAuthorityGrant({
          ...baseGrant,
          common_root_path: join(state.containmentRoot, 'missing-common'),
        }),
      ),
      PROJECT_KNOWLEDGE_VIEW_CODES.ROOT_REFUSED,
    );
    const wholeContainmentGrant = bindAuthorityGrant({
      ...state.authorityGrant,
      project_root_path: state.containmentRoot,
    });
    expectCode(
      () => admit(state.request, wholeContainmentGrant),
      PROJECT_KNOWLEDGE_VIEW_CODES.ROOT_REFUSED,
    );

    const projectOnlyGrant = bindAuthorityGrant({
      ...state.authorityGrant,
      common_root_path: join(state.containmentRoot, 'not-read'),
    });
    const projectOnly = admit(
      state.request,
      projectOnlyGrant,
    );
    assert.equal(projectOnly.common_root_commitment.selected, false);
  } finally {
    state.cleanup();
  }
});

test('rejects proxy, accessor, alias, sparse, cyclic, missing, and extra input surfaces', () => {
  const state = fixture();
  try {
    let trapCalls = 0;
    const proxyRequest = new Proxy(state.request, {
      ownKeys(target) {
        trapCalls += 1;
        return Reflect.ownKeys(target);
      },
    });
    expectCode(
      () => admit(proxyRequest, state.authorityGrant),
      PROJECT_KNOWLEDGE_VIEW_CODES.INPUT_REFUSED,
    );
    assert.equal(trapCalls, 0);

    let getterCalls = 0;
    const accessorGrant = { ...state.authorityGrant };
    Object.defineProperty(accessorGrant, 'project_root_path', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return state.projectRoot;
      },
    });
    expectCode(
      () => admit(state.request, accessorGrant),
      PROJECT_KNOWLEDGE_VIEW_CODES.INPUT_REFUSED,
    );
    assert.equal(getterCalls, 0);

    let nestedProxyCalls = 0;
    const nestedProxy = new Proxy(state.projectRef, {
      get(target, key, receiver) {
        nestedProxyCalls += 1;
        return Reflect.get(target, key, receiver);
      },
    });
    expectCode(
      () => admit(
        { ...state.request, project_binding_refs: [nestedProxy] },
        state.authorityGrant,
      ),
      PROJECT_KNOWLEDGE_VIEW_CODES.INPUT_REFUSED,
    );
    assert.equal(nestedProxyCalls, 0);

    const aliasRef = exactRef(7);
    expectCode(
      () => admit(
        { ...state.request, common_revision_refs: [aliasRef, aliasRef] },
        state.authorityGrant,
      ),
      PROJECT_KNOWLEDGE_VIEW_CODES.INPUT_REFUSED,
    );

    const latestRef = { ...state.projectRef, revision_id: 'latest' };
    expectCode(
      () => admit(
        { ...state.request, project_binding_refs: [latestRef] },
        { ...state.authorityGrant, project_binding_ref: latestRef },
      ),
      PROJECT_KNOWLEDGE_VIEW_CODES.INPUT_REFUSED,
    );

    const sparse = [];
    sparse.length = 1;
    expectCode(
      () => admit(
        { ...state.request, common_revision_refs: sparse },
        state.authorityGrant,
      ),
      PROJECT_KNOWLEDGE_VIEW_CODES.INPUT_REFUSED,
    );

    const cyclic = { ...state.request };
    cyclic.extra = cyclic;
    expectCode(
      () => admit(cyclic, state.authorityGrant),
      PROJECT_KNOWLEDGE_VIEW_CODES.INPUT_REFUSED,
    );

    const { common_revision_refs: omitted, ...missingCommon } = state.request;
    assert.deepEqual(omitted, []);
    expectCode(
      () => admit(missingCommon, state.authorityGrant),
      PROJECT_KNOWLEDGE_VIEW_CODES.INPUT_REFUSED,
    );
    expectCode(
      () => admit(
        { ...state.request, unexpected: true },
        state.authorityGrant,
      ),
      PROJECT_KNOWLEDGE_VIEW_CODES.INPUT_REFUSED,
    );
  } finally {
    state.cleanup();
  }
});

test('keeps direct filesystem and all retrieval, Engine, model, network, and write imports out', () => {
  const source = readFileSync(new URL('./project_knowledge_view.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from ['"]node:fs/u);
  assert.doesNotMatch(source, /from ['"].*rag/u);
  assert.doesNotMatch(source, /from ['"].*ax_se_project_assessment/u);
  assert.doesNotMatch(source, /from ['"].*(?:http|https|net|tls)/u);
  assert.match(source, /from ['"]\.\/knowledge_root_resolver\.mjs['"]/u);
});
