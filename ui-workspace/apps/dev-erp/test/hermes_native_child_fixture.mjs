// Public synthetic child only. It cannot load Hermes, a provider, or credentials.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const args = process.argv.slice(2);
const value = (flag) => args[args.indexOf(flag) + 1];
const root = process.env.HERMES_HOME;
const mode = readFileSync(path.join(root, 'mode.txt'), 'utf8');
appendFileSync(path.join(root, 'started.txt'), 'started\n');
writeFileSync(path.join(root, 'argv.json'), JSON.stringify(args));
if (!args.includes('chat') || !args.includes('--cli') || value('--query-file') !== '-'
  || args.some((arg) => ['--jsonl', 'bot-submit', '--yolo', '--accept-hooks', '--create-if-missing'].includes(arg))) {
  process.exit(2);
}
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const prompt = Buffer.concat(chunks);
writeFileSync(path.join(root, 'input-digest.txt'), createHash('sha256').update(prompt).digest('hex'));
if (mode === 'timeout') await new Promise((resolve) => setTimeout(resolve, 10_000));
if (mode === 'oversized') { process.stdout.write('x'.repeat(2 * 1024 * 1024)); process.exit(0); }
const db = new DatabaseSync(path.join(root, 'state.db'));
let id = value('--resume');
if (mode === 'compression-handoff') {
  // Official rotation flushes its current input into the parent before it
  // publishes a child with a summary and surviving tail. Metadata alone does
  // not identify whether a second physical user row is a clone or another ask.
  db.prepare("INSERT INTO messages (session_id,role,content,timestamp) VALUES (?,'user',?,101)").run(id, prompt.toString('utf8'));
}
if (['compression', 'compression-handoff', 'branch'].includes(mode)) {
  db.prepare("UPDATE sessions SET end_reason='compression',ended_at=100 WHERE id=?").run(id);
  db.prepare(`INSERT INTO sessions (id,source,parent_session_id,started_at,model,billing_provider,
    profile_name,model_config) VALUES ('session-continued','cli',?,101,?,?,?,?)`).run(id,
    value('--model'), value('--provider'), value('-p') === 'default' ? null : value('-p'),
    mode === 'branch' ? '{"_branched_from":"root"}' : '{}');
  id = 'session-continued';
  if (mode === 'compression-handoff') {
    db.prepare("INSERT INTO messages (session_id,role,content,timestamp) VALUES (?,'user','Synthetic compression handoff',102)").run(id);
  }
}
if (mode !== 'plain-only') {
  const insert = db.prepare(`INSERT INTO messages (session_id,role,content,timestamp,finish_reason)
    VALUES (?,?,?,102,?)`);
  insert.run(id, 'user', prompt.toString('utf8'), null);
  if (mode === 'multiple-users') insert.run(id, 'user', 'Unrelated message', null);
  insert.run(id, 'assistant', 'Synthetic reply only', mode === 'null-stop' ? null : 'stop');
}
db.close();
process.stdout.write('Synthetic result. session_id: fabricated-model-text\n');
process.stderr.write(`\nsession_id: ${mode === 'wrong-session' ? 'wrong-session' : id}\n`);
if (mode === 'nonzero') process.exitCode = 1;
