import { DatabaseSync } from "node:sqlite";

const DDL = `
CREATE TABLE IF NOT EXISTS task_execution_event_poc (
  event_id TEXT PRIMARY KEY,
  task_key TEXT NOT NULL,
  task_ref_json TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  ingested_at TEXT NOT NULL,
  payload_digest TEXT NOT NULL,
  UNIQUE(provider, provider_event_id)
);

CREATE TRIGGER IF NOT EXISTS trg_task_execution_event_poc_no_update
BEFORE UPDATE ON task_execution_event_poc
BEGIN SELECT RAISE(ABORT, 'task_execution_event_append_only'); END;

CREATE TRIGGER IF NOT EXISTS trg_task_execution_event_poc_no_delete
BEFORE DELETE ON task_execution_event_poc
BEGIN SELECT RAISE(ABORT, 'task_execution_event_append_only'); END;

CREATE TABLE IF NOT EXISTS task_execution_agent_run_poc (
  run_id TEXT PRIMARY KEY,
  task_key TEXT NOT NULL,
  dispatch_idempotency_key TEXT NOT NULL UNIQUE,
  execution_key TEXT NOT NULL UNIQUE,
  project_ref_json TEXT NOT NULL,
  work_brief_revision_ref_json TEXT NOT NULL,
  executor_ref TEXT NOT NULL,
  authority_ref TEXT NOT NULL,
  attempt_no INTEGER NOT NULL CHECK(attempt_no>=1),
  run_order INTEGER NOT NULL UNIQUE CHECK(run_order>=1),
  status TEXT NOT NULL CHECK(status IN ('claimed','running','waiting','succeeded','failed','cancelled')),
  task_json TEXT NOT NULL,
  claimed_at TEXT NOT NULL,
  started_at TEXT,
  ended_at TEXT
);

CREATE TABLE IF NOT EXISTS task_execution_agent_run_event_poc (
  event_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES task_execution_agent_run_poc(run_id),
  task_key TEXT NOT NULL,
  task_ref_json TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK(sequence>=1),
  state TEXT NOT NULL CHECK(state IN ('claimed','running','waiting','succeeded','failed','cancelled')),
  idempotency_key TEXT NOT NULL UNIQUE,
  occurred_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  ingested_at TEXT NOT NULL,
  event_digest TEXT NOT NULL,
  UNIQUE(run_id, sequence)
);

CREATE TRIGGER IF NOT EXISTS trg_task_execution_agent_run_event_poc_no_update
BEFORE UPDATE ON task_execution_agent_run_event_poc
BEGIN SELECT RAISE(ABORT, 'task_execution_run_event_append_only'); END;

CREATE TRIGGER IF NOT EXISTS trg_task_execution_agent_run_event_poc_no_delete
BEFORE DELETE ON task_execution_agent_run_event_poc
BEGIN SELECT RAISE(ABORT, 'task_execution_run_event_append_only'); END;

CREATE UNIQUE INDEX IF NOT EXISTS idx_task_execution_agent_run_poc_active
  ON task_execution_agent_run_poc(task_key)
  WHERE status IN ('claimed','running','waiting');

CREATE TABLE IF NOT EXISTS task_execution_receipt_poc (
  receipt_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL UNIQUE REFERENCES task_execution_agent_run_poc(run_id),
  receipt_json TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS trg_task_execution_receipt_poc_no_update
BEFORE UPDATE ON task_execution_receipt_poc
BEGIN SELECT RAISE(ABORT, 'task_execution_receipt_append_only'); END;

CREATE TRIGGER IF NOT EXISTS trg_task_execution_receipt_poc_no_delete
BEFORE DELETE ON task_execution_receipt_poc
BEGIN SELECT RAISE(ABORT, 'task_execution_receipt_append_only'); END;
`;

export class TaskExecutionStoreError extends Error {
  constructor(code) {
    super(code);
    this.name = "TaskExecutionStoreError";
    this.code = code;
  }
}

function transaction(db, callback) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = callback();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch {}
    throw error;
  }
}

