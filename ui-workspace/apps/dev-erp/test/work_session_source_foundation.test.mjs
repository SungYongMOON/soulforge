import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createErpMcpService,
  ErpMcpError,
} from "../src/erp_mcp_service.mjs";
import {
  normalizePersonalWorkSessionCommand,
  PERSONAL_WORK_SESSION_COMMAND_SCHEMA,
  WORK_SESSION_BOUNDED_SUMMARY_FORBIDDEN_PATTERN,
  WorkSessionLifecycleError,
} from "../src/work_session_lifecycle.mjs";
import {
  createWorkSessionOutbox,
  WorkSessionOutboxError,
} from "../src/work_session_outbox.mjs";
import { openStore } from "../src/store.mjs";

const COMMAND_SCHEMA_PATH = new URL(
  "../docs/contracts/personal_work_session_command.v1.schema.json",
  import.meta.url,
);
const OUTBOX_SCHEMA_PATH = new URL(
  "../docs/contracts/personal_work_session_outbox_entry.v1.schema.json",
  import.meta.url,
);
const THREAD_A = `ws_thread_sha256:${"a".repeat(64)}`;
const THREAD_B = `ws_thread_sha256:${"b".repeat(64)}`;

function fixture({ enabled = true, missingCloseoutAfterMs = 1000 } = {}) {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-personal-work-session-"));
  const store = openStore(":memory:");
  store.upsertProject({
    id: "P26-PC-WORK",
    title: "Structured PC work synthetic",
    data_label: "synthetic",
  });
  const accountId = store.createAccount({
    username: "pc-worker",
    password: "synthetic-password",
    email: "pc-worker@example.com",
    display_name: "PC Worker",
    roles: ["member"],
  }).id;
  const account = store.db.prepare(
    "SELECT id,username,email,display_name,person_id,status FROM core_account WHERE id=?",
  ).get(accountId);
  const item = store.createItem({
    project_id: "P26-PC-WORK",
    title: "Bounded synthetic work",
    assignee_ref: "pc-worker@example.com",
    status: "doing",
    data_label: "synthetic",
  }).item;
  const clock = { value: Date.parse("2026-07-23T01:00:00.000Z") };
  const service = createErpMcpService({
    store,
    artifactRoot: join(root, "artifacts"),
    now: () => clock.value,
    workSessionLifecycleEnabled: enabled,
    workSessionMissingCloseoutAfterMs: missingCloseoutAfterMs,
  });
  return {
    root,
    store,
    service,
    account,
    item,
    clock,
    close() {
      try { store.db.close(); } catch {}
      rmSync(root, { recursive: true, force: true });
    },
  };
}

function expectCode(fn, errorClass, code, status) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof errorClass, error?.stack);
    assert.equal(error.code, code);
    if (status !== undefined) assert.equal(error.status, status);
    return true;
  });
}

function registerNodes(f) {
  for (const suffix of ["primary", "handoff"]) {
    f.service.registerPersonalWorkSessionNode(f.account, {
      node_id: `node_synth_${suffix}`,
      registration_id: `node_registration_synth_${suffix}`,
      attestation_ref: `node_attestation_synth_${suffix}`,
    });
  }
}

function startCommand(f, overrides = {}) {
  return {
    schema_version: PERSONAL_WORK_SESSION_COMMAND_SCHEMA,
    command_kind: "start",
    metadata_boundary: "metadata_only",
    item_id: f.item.id,
    project_id: f.item.project_id,
    assignment_epoch: "assignment_epoch_synth_001",
    node_id: "node_synth_primary",
    opaque_thread_ref: THREAD_A,
    idempotency_key: "start-command-synth-0001",
    primary_session: true,
    started_at: new Date(f.clock.value).toISOString(),
    ...overrides,
  };
}

function checkpointCommand(session, previousDigest, overrides = {}) {
  return {
    schema_version: PERSONAL_WORK_SESSION_COMMAND_SCHEMA,
    command_kind: "checkpoint",
    metadata_boundary: "metadata_only",
    session_id: session.session_id,
    node_id: session.node_id,
    opaque_thread_ref: session.opaque_thread_ref,
    idempotency_key: "checkpoint-synth-0001",
    sequence: 1,
    previous_event_digest: previousDigest,
    occurred_at: "2026-07-23T01:01:00.000Z",
    summary: "Bounded checkpoint metadata.",
    artifact_refs: ["artifact_synth_001"],
    verification_refs: ["verification_synth_001"],
    ...overrides,
  };
}

