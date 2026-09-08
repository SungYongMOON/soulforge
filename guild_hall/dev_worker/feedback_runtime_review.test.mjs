import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createFeedbackCycle } from './feedback_cycle.mjs';
import { runFeedbackRuntimeReview } from './feedback_runtime.mjs';
import { runtimeHash as hash } from './feedback_runtime_io.mjs';

test('final-review ACP closure unknown survives real SQLite reopen and prevents next-revision dispatch', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'feedback-review-'));
  t.after(async () => { assert.equal(path.dirname(root), path.resolve(os.tmpdir())); await fs.rm(root, { recursive: true, force: true }); });
  for (const failEvidence of [false, true]) {
    const dbFile = path.join(root, `control-${failEvidence}.sqlite`); let db = new DatabaseSync(dbFile);
    let semantic = 'a'.repeat(64), executions = 0, modelCalls = 0;
    const packet = { schema_version: 'soulforge.dev_worker_request.v0', task_id: 'synthetic', status: 'ready', summary: 'Synthetic bounded task',
      allowed_write_paths: ['src/value.mjs'], acceptance_checks: ['check.synthetic'], draft_branch_allowed: true,
      origin: { kind: 'agent_generated' }, owner_approval: { required: true, approved: true, approved_by: 'fixture' } };
    const ports = () => ({ db, source: { snapshot: async () => ({ status: 'CURRENT', snapshot_ref: 'snapshot.synthetic', items: [{ source_ref: 'source.synthetic',
      semantic_sha256: semantic, source_revision: 'revision.synthetic', scope_ref: 'project:SYN', kind: 'bug' }] }), current: async () => true },
      authorize: async () => true, prepare: async () => ({ status: 'READY', packet, packet_sha256: hash(packet) }),
      execute: async () => { executions++; return { candidate_ref: 'candidate.synthetic' }; },
      validate: async () => ({ status: 'PASS', validation_ref: 'validation.synthetic' }),
      review: (candidate, validation, supplied, context) => runFeedbackRuntimeReview({ candidate, validation, packet: supplied, context,
        evidenceRoot: failEvidence ? path.join(root, 'missing-evidence') : root,
        model: { review: async () => { modelCalls++; throw Object.assign(new Error('unclosed'), { feedbackCode: 'FEEDBACK_ACP_CLOSURE_UNKNOWN' }); } } }),
      report: async () => ({ report_ref: 'report.synthetic' }) });
    const first = await createFeedbackCycle(ports()).runOnce();
    assert.equal(first.status, 'EXECUTION_UNKNOWN'); assert.equal(first.reason, 'FEEDBACK_INTERRUPTED');
    db.close(); db = new DatabaseSync(dbFile); semantic = 'b'.repeat(64);
    const restarted = await createFeedbackCycle(ports()).runOnce();
    assert.equal(restarted.status, 'RECOVERY_REQUIRED'); assert.equal(executions, 1); assert.equal(modelCalls, 1);
    assert.equal(db.prepare("SELECT count(*) n FROM dev_feedback_run WHERE state='execution_unknown'").get().n, 1); db.close();
  }
});

test('confirmed ordinary review refusal is not relabelled as unclosed execution', async () => {
  const error = Object.assign(new Error('known refusal'), { feedbackCode: 'FEEDBACK_REVIEW_REQUIRED' });
  await assert.rejects(runFeedbackRuntimeReview({ model: { review: async () => { throw error; } } }), error);
});