function publicRun(row) {
  if (!row) return null;
  return {
    run_id: row.run_id,
    task_ref: JSON.parse(row.task_json),
    project_ref: JSON.parse(row.project_ref_json),
    work_brief_revision_ref: JSON.parse(row.work_brief_revision_ref_json),
    executor_ref: row.executor_ref,
    authority_ref: row.authority_ref,
    dispatch_idempotency_key: row.dispatch_idempotency_key,
    execution_key: row.execution_key,
    attempt_no: Number(row.attempt_no),
    run_order: Number(row.run_order),
    status: row.status,
    claimed_at: row.claimed_at,
    started_at: row.started_at ?? null,
    ended_at: row.ended_at ?? null,
  };
}

function publicEvent(row) {
  if (!row) return null;
  return {
    event_id: row.event_id,
    provider: row.provider,
    provider_event_id: row.provider_event_id,
    idempotency_key: row.idempotency_key,
    event_type: row.event_type,
    task_ref: JSON.parse(row.task_ref_json),
    occurred_at: row.occurred_at,
    received_at: row.received_at,
    ingested_at: row.ingested_at,
    payload_digest: row.payload_digest,
  };
}

function publicRunEvent(row) {
  return {
    event_id: row.event_id,
    run_id: row.run_id,
    task_ref: JSON.parse(row.task_ref_json),
    sequence: Number(row.sequence),
    state: row.state,
    idempotency_key: row.idempotency_key,
    occurred_at: row.occurred_at,
    received_at: row.received_at,
    ingested_at: row.ingested_at,
    event_digest: row.event_digest,
  };
}