function closeoutCommand(session, previousDigest, overrides = {}) {
  const command = {
    schema_version: PERSONAL_WORK_SESSION_COMMAND_SCHEMA,
    command_kind: "closeout",
    metadata_boundary: "metadata_only",
    session_id: session.session_id,
    node_id: session.node_id,
    opaque_thread_ref: session.opaque_thread_ref,
    idempotency_key: "closeout-synth-0001",
    sequence: 2,
    previous_event_digest: previousDigest,
    occurred_at: "2026-07-23T01:02:00.000Z",
    summary: "Bounded closeout metadata.",
    artifact_refs: ["artifact_synth_001"],
    verification_refs: ["verification_synth_001"],
    closeout_kind: "completed_candidate",
    completion_proposal: {
      proposal_kind: "task_completion",
      authority_state: "proposal_only",
      summary: "Propose completion after coordinator review.",
      evidence_refs: ["verification_synth_001"],
      artifact_refs: ["artifact_synth_001"],
    },
    ...overrides,
  };
  if (command.closeout_kind !== "completed_candidate") {
    delete command.completion_proposal;
  }
  return command;
}

test("personal WorkSession schemas and runtime reject broad/raw capture surfaces", () => {
  const commandSchema = JSON.parse(readFileSync(COMMAND_SCHEMA_PATH, "utf8"));
  const outboxSchema = JSON.parse(readFileSync(OUTBOX_SCHEMA_PATH, "utf8"));
  assert.equal(commandSchema.$defs.start.additionalProperties, false);
  assert.equal(commandSchema.$defs.checkpoint.additionalProperties, false);
  assert.equal(commandSchema.$defs.closeout.additionalProperties, false);
  assert.equal(commandSchema.$defs.completion_proposal.additionalProperties, false);
  assert.equal(outboxSchema.additionalProperties, false);
  assert.equal(
    outboxSchema.properties.command.$ref,
    commandSchema.$id,
  );
  assert.equal(
    commandSchema.$defs.closeout.required.includes("closeout_kind"),
    true,
  );
  assert.equal(
    commandSchema.$defs.bounded_summary.not.pattern,
    WORK_SESSION_BOUNDED_SUMMARY_FORBIDDEN_PATTERN,
    "schema and runtime must share the exact bounded-summary boundary pattern",
  );
  const boundedSummaryReject = new RegExp(
    commandSchema.$defs.bounded_summary.not.pattern,
  );

  const base = checkpointCommand({
    session_id: "pws_synth_001",
    node_id: "node_synth_primary",
    opaque_thread_ref: THREAD_A,
  }, `sha256:${"1".repeat(64)}`);
  for (const field of [
    "whole_conversation",
    "screen_capture",
    "keyboard_log",
    "keystroke_log",
    "os_activity",
    "os_monitoring",
    "raw_task_chat_completion_summary",
    "task_chat_completion_hook",
    "transcript",
  ]) {
    expectCode(
      () => normalizePersonalWorkSessionCommand({ ...base, [field]: "forbidden" }),
      WorkSessionLifecycleError,
      "work_session_unknown_field",
    );
  }
  for (const sample of [
    "whole conversation",
    "whole task chat",
    "RAW_TASK_CHAT",
    "raw conversation",
    "raw completion hook",
    "begin transcript",
    "begin conversation",
    "SCREEN_CAPTURE",
    "screen recording",
    "keyboard logging",
    "KEYSTROKE_LOG",
    "keystroke logging",
    "broad OS activity",
    "OS_MONITORING",
    "broad OS surveillance",
    "TASK_CHAT_COMPLETION_HOOK",
    "Bearer synthetic-secret-value",
    "password=synthetic-value",
    "sk-syntheticsecretvalue",
    "Private source C:\\Synthetic\\private.txt",
    "\\\\synthetic-host\\private\\source.txt",
    "Private source /home/synthetic/private.txt",
    "Private source /var/lib/synthetic/private.txt",
    "Private source _workspaces/P26/private.txt",
    "file://C:/Synthetic/private.txt",
    "user: do the task\nassistant: copied the whole response",
  ]) {
    assert.equal(
      boundedSummaryReject.test(sample),
      true,
      `schema bounded-summary pattern must reject: ${sample}`,
    );
    expectCode(
      () => normalizePersonalWorkSessionCommand({ ...base, summary: sample }),
      WorkSessionLifecycleError,
      "work_session_raw_capture_forbidden",
    );
  }
  expectCode(
    () => normalizePersonalWorkSessionCommand({
      ...base,
      opaque_thread_ref: "codex-thread-raw-123",
    }),
    WorkSessionLifecycleError,
    "work_session_opaque_thread_required",
  );
  expectCode(
    () => normalizePersonalWorkSessionCommand({
      ...closeoutCommand(
        {
          session_id: "pws_synth_001",
          node_id: "node_synth_primary",
          opaque_thread_ref: THREAD_A,
        },
        `sha256:${"1".repeat(64)}`,
      ),
      official_completion: true,
    }),
    WorkSessionLifecycleError,
    "work_session_unknown_field",
  );
  expectCode(
    () => normalizePersonalWorkSessionCommand({
      ...closeoutCommand(
        {
          session_id: "pws_synth_001",
          node_id: "node_synth_primary",
          opaque_thread_ref: THREAD_A,
        },
        `sha256:${"1".repeat(64)}`,
      ),
      completion_proposal: {
        proposal_kind: "task_completion",
        authority_state: "official",
        summary: "Invalid authority request.",
        evidence_refs: [],
        artifact_refs: [],
      },
    }),
    WorkSessionLifecycleError,
    "work_session_completion_authority_forbidden",
  );
  const completedWithoutProposal = closeoutCommand(
    {
      session_id: "pws_synth_001",
      node_id: "node_synth_primary",
      opaque_thread_ref: THREAD_A,
    },
    `sha256:${"1".repeat(64)}`,
  );
  delete completedWithoutProposal.completion_proposal;
  expectCode(
    () => normalizePersonalWorkSessionCommand(completedWithoutProposal),
    WorkSessionLifecycleError,
    "work_session_completion_proposal_required",
  );
  for (const closeoutKind of ["blocked", "handoff", "abandoned"]) {
    const terminalWithoutProposal = closeoutCommand(
      {
        session_id: "pws_synth_001",
        node_id: "node_synth_primary",
        opaque_thread_ref: THREAD_A,
      },
      `sha256:${"1".repeat(64)}`,
      { closeout_kind: closeoutKind },
    );
    assert.equal(
      normalizePersonalWorkSessionCommand(terminalWithoutProposal).completion_proposal,
      undefined,
    );
    expectCode(
      () => normalizePersonalWorkSessionCommand({
        ...terminalWithoutProposal,
        completion_proposal: {
          proposal_kind: "task_completion",
          authority_state: "proposal_only",
          summary: `Must not exist for ${closeoutKind} closeout.`,
          evidence_refs: [],
          artifact_refs: [],
        },
      }),
      WorkSessionLifecycleError,
      "work_session_completion_proposal_forbidden",
    );
  }
});

