import { DatabaseSync } from 'node:sqlite';
import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { digestOf, isSafeRef } from '../../../../guild_hall/agent_observation/guard_primitives.mjs';

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
    // Project only official tool IDs/names and result-row presence. Neither
    // arguments nor tool result content is selected or copied into this record.
    const requests = db.prepare(`SELECT m.id, m.timestamp,
      json_extract(call.value, '$.id') AS call_id,
      json_extract(call.value, '$.function.name') AS tool_name
      FROM messages m, json_each(m.tool_calls) call
      WHERE m.session_id = ? AND m.id > ? AND m.role = 'assistant'
      AND m.active = 1 AND m.compacted = 0 AND m.tool_calls IS NOT NULL LIMIT 129`);
    const results = db.prepare(`SELECT id, timestamp, tool_call_id AS call_id, tool_name, effect_disposition
      FROM messages WHERE session_id = ? AND id > ? AND role = 'tool' AND active = 1 AND compacted = 0 LIMIT 129`);
    const oversizedTools = db.prepare(`SELECT 1 FROM messages WHERE session_id = ? AND id > ?
      AND active = 1 AND (length(tool_calls) > 65536 OR length(tool_call_id) > 512 OR length(tool_name) > 200) LIMIT 1`);
    const lineage = [];
    const delta = [];
    const toolRecords = [];
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
      if (since_id !== null) {
        if (oversizedTools.get(current, since_id)) throw new Error('tool metadata oversized');
        for (const [phase, records] of [['request_observed', requests.all(current, since_id)],
          ['result_row_observed', results.all(current, since_id)]]) {
          if (records.length > 128 || toolRecords.length + records.length > 256) throw new Error('tool metadata oversized');
          for (const record of records) {
            if ((record.tool_name !== null && !isSafeRef(record.tool_name))
              || ![null, undefined, 'none', 'unknown'].includes(record.effect_disposition)) throw new Error('tool metadata invalid');
            toolRecords.push({ source_ref: `hermes-tool-row.${digestOf([current, record.id, phase, record.call_id]).slice(7)}`,
              session_ref: `hermes-session.${digestOf(current).slice(7)}`, message_row_id: record.id,
              tool_call_ref: typeof record.call_id === 'string' ? `hermes-call.${digestOf(record.call_id).slice(7)}` : null,
              tool_name: record.tool_name, phase,
              occurred_at: Number.isFinite(record.timestamp) ? new Date(record.timestamp * 1000).toISOString() : null,
              recorded_effect_disposition: record.effect_disposition ?? null,
              input_payload_digest: null, output_payload_digest: null, actual_effect: 'UNKNOWN', actual_success: 'UNKNOWN' });
          }
        }
      }
      if (row.end_reason !== 'compression') break;
      const next = children.all(current);
      if (next.length !== 1 || index === 99) throw new Error('ambiguous compression');
      current = next[0].id;
    }
    delta.sort((a, b) => a.id - b.id);
    const body = { requested_session_id: session_id, actual_session_id: current,
      database_identity: `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`,
      lineage, watermark: highWater, delta, tool_records: toolRecords };
    return Object.freeze({ ...body, metadata_digest: digestOf(body) });
  } finally { db.close(); }
}