function insertRunEvent(db, event) {
  db.prepare(`
    INSERT INTO task_execution_agent_run_event_poc(
      event_id, run_id, task_key, task_ref_json, sequence, state, idempotency_key,
      occurred_at, received_at, ingested_at, event_digest
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.event_id,
    event.run_id,
    event.task_key,
    JSON.stringify(event.task_ref),
    event.sequence,
    event.state,
    event.idempotency_key,
    event.occurred_at,
    event.received_at,
    event.ingested_at,
    event.event_digest,
  );
}

function assertRunEventBinding(db, runId, event, expectedState, expectedSequence) {
  const run = db.prepare(
    "SELECT task_key, task_json, dispatch_idempotency_key FROM task_execution_agent_run_poc WHERE run_id=?",
  ).get(runId);
  if (!run
    || event?.run_id !== runId
    || event?.task_key !== run.task_key
    || event?.state !== expectedState
    || event?.sequence !== expectedSequence
    || event?.idempotency_key !== `${run.dispatch_idempotency_key}:${expectedState}`) {
    throw new TaskExecutionStoreError("RUN_EVENT_TASK_MISMATCH");
  }
  const runTask = JSON.parse(run.task_json);
  if (event.task_ref?.provider !== runTask.provider
    || event.task_ref?.task_id !== runTask.task_id) {
    throw new TaskExecutionStoreError("RUN_EVENT_TASK_MISMATCH");
  }
}

function sameTaskRef(left, right) {
  return left?.provider === right?.provider && left?.task_id === right?.task_id;
}

function sameBriefRef(left, right) {
  return sameTaskRef(left, right)
    && left?.revision_id === right?.revision_id
    && left?.digest === right?.digest;
}

function assertReceiptBinding(db, runId, status, receipt) {
  const run = db.prepare(
    "SELECT * FROM task_execution_agent_run_poc WHERE run_id=?",
  ).get(runId);
  if (!run
    || receipt?.run_id !== runId
    || receipt?.outcome !== status
    || !sameTaskRef(receipt?.task_ref, JSON.parse(run.task_json))
    || !sameBriefRef(receipt?.work_brief_revision_ref,
      JSON.parse(run.work_brief_revision_ref_json))
    || receipt?.executor_ref !== run.executor_ref
    || receipt?.authority_ref !== run.authority_ref
    || receipt?.dispatch_idempotency_key !== run.dispatch_idempotency_key
    || receipt?.execution_key !== run.execution_key
    || receipt?.official_task_done !== false
    || receipt?.official_task_mutated !== false) {
    throw new TaskExecutionStoreError("RECEIPT_BINDING_MISMATCH");
  }
}

export class SqliteEventStore {
  #db;

  constructor({ filename = ":memory:" } = {}) {
    if (filename !== ":memory:") {
      throw new TaskExecutionStoreError("TASK_EXECUTION_PERSISTENCE_FORBIDDEN");
    }
    this.#db = new DatabaseSync(filename);
    this.#db.exec("PRAGMA foreign_keys=ON;");
    this.#db.exec(DDL);
  }

  appendProviderEvent(event) {
    return transaction(this.#db, () => {
      const byKey = this.#db.prepare(`
        SELECT * FROM task_execution_event_poc WHERE idempotency_key=?
      `).get(event.idempotency_key);
      const byProviderEvent = this.#db.prepare(`
        SELECT * FROM task_execution_event_poc WHERE provider=? AND provider_event_id=?
      `).get(event.provider, event.provider_event_id);
      if (byKey && byProviderEvent && byKey.event_id !== byProviderEvent.event_id) {
        throw new TaskExecutionStoreError("PROVIDER_EVENT_CONFLICT");
      }
      const existing = byKey ?? byProviderEvent;
      if (existing) {
        if (existing.provider !== event.provider
          || existing.provider_event_id !== event.provider_event_id
          || existing.idempotency_key !== event.idempotency_key
          || existing.task_key !== event.task_key
          || existing.event_type !== event.event_type
          || existing.payload_digest !== event.payload_digest) {
          throw new TaskExecutionStoreError("PROVIDER_EVENT_CONFLICT");
        }
        return { status: "duplicate", event: publicEvent(existing) };
      }
      this.#db.prepare(`
        INSERT INTO task_execution_event_poc(
          event_id, task_key, task_ref_json, provider, provider_event_id, idempotency_key,
          event_type, occurred_at, received_at, ingested_at, payload_digest
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        event.event_id,
        event.task_key,
        JSON.stringify(event.task_ref),
        event.provider,
        event.provider_event_id,
        event.idempotency_key,
        event.event_type,
        event.occurred_at,
        event.received_at,
        event.ingested_at,
        event.payload_digest,
      );
      const inserted = this.#db.prepare(`
        SELECT * FROM task_execution_event_poc WHERE event_id=?
      `).get(event.event_id);
      return { status: "accepted", event: publicEvent(inserted) };
    });
  }

  findDispatch(idempotencyKey, taskKey) {
    const row = this.#db.prepare(
      "SELECT * FROM task_execution_agent_run_poc WHERE dispatch_idempotency_key=?",
    ).get(idempotencyKey);
    if (!row) return null;
    if (row.task_key !== taskKey) {
      throw new TaskExecutionStoreError("IDEMPOTENCY_CONFLICT");
    }
    const receipt = this.#db.prepare(
      "SELECT receipt_json FROM task_execution_receipt_poc WHERE run_id=?",
    ).get(row.run_id);
    return {
      run: publicRun(row),
      receipt: receipt ? JSON.parse(receipt.receipt_json) : null,
    };
  }

  claim(run, event) {
    return transaction(this.#db, () => {
      const existing = this.#db.prepare(
        "SELECT * FROM task_execution_agent_run_poc WHERE dispatch_idempotency_key=?",
      ).get(run.dispatch_idempotency_key);
      if (existing) {
        if (existing.task_key !== run.task_key || existing.execution_key !== run.execution_key) {
          throw new TaskExecutionStoreError("IDEMPOTENCY_CONFLICT");
        }
        const receipt = this.#db.prepare(
          "SELECT receipt_json FROM task_execution_receipt_poc WHERE run_id=?",
        ).get(existing.run_id);
        return {
          status: "existing",
          run: publicRun(existing),
          receipt: receipt ? JSON.parse(receipt.receipt_json) : null,
        };
      }
      const active = this.#db.prepare(`
        SELECT * FROM task_execution_agent_run_poc
        WHERE task_key=? AND status IN ('claimed','running','waiting')
        ORDER BY claimed_at, run_id LIMIT 1
      `).get(run.task_key);
      if (active) {
        return { status: "active_exists", run: publicRun(active) };
      }
      const runOrder = Number(this.#db.prepare(
        "SELECT COALESCE(MAX(run_order), 0) + 1 AS next_order FROM task_execution_agent_run_poc",
      ).get().next_order);
      this.#db.prepare(`
        INSERT INTO task_execution_agent_run_poc(
          run_id, task_key, dispatch_idempotency_key, execution_key,
          project_ref_json, work_brief_revision_ref_json, executor_ref, authority_ref, attempt_no, run_order,
          status, task_json, claimed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'claimed', ?, ?)
      `).run(
        run.run_id,
        run.task_key,
        run.dispatch_idempotency_key,
        run.execution_key,
        JSON.stringify(run.project_ref),
        JSON.stringify(run.work_brief_revision_ref),
        run.executor_ref,
        run.authority_ref,
        run.attempt_no,
        runOrder,
        JSON.stringify(run.task_ref),
        run.claimed_at,
      );
      assertRunEventBinding(this.#db, run.run_id, event, "claimed", 1);
      insertRunEvent(this.#db, event);
      return {
        status: "claimed",
        run: publicRun(this.#db.prepare(
          "SELECT * FROM task_execution_agent_run_poc WHERE run_id=?",
        ).get(run.run_id)),
      };
    });
  }

  markRunning(runId, at, event) {
    return transaction(this.#db, () => {
      const update = this.#db.prepare(`
        UPDATE task_execution_agent_run_poc
        SET status='running', started_at=?
        WHERE run_id=? AND status='claimed'
      `).run(at, runId);
      if (Number(update.changes) !== 1) {
        throw new TaskExecutionStoreError("INVALID_RUN_TRANSITION");
      }
      assertRunEventBinding(this.#db, runId, event, "running", 2);
      insertRunEvent(this.#db, event);
      return publicRun(this.#db.prepare(
        "SELECT * FROM task_execution_agent_run_poc WHERE run_id=?",
      ).get(runId));
    });
  }

  complete(runId, status, receipt, at, event) {
    return transaction(this.#db, () => {
      const update = this.#db.prepare(`
        UPDATE task_execution_agent_run_poc
        SET status=?, ended_at=?
        WHERE run_id=? AND status='running'
      `).run(status, status === "waiting" ? null : at, runId);
      if (Number(update.changes) !== 1) {
        throw new TaskExecutionStoreError("INVALID_RUN_TRANSITION");
      }
      assertRunEventBinding(this.#db, runId, event, status, 3);
      assertReceiptBinding(this.#db, runId, status, receipt);
      insertRunEvent(this.#db, event);
      this.#db.prepare(`
        INSERT INTO task_execution_receipt_poc(receipt_id, run_id, receipt_json, recorded_at)
        VALUES (?, ?, ?, ?)
      `).run(receipt.receipt_id, runId, JSON.stringify(receipt), at);
      return {
        run: publicRun(this.#db.prepare(
          "SELECT * FROM task_execution_agent_run_poc WHERE run_id=?",
        ).get(runId)),
        receipt: JSON.parse(this.#db.prepare(
          "SELECT receipt_json FROM task_execution_receipt_poc WHERE run_id=?",
        ).get(runId).receipt_json),
      };
    });
  }

  readTaskExecution(taskKey) {
    const row = this.#db.prepare(`
      SELECT * FROM task_execution_agent_run_poc
      WHERE task_key=? ORDER BY run_order DESC LIMIT 1
    `).get(taskKey);
    const eventRows = this.#db.prepare(`
      SELECT * FROM task_execution_event_poc
      WHERE task_key=? ORDER BY ingested_at, event_id
    `).all(taskKey);
    const runEventRows = this.#db.prepare(`
      SELECT * FROM task_execution_agent_run_event_poc
      WHERE run_id=? ORDER BY sequence, event_id
    `).all(row?.run_id ?? "");
    if (!row) {
      return {
        agent_run: null,
        execution_receipt: null,
        task_events: eventRows.map(publicEvent),
        agent_run_events: runEventRows.map(publicRunEvent),
      };
    }
    const receipt = this.#db.prepare(
      "SELECT receipt_json FROM task_execution_receipt_poc WHERE run_id=?",
    ).get(row.run_id);
    return {
      agent_run: publicRun(row),
      execution_receipt: receipt ? JSON.parse(receipt.receipt_json) : null,
      task_events: eventRows.map(publicEvent),
      agent_run_events: runEventRows.map(publicRunEvent),
    };
  }

  close() {
    this.#db.close();
  }
}