test("feature-OFF default preserves the legacy one-shot API and blocks lifecycle creation", () => {
  const f = fixture({ enabled: false });
  try {
    const legacy = f.service.publishWorkSession(f.account, {
      item_id: f.item.id,
      idempotency_key: "legacy-session-synth-0001",
      summary: "Legacy bounded one-shot remains separate.",
      outputs: [],
      next_actions: [],
      stop_conditions: [],
      artifact_ids: [],
    });
    assert.equal(legacy.ok, true);
    assert.equal(
      f.store.db.prepare(
        "SELECT COUNT(*) AS n FROM erp_mcp_work_session",
      ).get().n,
      1,
    );
    const disabledCalls = [
      () => f.service.registerPersonalWorkSessionNode(null, null),
      () => f.service.startPersonalWorkSession(null, {
        item_id: "does_not_exist",
        project_id: "does_not_exist",
      }),
      () => f.service.appendPersonalWorkSessionEvent(null, {
        session_id: "does_not_exist",
      }),
      () => f.service.personalWorkSession(null, "does_not_exist"),
      () => f.service.missingPersonalWorkSessionCloseouts(null),
      () => f.service.verifyPersonalWorkSessionReceipt(null, {
        command: null,
        receipt: null,
      }),
    ];
    for (const call of disabledCalls) {
      expectCode(
        call,
        ErpMcpError,
        "work_session_lifecycle_disabled",
        404,
      );
    }
    const table = f.store.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='erp_mcp_personal_work_session'",
    ).get();
    assert.equal(table, undefined, "feature OFF must not initialize lifecycle tables");
  } finally {
    f.close();
  }
});

