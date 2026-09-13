// Local model chat for APP-side roles (맥락이). The endpoint comes from a
// trusted binding and must be loopback; requests use a plain node:http client
// (no proxy variables, no redirects, bounded response) rather than fetch, output
// is constrained by a JSON schema (the local server's structured output),
// thinking is switched explicitly (a thinking model otherwise spends its turn
// and returns no JSON), calls are budgeted, and each call leaves one trace row
// with hashes, sizes, stop reason, time and tokens — never the prompt or the
// answer text. A `-cloud` model runs on the vendor service behind the local
// server, so it is refused even at a loopback address.
import { createHash } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@+_-]{0,199}$/u;
const THINK_VALUES = new Set([false, true, 'low', 'medium', 'high', null]);
// How this APP speaks to the local model server, with the same rule the worker's
// `openai_model_pin`/`make_llm` follow: `ollama` reports an installed weight digest,
// while `openai_chat` (llama.cpp, vLLM and friends) has none to give and is pinned by
// what the server says about itself instead — weaker, and labelled as such.
const TRANSPORTS = new Set(['ollama', 'openai_chat']);
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const MAX_ALLOWED_CHAT_HOSTS = 8;
const sha = text => `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;

export class LocalModelError extends Error {
  constructor(code) { super(code); this.name = 'LocalModelError'; this.code = code; }
}
const fail = code => { throw new LocalModelError(code); };

export function isLoopbackUrl(value) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && LOCAL_HOSTS.has(url.hostname); }
  catch { return false; }
}

// Origins outside this host that the trusted configuration names for the model.
// An origin, never a range, so the address the request text went to is answerable
// from the binding alone; plaintext is refused off-host, where http would put the
// request on the wire in clear.
export function validateAllowedChatHosts(hosts) {
  if (hosts === undefined || hosts === null) return Object.freeze([]);
  if (!Array.isArray(hosts) || hosts.length > MAX_ALLOWED_CHAT_HOSTS) fail('chat_hosts_invalid');
  const origins = hosts.map(value => {
    let url;
    try { url = new URL(value); } catch { return fail('chat_hosts_invalid'); }
    if (url.protocol !== 'https:') fail('chat_host_not_https');
    if (LOCAL_HOSTS.has(url.hostname)) fail('chat_host_redundant');
    if (url.pathname !== '/' || url.search || url.username || url.password) fail('chat_hosts_invalid');
    return url.origin;
  });
  if (new Set(origins).size !== origins.length) fail('chat_hosts_invalid');
  return Object.freeze(origins);
}

function chatHostAdmitted(value, allowedOrigins) {
  if (isLoopbackUrl(value)) return true;
  try { return allowedOrigins.includes(new URL(value).origin); } catch { return false; }
}

// A fetch-shaped call for this host, plus exactly the origins the binding named:
// no agent-level proxy, a 3xx is an error (a redirect would re-send the prompt
// elsewhere), and the body is capped.
export function createModelFetch(allowedOrigins = []) {
  return function modelFetch(url, { method = 'GET', headers = {}, body, signal } = {}) {
    if (!chatHostAdmitted(url, allowedOrigins)) return Promise.reject(new LocalModelError('chat_endpoint_not_admitted'));
    return sendRequest(url, { method, headers, body, signal });
  };
}

// Every model call this APP makes on this path goes through here, so the guard
// above cannot be skipped by reaching for the transport directly.
export const loopbackFetch = createModelFetch([]);

function sendRequest(url, { method = 'GET', headers = {}, body, signal } = {}) {
  const target = new URL(url), client = target.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const request = client.request(target, { method, headers, signal, agent: false }, response => {
      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > MAX_RESPONSE_BYTES) { request.destroy(new LocalModelError('chat_response_too_large')); return; }
        chunks.push(chunk);
      });
      response.on('end', () => {
        const status = response.statusCode ?? 0, text = Buffer.concat(chunks).toString('utf8');
        if (status >= 300 && status < 400) { reject(new LocalModelError('chat_redirect_refused')); return; }
        resolve({ ok: status >= 200 && status < 300, status, json: async () => JSON.parse(text) });
      });
      response.on('error', reject);
    });
    request.on('error', reject);
    request.end(body);
  });
}

// binding: { host, model, transport?, think?, options?, keep_alive?, timeout_ms?, allowed_hosts? }
// from trusted configuration. `allowed_hosts` is empty by default, which means the
// model may only be called on this host.
export function validateChatBinding(binding) {
  const allowedHosts = validateAllowedChatHosts(binding?.allowed_hosts);
  if (!binding || !chatHostAdmitted(binding.host, allowedHosts) || !TOKEN.test(binding.model ?? '')) fail('chat_binding_invalid');
  if (binding.model.endsWith('-cloud')) fail('chat_model_not_local');
  const transport = binding.transport === undefined ? 'ollama' : binding.transport;
  const think = binding.think === undefined ? false : binding.think;
  const options = binding.options === undefined ? { temperature: 0, seed: 7, num_predict: 4096 } : binding.options;
  const timeoutMs = binding.timeout_ms ?? 600000;
  if (!TRANSPORTS.has(transport) || !THINK_VALUES.has(think) || typeof options !== 'object' || options === null || Array.isArray(options)
    || !Object.values(options).every(value => ['string', 'boolean'].includes(typeof value) || Number.isFinite(value))
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 3600000) fail('chat_binding_invalid');
  return Object.freeze({ host: binding.host.replace(/\/+$/u, ''), model: binding.model, transport, think, options,
    keep_alive: binding.keep_alive ?? '0s', timeout_ms: timeoutMs, allowed_hosts: allowedHosts });
}

async function readJson(fetchImpl, url) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) fail('chat_endpoint_unavailable');
  return response.json();
}

// What an OpenAI-compatible server can honestly say about what it is serving.
// There is no weight digest on this path. llama.cpp's /props does report the file it
// loaded, its quantisation, its build and its context size, so those are hashed with
// the served ids under `pin_kind: server_props`; a server without /props leaves only
// the ids it answers under, which catches a swapped model — the usual way an index and
// its model come apart — but not new weights at the same name, so it is labelled
// `served_id` and never read as a weight digest. The reported path is a host-local
// absolute path: it goes into the hash and never into a result. The facts are the
// worker's `openai_model_pin` facts; the two hashes have different canonical forms and
// are never compared with each other.
async function openAiModelPin(bound, fetchImpl) {
  let served;
  try {
    const listing = await readJson(fetchImpl, `${bound.host}/v1/models`);
    served = [...new Set((listing?.data ?? []).map(row => row?.id).filter(id => typeof id === 'string' && id))].sort();
  } catch (error) { if (error instanceof LocalModelError) throw error; fail('chat_endpoint_unavailable'); }
  if (served.length === 0) fail('chat_model_not_installed');
  let props = null;
  try {
    const body = await readJson(fetchImpl, `${bound.host}/props`);
    if (typeof body?.model_path === 'string' && body.model_path) {
      props = { model_path: body.model_path, model_ftype: body.model_ftype ?? null, build_info: body.build_info ?? null,
        n_ctx: body.default_generation_settings?.n_ctx ?? null };
    }
  } catch { props = null; }
  const pinned = { requested: bound.model, served, ...(props ?? {}) };
  const blob = JSON.stringify(Object.fromEntries(Object.keys(pinned).sort().map(key => [key, pinned[key]])));
  return { digest: sha(blob), pin_kind: props ? 'server_props' : 'served_id' };
}

// The revision behind an answer, as { digest, pin_kind }. On Ollama the installed
// model's manifest digest is that revision and a tag alone is not; an
// OpenAI-compatible server is pinned by what it reports about itself instead.
export async function installedModelDigest(binding, { fetchImpl = loopbackFetch } = {}) {
  const bound = validateChatBinding(binding);
  if (bound.transport === 'openai_chat') return openAiModelPin(bound, fetchImpl);
  let rows;
  try {
    rows = (await readJson(fetchImpl, `${bound.host}/api/tags`)).models ?? [];
  } catch (error) { if (error instanceof LocalModelError) throw error; fail('chat_endpoint_unavailable'); }
  const wanted = bound.model.includes(':') ? bound.model : `${bound.model}:latest`;
  const row = rows.find(item => item?.name === wanted || item?.model === wanted);
  if (row?.remote_host || row?.remote_model) fail('chat_model_not_local');
  const match = /^(?:sha256:)?([0-9a-f]{64})$/u.exec(String(row?.digest ?? ''));
  if (!match) fail('chat_model_not_installed');
  return { digest: `sha256:${match[1]}`, pin_kind: 'model_digest' };
}

const integer = value => (Number.isSafeInteger(value) ? value : null);

function ollamaRequest(bound, messages, schema) {
  const body = { model: bound.model, stream: false, format: schema, options: bound.options, keep_alive: bound.keep_alive, messages };
  if (bound.think !== null) body.think = bound.think;
  return { path: '/api/chat', body };
}

function readOllamaAnswer(data) {
  return { content: typeof data?.message?.content === 'string' ? data.message.content : '',
    thinking_characters: typeof data?.message?.thinking === 'string' ? data.message.thinking.length : 0,
    done_reason: typeof data?.done_reason === 'string' ? data.done_reason : null,
    prompt_tokens: integer(data?.prompt_eval_count), output_tokens: integer(data?.eval_count) };
}

// OpenAI-compatible: the schema is a response_format, the sampler lives at the top
// level, thinking is a chat-template argument rather than a field, and there is no
// keep_alive. Only the sampler keys that have a place there are sent; the others stay
// out of the request rather than being renamed into something the server would read
// differently. llama.cpp returns its reasoning separately, so `content` stays pure JSON.
function openAiRequest(bound, messages, schema) {
  const body = { model: bound.model, stream: false,
    response_format: { type: 'json_schema', json_schema: { name: 'answer', schema } }, messages };
  if ('temperature' in bound.options) body.temperature = bound.options.temperature;
  if ('seed' in bound.options) body.seed = bound.options.seed;
  if ('num_predict' in bound.options) body.max_tokens = bound.options.num_predict;
  if (bound.think !== null) body.chat_template_kwargs = { enable_thinking: Boolean(bound.think) };
  return { path: '/v1/chat/completions', body };
}

function readOpenAiAnswer(data) {
  const choice = (data?.choices ?? [])[0] ?? {}, message = choice.message ?? {};
  return { content: typeof message.content === 'string' ? message.content : '',
    thinking_characters: typeof message.reasoning_content === 'string' ? message.reasoning_content.length : 0,
    // finish_reason uses the same word for a cut-off answer as the Ollama path.
    done_reason: typeof choice.finish_reason === 'string' ? choice.finish_reason : null,
    prompt_tokens: integer(data?.usage?.prompt_tokens), output_tokens: integer(data?.usage?.completion_tokens) };
}

// Returns { chat, trace, model }. chat({ step, system, user, schema }) resolves to
// { status: 'ok', value } | { status: 'budget_exhausted' | 'invalid_json' | 'error', code? }.
export function createLocalChat({ binding, maxCalls, fetchImpl = loopbackFetch }) {
  const bound = validateChatBinding(binding);
  if (!Number.isSafeInteger(maxCalls) || maxCalls < 0 || maxCalls > 100) fail('chat_budget_invalid');
  const rows = [];
  async function chat({ step, system, user, schema }) {
    const input = JSON.stringify({ model: bound.model, system, user, schema });
    const row = { call: rows.length + 1, step, input_sha256: sha(input) };
    if (rows.filter(item => item.status !== 'budget_exhausted').length >= maxCalls) {
      rows.push({ ...row, status: 'budget_exhausted' });
      return { status: 'budget_exhausted' };
    }
    const started = Date.now();
    try {
      const messages = [{ role: 'system', content: system }, { role: 'user', content: user }];
      const openai = bound.transport === 'openai_chat';
      const { path, body } = openai ? openAiRequest(bound, messages, schema) : ollamaRequest(bound, messages, schema);
      const response = await fetchImpl(`${bound.host}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(bound.timeout_ms) });
      row.http_status = response.status;
      if (!response.ok) fail('chat_http_error');
      const data = await response.json();
      const answer = openai ? readOpenAiAnswer(data) : readOllamaAnswer(data);
      const { content } = answer;
      Object.assign(row, { output_sha256: sha(content), output_characters: content.length,
        thinking_characters: answer.thinking_characters, done_reason: answer.done_reason,
        prompt_tokens: answer.prompt_tokens, output_tokens: answer.output_tokens });
      let value;
      try { value = JSON.parse(content); } catch { row.status = 'invalid_json'; return { status: 'invalid_json' }; }
      row.status = 'ok';
      return { status: 'ok', value };
    } catch (error) {
      row.status = 'error';
      row.error_type = String(error?.code ?? error?.name ?? 'Error').slice(0, 64);
      return { status: 'error', code: error instanceof LocalModelError ? error.code : 'chat_failed' };
    } finally {
      row.elapsed_ms = Date.now() - started;
      rows.push(row);
    }
  }
  return Object.freeze({ chat, trace: () => rows.map(row => ({ ...row })), model: bound });
}
