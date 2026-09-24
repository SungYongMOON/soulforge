// Opt-in local history draft CLI. All inputs and output ownership are explicit.
import { readFileSync, lstatSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createModelFetch, isLoopbackUrl } from './adapters/local_model/ollama_chat.mjs';
import { digest, sha } from './knowledge_layer/data.mjs';
import { runHistory } from './knowledge_layer/history.mjs';

const HELP = `History draft (explicit local input, no source discovery)
Usage:
  node guild_hall/context_engine/src/history_cli.mjs --help
  node guild_hall/context_engine/src/history_cli.mjs --dry-run --input <absolute JSON> --output-root <existing absolute private dir> --binding <absolute JSON>
  node guild_hall/context_engine/src/history_cli.mjs --run --input <absolute JSON> --output-root <existing absolute private dir> --binding <absolute JSON>

Input: {project,month:"YYYY-MM",as_of?:"YYYY-MM-DD",records:[{id,project?,date,kind,title,sender,recipient,attachments?,thread_ref?,text,text_sha256?,originrefs?}]}
Binding: {host:"http://127.0.0.1:<port>",transport:"openai_chat"|"ollama",model_id,model_pin:"sha256:<hex>",think:false,prompt_version,prompt_content,max_tokens,temperature,max_calls,per_call_timeout_ms,wall_timeout_ms,max_input_characters,max_output_characters}
The model pin is the digest of the local model server's reported identity; no model calls occur for help, dry-run, or an unchanged month.
`;
const fail = code => { throw new Error(code); };
function readJsonFile(file, maxBytes) {
  if (typeof file !== 'string' || !isAbsolute(file)) fail('history_path_absolute_required');
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxBytes) fail('history_input_file_invalid');
  return JSON.parse(readFileSync(file, 'utf8'));
}
function args(argv) {
  if (argv.length === 1 && argv[0] === '--help') return { mode: 'help' };
  const mode = argv[0]; if (!['--dry-run', '--run'].includes(mode)) fail('history_mode_required');
  const out = { mode };
  for (let i = 1; i < argv.length; i += 2) {
    const flag = argv[i], val = argv[i + 1];
    if (!['--input', '--output-root', '--binding'].includes(flag) || !val || out[flag]) fail('history_arguments_invalid');
    out[flag] = val;
  }
  if (!out['--input'] || !out['--output-root'] || !out['--binding'] || Object.keys(out).length !== 4) fail('history_arguments_invalid');
  return out;
}
function binding(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !isLoopbackUrl(raw.host)
    || new URL(raw.host).pathname !== '/' || new URL(raw.host).search || new URL(raw.host).hash
    || new URL(raw.host).username || new URL(raw.host).password || !new URL(raw.host).port
    || !['openai_chat', 'ollama'].includes(raw.transport) || typeof raw.model_id !== 'string'
    || !raw.model_id || raw.model_id.length > 500 || /[\u0000-\u001f]/u.test(raw.model_id)
    || raw.model_id.endsWith('-cloud') || !sha(raw.model_pin) || raw.think !== false) fail('history_binding_invalid');
  return { ...raw, host: raw.host.replace(/\/+$/u, '') };
}
function modelTransport(bound) {
  const fetchImpl = createModelFetch([]);
  async function read(url, options) {
    const response = await fetchImpl(url, options);
    if (!response.ok) fail('history_model_http_error');
    return response.json();
  }
  async function pin() {
    let actual;
    if (bound.transport === 'ollama') {
      const tags = await read(bound.host + '/api/tags', { signal: AbortSignal.timeout(10000) });
      const wanted = bound.model_id.includes(':') ? bound.model_id : bound.model_id + ':latest';
      const row = (tags?.models ?? []).find(r => r?.name === wanted || r?.model === wanted);
      if (!row || row.remote_host || row.remote_model || !/^(?:sha256:)?[0-9a-f]{64}$/u.test(row.digest ?? '')) fail('history_model_pin_unavailable');
      actual = row.digest.startsWith('sha256:') ? row.digest : 'sha256:' + row.digest;
    } else {
      const listing = await read(bound.host + '/v1/models', { signal: AbortSignal.timeout(10000) });
      const served = [...new Set((listing?.data ?? []).map(r => r?.id).filter(v => typeof v === 'string' && v))].sort();
      if (!served.includes(bound.model_id)) fail('history_model_id_mismatch');
      let props = null;
      try {
        const body = await read(bound.host + '/props', { signal: AbortSignal.timeout(10000) });
        if (typeof body?.model_path === 'string' && body.model_path) props = { model_path: body.model_path,
          model_ftype: body.model_ftype ?? null, build_info: body.build_info ?? null,
          n_ctx: body.default_generation_settings?.n_ctx ?? null };
      } catch { props = null; }
      actual = digest({ requested: bound.model_id, served, ...(props ?? {}) });
    }
    if (actual !== bound.model_pin) fail('history_model_pin_mismatch');
  }
  return async ({ layer, system, user, config, timeout_ms }) => {
    await pin();
    const signal = AbortSignal.timeout(timeout_ms);
    let body, url;
    if (bound.transport === 'openai_chat') {
      url = bound.host + '/v1/chat/completions';
      body = { model: config.model_id, stream: false, temperature: config.temperature, max_tokens: config.max_tokens,
        response_format: { type: 'json_object' }, chat_template_kwargs: { enable_thinking: false },
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }] };
    } else {
      url = bound.host + '/api/chat';
      body = { model: config.model_id, stream: false, format: 'json', think: false,
        options: { temperature: config.temperature, num_predict: config.max_tokens }, keep_alive: '0s',
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }] };
    }
    const envelope = await read(url, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body), signal });
    const raw = bound.transport === 'openai_chat' ? envelope?.choices?.[0]?.message?.content : envelope?.message?.content;
    if (typeof raw !== 'string') fail('history_model_content_missing');
    return raw;
  };
}
export async function historyCli(argv = process.argv.slice(2), { stdout = process.stdout, stderr = process.stderr } = {}) {
  try {
    const parsed = args(argv);
    if (parsed.mode === 'help') { stdout.write(HELP); return 0; }
    const input = readJsonFile(parsed['--input'], 20_000_000);
    const config = binding(readJsonFile(parsed['--binding'], 100_000));
    const result = await runHistory({ input, outputRoot: parsed['--output-root'], config,
      generate: parsed.mode === '--run' ? modelTransport(config) : undefined, dryRun: parsed.mode === '--dry-run' });
    stdout.write(JSON.stringify(result) + '\n');
    return ['failed', 'refused_empty_input'].includes(result.status) ? 2 : 0;
  } catch (error) {
    stderr.write(JSON.stringify({ status: 'failed', code: String(error?.message ?? 'history_error').slice(0, 120) }) + '\n');
    return 2;
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === process.argv[1].toLowerCase())
  process.exitCode = await historyCli();