test("assignment-bound lifecycle enforces cardinality, ordering, handoff, and proposal-only closeout", () => {
  const f = fixture();
  try {
    registerNodes(f);
    expectCode(
      () => f.service.startPersonalWorkSession(f.account, startCommand(f, {
        node_id: "node_synth_unregistered",
        idempotency_key: "start-command-unregistered-0000",
      })),
      ErpMcpError,
      "work_session_registered_node_required",
      403,
    );
    expectCode(
      () => f.service.startPersonalWorkSession(f.account, startCommand(f, {
        project_id: "P26-WRONG",
        idempotency_key: "start-command-project-mismatch-0000",
      })),
      ErpMcpError,
      "work_session_assignment_project_mismatch",
      409,
    );
    const firstCommand = startCommand(f);
    const first = f.service.startPersonalWorkSession(f.account, firstCommand);
    assert.equal(first.receipt.status, "accepted");
    assert.equal(first.receipt.projection_advanced, true);
    const replay = f.service.startPersonalWorkSession(f.account, firstCommand);
    assert.equal(replay.receipt.status, "duplicate");
    assert.equal(replay.receipt.accepted_receipt_id, first.receipt.receipt_id);
    assert.equal(replay.receipt.accepted_event_digest, first.receipt.command_digest);
    const changedReplay = f.service.startPersonalWorkSession(f.account, {
      ...firstCommand,
      opaque_thread_ref: THREAD_B,
    });
    assert.equal(changedReplay.receipt.status, "quarantined");
    assert.equal(changedReplay.receipt.reason_code, "idempotency_digest_conflict");

    const competing = f.service.startPersonalWorkSession(f.account, startCommand(f, {
      idempotency_key: "start-command-synth-0002",
      opaque_thread_ref: THREAD_B,
    }));
    assert.equal(competing.receipt.status, "rejected");
    assert.equal(competing.receipt.reason_code, "active_primary_exists");
    assert.equal(
      f.store.db.prepare(
        "SELECT COUNT(*) AS n FROM erp_mcp_personal_work_session WHERE lifecycle_state='active'",
      ).get().n,
      1,
    );

    const held = f.service.appendPersonalWorkSessionEvent(
      f.account,
      checkpointCommand(first.session, first.receipt.command_digest, {
        idempotency_key: "checkpoint-synth-gap-0001",
        sequence: 2,
      }),
    );
    assert.equal(held.receipt.status, "held_gap");
    assert.equal(held.receipt.projection_advanced, false);

    const checkpointCommandOne = checkpointCommand(
      first.session,
      first.receipt.command_digest,
    );
    const checkpoint = f.service.appendPersonalWorkSessionEvent(
      f.account,
      checkpointCommandOne,
    );
    assert.equal(checkpoint.receipt.status, "accepted");
    assert.equal(checkpoint.session.last_sequence, 1);
    const duplicate = f.service.appendPersonalWorkSessionEvent(
      f.account,
      checkpointCommandOne,
    );
    assert.equal(duplicate.receipt.status, "duplicate");
    assert.equal(duplicate.receipt.accepted_receipt_id, checkpoint.receipt.receipt_id);

    const quarantined = f.service.appendPersonalWorkSessionEvent(
      f.account,
      checkpointCommand(first.session, first.receipt.command_digest, {
        idempotency_key: "checkpoint-synth-conflict-0002",
        summary: "Conflicting sequence metadata.",
      }),
    );
    assert.equal(quarantined.receipt.status, "quarantined");
    assert.equal(quarantined.receipt.projection_advanced, false);

    const directActiveSupersession = f.service.startPersonalWorkSession(
      f.account,
      startCommand(f, {
        node_id: "node_synth_handoff",
        opaque_thread_ref: THREAD_B,
        idempotency_key: "start-command-direct-active-0003",
        supersedes_session_id: first.session.session_id,
      }),
    );
    assert.equal(directActiveSupersession.receipt.status, "rejected");
    assert.equal(
      directActiveSupersession.receipt.reason_code,
      "active_primary_exists",
    );

    const handoffCloseout = f.service.appendPersonalWorkSessionEvent(
      f.account,
      closeoutCommand(first.session, checkpoint.receipt.command_digest, {
        closeout_kind: "handoff",
        idempotency_key: "closeout-handoff-terminal-0003",
        sequence: 2,
      }),
    );
    assert.equal(handoffCloseout.receipt.status, "accepted");
    assert.equal(handoffCloseout.receipt.completion_proposal_status, null);
    assert.equal(handoffCloseout.event.closeout_kind, "handoff");
    assert.equal(handoffCloseout.event.completion_proposal, null);
    assert.equal(handoffCloseout.session.lifecycle_state, "closed");
    assert.equal(handoffCloseout.session.terminal_closeout_kind, "handoff");

    const omittedHandoffPredecessor = f.service.startPersonalWorkSession(
      f.account,
      startCommand(f, {
        node_id: "node_synth_handoff",
        opaque_thread_ref: THREAD_B,
        idempotency_key: "start-command-omitted-handoff-0004",
      }),
    );
    assert.equal(omittedHandoffPredecessor.receipt.status, "rejected");
    assert.equal(
      omittedHandoffPredecessor.receipt.reason_code,
      "successor_supersedes_required",
    );

    const wrongAssignment = f.service.startPersonalWorkSession(
      f.account,
      startCommand(f, {
        assignment_epoch: "assignment_epoch_synth_wrong",
        node_id: "node_synth_handoff",
        opaque_thread_ref: THREAD_B,
        idempotency_key: "start-command-wrong-assignment-0004",
        supersedes_session_id: first.session.session_id,
      }),
    );
    assert.equal(wrongAssignment.receipt.status, "rejected");
    assert.equal(
      wrongAssignment.receipt.reason_code,
      "handoff_predecessor_binding_mismatch",
    );
    const otherItem = f.store.createItem({
      project_id: f.item.project_id,
      title: "Other synthetic assignment",
      assignee_ref: "pc-worker@example.com",
      status: "doing",
      data_label: "synthetic",
    }).item;
    const wrongItem = f.service.startPersonalWorkSession(
      f.account,
      startCommand(f, {
        item_id: otherItem.id,
        node_id: "node_synth_handoff",
        opaque_thread_ref: THREAD_B,
        idempotency_key: "start-command-wrong-item-0005",
        supersedes_session_id: first.session.session_id,
      }),
    );
    assert.equal(wrongItem.receipt.status, "rejected");
    assert.equal(
      wrongItem.receipt.reason_code,
      "handoff_predecessor_binding_mismatch",
    );

    f.clock.value += 120000;
    const handoff = f.service.startPersonalWorkSession(f.account, startCommand(f, {
      node_id: "node_synth_handoff",
      opaque_thread_ref: THREAD_B,
      idempotency_key: "start-command-synth-handoff-0006",
      started_at: new Date(f.clock.value).toISOString(),
      supersedes_session_id: first.session.session_id,
    }));
    assert.equal(handoff.receipt.status, "accepted");
    assert.equal(handoff.session.previous_session_id, first.session.session_id);
    assert.equal(
      f.service.personalWorkSession(f.account, first.session.session_id).lifecycle_state,
      "superseded",
    );
    assert.equal(
      f.service.personalWorkSession(f.account, first.session.session_id).superseded_by_session_id,
      handoff.session.session_id,
    );

    const oldFollowup = f.service.appendPersonalWorkSessionEvent(
      f.account,
      checkpointCommand(first.session, handoffCloseout.receipt.command_digest, {
        idempotency_key: "checkpoint-old-terminal-0007",
        sequence: 3,
      }),
    );
    assert.equal(oldFollowup.receipt.status, "rejected");
    assert.equal(oldFollowup.receipt.reason_code, "session_terminal");

    const handoffCheckpoint = f.service.appendPersonalWorkSessionEvent(
      f.account,
      checkpointCommand(handoff.session, handoff.receipt.command_digest, {
        idempotency_key: "checkpoint-handoff-0004",
      }),
    );
    const statusBefore = f.store.db.prepare(
      "SELECT status FROM core_item WHERE id=?",
    ).get(f.item.id).status;
    const closeout = f.service.appendPersonalWorkSessionEvent(
      f.account,
      closeoutCommand(handoff.session, handoffCheckpoint.receipt.command_digest),
    );
    assert.equal(closeout.receipt.status, "accepted");
    assert.equal(closeout.receipt.completion_proposal_status, "pending");
    assert.equal(closeout.receipt.official_completion, false);
    assert.equal(closeout.receipt.task_delta, 0);
    assert.equal(closeout.receipt.history_delta, 0);
    assert.equal(closeout.receipt.knowledge_delta, 0);
    assert.equal(closeout.event.closeout_kind, "completed_candidate");
    assert.equal(closeout.event.completion_proposal.authority_state, "proposal_only");
    assert.equal(closeout.session.lifecycle_state, "closed");
    assert.equal(
      f.store.db.prepare("SELECT status FROM core_item WHERE id=?").get(f.item.id).status,
      statusBefore,
      "closeout must not write official ERP completion",
    );

    const omittedCompletedPredecessor = f.service.startPersonalWorkSession(
      f.account,
      startCommand(f, {
        node_id: "node_synth_primary",
        opaque_thread_ref: THREAD_A,
        idempotency_key: "start-command-omitted-completed-0007",
      }),
    );
    assert.equal(omittedCompletedPredecessor.receipt.status, "rejected");
    assert.equal(
      omittedCompletedPredecessor.receipt.reason_code,
      "successor_supersedes_required",
    );
    const firstStartInNewEpoch = f.service.startPersonalWorkSession(
      f.account,
      startCommand(f, {
        assignment_epoch: "assignment_epoch_synth_002",
        idempotency_key: "start-command-new-epoch-0008",
      }),
    );
    assert.equal(firstStartInNewEpoch.receipt.status, "accepted");
    assert.equal(firstStartInNewEpoch.session.previous_session_id, null);

    const terminalFollowup = f.service.appendPersonalWorkSessionEvent(
      f.account,
      checkpointCommand(handoff.session, closeout.receipt.command_digest, {
        idempotency_key: "checkpoint-after-closeout-0005",
        sequence: 3,
      }),
    );
    assert.equal(terminalFollowup.receipt.status, "rejected");
    const mutationTotals = f.store.db.prepare(
      `SELECT SUM(task_delta) AS task_delta,SUM(history_delta) AS history_delta,
              SUM(knowledge_delta) AS knowledge_delta,SUM(official_completion) AS official
       FROM erp_mcp_personal_work_session_event`,
    ).get();
    assert.deepEqual({ ...mutationTotals }, {
      task_delta: 0,
      history_delta: 0,
      knowledge_delta: 0,
      official: 0,
    });
  } finally {
    f.close();
  }
});

