import { DatabaseSync } from 'node:sqlite';
import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { digestOf } from '../../../../guild_hall/agent_observation/guard_primitives.mjs';

const samePath = (a, b) => process.platform === 'win32'
  ? path.normalize(a).toLowerCase() === path.normalize(b).toLowerCase() : a === b;

// This reader never selects message content, system prompts, descriptions,
// origins, reasoning, API content, or display metadata. In particular it does
// not use Hermes get_session(), which joins the system prompt body.
export async function readHermesNativeSessionMetadata({ database_path, session_id, since_id = 0 }) {
  if (!path.isAbsolute(database_path) || typeof session_id !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/u.test(session_id)
    || (since_id !== null && (!Number.isSafeInteger(since_id) || since_id < 0))) throw new Error('invalid metadata request');
  const stat = await lstat(database_path);
  if (!stat.isFile() || stat.isSymbolicLink()
    || !samePath(await realpath(database_path), database_path)) throw new Error('unsafe database');
  const db = new DatabaseSync(database_path, { readOnly: true, timeout: 1000 });
  try {
    db.exec('PRAGMA query_only=ON; BEGIN');
    const sessionQuery = db.prepare(`SELECT id, source, parent_session_id, started_at,
      ended_at, end_reason, model, billing_provider, profile_name, rewind_count,
      archived, hidden,
      CASE WHEN json_type(COALESCE(model_config, '{}'), '$.yolo_mode') IS NULL
        OR json_type(COALESCE(model_config, '{}'), '$.yolo_mode') = 'false'
        OR (json_type(COALESCE(model_config, '{}'), '$.yolo_mode') IN ('integer', 'real')
          AND json_extract(COALESCE(model_config, '{}'), '$.yolo_mode') = 0)
        THEN 0 ELSE 1 END AS yolo_enabled
      FROM sessions WHERE id = ?`);
    // Match the official compression relation, but HOLD on competing eligible
    // children instead of guessing one from timestamps. Only these two branch
    // booleans are evaluated inside SQLite; model_config is never returned.
    const children = db.prepare(`SELECT id FROM sessions WHERE parent_session_id = ?
      AND json_extract(COALESCE(model_config, '{}'), '$._branched_from') IS NULL
      AND json_extract(COALESCE(model_config, '{}'), '$._delegate_from') IS NULL
      AND COALESCE(source, '') != 'tool' LIMIT 2`);
    const messages = db.prepare(`SELECT id, role, active, compacted, finish_reason,
      effect_disposition, (tool_calls IS NOT NULL) AS has_tool_calls FROM messages WHERE session_id = ? AND id > ?
      ORDER BY id LIMIT 4097`);
    const watermark = db.prepare('SELECT COALESCE(MAX(id), 0) AS id FROM messages WHERE session_id = ?');
    const lineage = [];
    const delta = [];
    const seen = new Set();
    let current = session_id;
    let highWater = 0;
    for (let index = 0; index < 100; index += 1) {
      if (seen.has(current)) throw new Error('cycle');
      seen.add(current);
      const row = sessionQuery.get(current);
      if (!row) throw new Error('missing session');
      lineage.push({ ...row });
      highWater = Math.max(highWater, watermark.get(current).id);
      const rows = since_id === null ? [] : messages.all(current, since_id);
      if (rows.length > 4096 || delta.length + rows.length > 4096) throw new Error('metadata oversized');
      delta.push(...rows.map((entry) => ({ ...entry, session_id: current })));
      if (row.end_reason !== 'compression') break;
      const next = children.all(current);
      if (next.length !== 1 || index === 99) throw new Error('ambiguous compression');
      current = next[0].id;
    }
    delta.sort((a, b) => a.id - b.id);
    const body = { requested_session_id: session_id, actual_session_id: current,
      database_identity: `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`,
      lineage, watermark: highWater, delta };
    return Object.freeze({ ...body, metadata_digest: digestOf(body) });
  } finally { db.close(); }
}