test("missing-closeout is derived only from accepted server starts and configurable SLA", () => {
  const f = fixture({ missingCloseoutAfterMs: 1000 });
  const outboxRoot = join(f.root, "local-outbox");
  try {
    registerNodes(f);
    const outbox = createWorkSessionOutbox({
      root: outboxRoot,
      now: () => f.clock.value,
    });
    outbox.enqueue(startCommand(f));
    assert.deepEqual(
      f.service.missingPersonalWorkSessionCloseouts(f.account),
      [],
      "client-local pending must not be treated as a server missing-closeout",
    );

    const acceptedAt = new Date(f.clock.value).toISOString();
    const backdatedStartedAt = new Date(
      f.clock.value - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const futureStartedAt = new Date(
      f.clock.value + 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const backdated = f.service.startPersonalWorkSession(
      f.account,
      startCommand(f, {
        assignment_epoch: "assignment_epoch_backdated",
        idempotency_key: "start-command-backdated-0002",
        started_at: backdatedStartedAt,
      }),
    );
    const future = f.service.startPersonalWorkSession(
      f.account,
      startCommand(f, {
        assignment_epoch: "assignment_epoch_future",
        idempotency_key: "start-command-future-0003",
        started_at: futureStartedAt,
      }),
    );
    for (const started of [backdated, future]) {
      assert.equal(started.receipt.recorded_at, acceptedAt);
      assert.equal(started.session.accepted_at, acceptedAt);
    }
    assert.equal(backdated.session.started_at, backdatedStartedAt);
    assert.equal(future.session.started_at, futureStartedAt);
    assert.deepEqual(
      f.service.missingPersonalWorkSessionCloseouts(f.account),
      [],
      "a backdated client occurrence clock must not trigger missing-closeout early",
    );

    f.clock.value += 1001;
    const missing = f.service.missingPersonalWorkSessionCloseouts(f.account);
    assert.equal(missing.length, 2);
    const missingBySession = new Map(
      missing.map((candidate) => [candidate.session_id, candidate]),
    );
    for (const started of [backdated, future]) {
      const candidate = missingBySession.get(started.session.session_id);
      assert.ok(candidate, "server-accepted active start must reach the SLA");
      assert.equal(
        candidate.accepted_start_receipt_id,
        started.receipt.receipt_id,
      );
      assert.equal(candidate.accepted_at, acceptedAt);
      assert.equal(candidate.started_at, started.session.started_at);
      assert.equal(candidate.candidate_state, "accepted_start_missing_closeout");
    }
    assert.equal(
      missingBySession.has(future.session.session_id),
      true,
      "a future client occurrence clock must not evade server-clock SLA",
    );

    for (const [index, started] of [backdated, future].entries()) {
      const closed = f.service.appendPersonalWorkSessionEvent(
        f.account,
        closeoutCommand(started.session, started.receipt.command_digest, {
          idempotency_key: `closeout-missing-synth-000${index + 4}`,
          sequence: 1,
          occurred_at: new Date(f.clock.value).toISOString(),
        }),
      );
      assert.equal(closed.receipt.status, "accepted");
    }
    assert.deepEqual(f.service.missingPersonalWorkSessionCloseouts(f.account), []);
  } finally {
    f.close();
  }
});

test("durable local outbox replays after restart and compacts only accepted or proven duplicate receipts", () => {
  const f = fixture();
  const outboxRoot = join(f.root, "local-outbox");
  try {
    registerNodes(f);
    const command = startCommand(f);
    const trustedVerifier = ({ command: queuedCommand, receipt }) =>
      f.service.verifyPersonalWorkSessionReceipt(f.account, {
        command: queuedCommand,
        receipt,
      });
    let outbox = createWorkSessionOutbox({
      root: outboxRoot,
      now: () => f.clock.value,
    });
    const queued = outbox.enqueue(command);
    const replayedQueue = outbox.enqueue(command);
    assert.equal(replayedQueue.replayed, true);
    assert.equal(replayedQueue.entry.outbox_id, queued.entry.outbox_id);
    assert.equal(replayedQueue.entry.command_digest, queued.entry.command_digest);
    expectCode(
      () => outbox.enqueue({ ...command, opaque_thread_ref: THREAD_B }),
      WorkSessionOutboxError,
      "work_session_outbox_idempotency_conflict",
      409,
    );
    expectCode(
      () => outbox.compact(queued.entry.outbox_id),
      WorkSessionOutboxError,
      "work_session_outbox_compact_before_accepted_ack",
      409,
    );
    outbox.markAttempt(queued.entry.outbox_id);

    const acceptedAtServer = f.service.startPersonalWorkSession(f.account, command);
    assert.equal(acceptedAtServer.receipt.status, "accepted");

    outbox = createWorkSessionOutbox({
      root: outboxRoot,
      now: () => f.clock.value,
    });
    const afterServerCommitCrash = outbox.get(queued.entry.outbox_id);
    assert.equal(afterServerCommitCrash.state, "pending");
    assert.equal(afterServerCommitCrash.attempt_count, 1);
    const duplicate = f.service.startPersonalWorkSession(f.account, command);
    assert.equal(duplicate.receipt.status, "duplicate");
    expectCode(
      () => outbox.applyServerReceipt(
        queued.entry.outbox_id,
        duplicate.receipt,
      ),
      WorkSessionOutboxError,
      "work_session_outbox_trusted_verifier_required",
      503,
    );
    outbox = createWorkSessionOutbox({
      root: outboxRoot,
      now: () => f.clock.value,
      acceptedReceiptVerifier: trustedVerifier,
    });
    for (const fabricated of [
      {
        ...acceptedAtServer.receipt,
        session_id: "pws_fabricated_accepted_session",
      },
      { ...acceptedAtServer.receipt, sequence: 1 },
      { ...duplicate.receipt, session_id: "pws_fabricated_session" },
      {
        ...duplicate.receipt,
        accepted_receipt_id: "pws_receipt_fabricated_proof",
      },
    ]) {
      assert.equal(
        f.service.verifyPersonalWorkSessionReceipt(f.account, {
          command,
          receipt: fabricated,
        }),
        false,
      );
      expectCode(
        () => outbox.applyServerReceipt(
          queued.entry.outbox_id,
          fabricated,
        ),
        WorkSessionOutboxError,
        "work_session_outbox_untrusted_receipt",
        409,
      );
      assert.equal(outbox.get(queued.entry.outbox_id).state, "pending");
    }
    assert.equal(
      f.service.verifyPersonalWorkSessionReceipt(f.account, {
        command,
        receipt: duplicate.receipt,
      }),
      true,
    );
    const acknowledged = outbox.applyServerReceipt(
      queued.entry.outbox_id,
      duplicate.receipt,
    );
    assert.equal(acknowledged.accepted, true);
    assert.equal(acknowledged.entry.state, "accepted");
    assert.equal(
      acknowledged.entry.accepted_ack.accepted_receipt_id,
      acceptedAtServer.receipt.receipt_id,
    );

    outbox = createWorkSessionOutbox({
      root: outboxRoot,
      now: () => f.clock.value,
      acceptedReceiptVerifier: trustedVerifier,
    });
    assert.equal(
      outbox.get(queued.entry.outbox_id).state,
      "accepted",
      "accepted ack must survive restart before compact",
    );
    outbox.compact(queued.entry.outbox_id);
    assert.deepEqual(outbox.list(), []);

    const gapCommand = checkpointCommand(
      acceptedAtServer.session,
      acceptedAtServer.receipt.command_digest,
      {
        idempotency_key: "checkpoint-outbox-gap-0002",
        sequence: 2,
      },
    );
    const gapEntry = outbox.enqueue(gapCommand).entry;
    const held = f.service.appendPersonalWorkSessionEvent(f.account, gapCommand);
    assert.equal(held.receipt.status, "held_gap");
    const retained = outbox.applyServerReceipt(gapEntry.outbox_id, held.receipt);
    assert.equal(retained.accepted, false);
    assert.equal(retained.entry.state, "pending");
    assert.equal(retained.entry.last_receipt.status, "held_gap");
    expectCode(
      () => outbox.compact(gapEntry.outbox_id),
      WorkSessionOutboxError,
      "work_session_outbox_compact_before_accepted_ack",
      409,
    );

    const acceptedCheckpoint = f.service.appendPersonalWorkSessionEvent(
      f.account,
      checkpointCommand(
        acceptedAtServer.session,
        acceptedAtServer.receipt.command_digest,
        { idempotency_key: "checkpoint-server-accepted-0003" },
      ),
    );
    assert.equal(acceptedCheckpoint.receipt.status, "accepted");
    const quarantineCommand = checkpointCommand(
      acceptedAtServer.session,
      acceptedAtServer.receipt.command_digest,
      {
        idempotency_key: "checkpoint-outbox-quarantine-0004",
        summary: "Conflicting accepted sequence metadata.",
      },
    );
    const quarantineEntry = outbox.enqueue(quarantineCommand).entry;
    const quarantined = f.service.appendPersonalWorkSessionEvent(
      f.account,
      quarantineCommand,
    );
    assert.equal(quarantined.receipt.status, "quarantined");
    assert.equal(
      outbox.applyServerReceipt(
        quarantineEntry.outbox_id,
        quarantined.receipt,
      ).entry.state,
      "pending",
    );

    const rejectedCommand = checkpointCommand(
      acceptedAtServer.session,
      acceptedCheckpoint.receipt.command_digest,
      {
        idempotency_key: "checkpoint-outbox-rejected-0005",
        sequence: 2,
        node_id: "node_synth_handoff",
        opaque_thread_ref: THREAD_B,
      },
    );
    const rejectedEntry = outbox.enqueue(rejectedCommand).entry;
    const rejected = f.service.appendPersonalWorkSessionEvent(
      f.account,
      rejectedCommand,
    );
    assert.equal(rejected.receipt.status, "rejected");
    assert.equal(
      outbox.applyServerReceipt(
        rejectedEntry.outbox_id,
        rejected.receipt,
      ).entry.state,
      "pending",
    );
    assert.deepEqual(
      outbox.pending().map((entry) => entry.last_receipt?.status).sort(),
      ["held_gap", "quarantined", "rejected"],
    );
  } finally {
    f.close();
  }
});
