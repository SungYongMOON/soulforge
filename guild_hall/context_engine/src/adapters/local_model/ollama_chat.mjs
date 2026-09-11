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
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const sha = text => `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;

export class LocalModelError extends Error {
  constructor(code) { super(code); this.name = 'LocalModelError'; this.code = code; }
}
const fail = code => { throw new LocalModelError(code); };

export function isLoopbackUrl(value) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && LOCAL_HOSTS.has(url.hostname); }
  catch { return false; }
}

// A fetch-shaped call for loopback endpoints only: no agent-level proxy, a 3xx
// is an error (a redirect would re-send the prompt elsewhere), and the body is capped.
export function loopbackFetch(url, { method = 'GET', headers = {}, body, signal } = {}) {
  if (!isLoopbackUrl(url)) return Promise.reject(new LocalModelError('chat_endpoint_not_loopback'));
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

// binding: { host, model, think?, options?, keep_alive?, timeout_ms? } from trusted configuration.
export function validateChatBinding(binding) {
  if (!binding || !isLoopbackUrl(binding.host) || !TOKEN.test(binding.model ?? '')) fail('chat_binding_invalid');
  if (binding.model.endsWith('-cloud')) fail('chat_model_not_local');
  const think = binding.think === undefined ? false : binding.think;
  const options = binding.options === undefined ? { temperature: 0, seed: 7, num_predict: 4096 } : binding.options;
  const timeoutMs = binding.timeout_ms ?? 600000;
  if (!THINK_VALUES.has(think) || typeof options !== 'object' || options === null || Array.isArray(options)
    || !Object.values(options).every(value => ['string', 'boolean'].includes(typeof value) || Number.isFinite(value))
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 3600000) fail('chat_binding_invalid');
  return Object.freeze({ host: binding.host.replace(/\/+$/u, ''), model: binding.model, think, options,
    keep_alive: binding.keep_alive ?? '0s', timeout_ms: timeoutMs });
}

// The installed model's manifest digest is its revision; a tag alone is not.
export async function installedModelDigest(binding, { fetchImpl = loopbackFetch } = {}) {
  const bound = validateChatBinding(binding);
  let rows;
  try {
    const response = await fetchImpl(`${bound.host}/api/tags`, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) fail('chat_endpoint_unavailable');
    rows = (await response.json()).models ?? [];
  } catch (error) { if (error instanceof LocalModelError) throw error; fail('chat_endpoint_unavailable'); }
  const wanted = bound.model.includes(':') ? bound.model : `${bound.model}:latest`;
  const row = rows.find(item => item?.name === wanted || item?.model === wanted);
  if (row?.remote_host || row?.remote_model) fail('chat_model_not_local');
  const match = /^(?:sha256:)?([0-9a-f]{64})$/u.exec(String(row?.digest ?? ''));
  if (!match) fail('chat_model_not_installed');
  return `sha256:${match[1]}`;
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
      const body = { model: bound.model, stream: false, format: schema, options: bound.options, keep_alive: bound.keep_alive,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }] };
      if (bound.think !== null) body.think = bound.think;
      const response = await fetchImpl(`${bound.host}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(bound.timeout_ms) });
      row.http_status = response.status;
      if (!response.ok) fail('chat_http_error');
      const data = await response.json();
      const content = typeof data?.message?.content === 'string' ? data.message.content : '';
      Object.assign(row, { output_sha256: sha(content), output_characters: content.length,
        thinking_characters: typeof data?.message?.thinking === 'string' ? data.message.thinking.length : 0,
        done_reason: typeof data?.done_reason === 'string' ? data.done_reason : null,
        prompt_tokens: Number.isSafeInteger(data?.prompt_eval_count) ? data.prompt_eval_count : null,
        output_tokens: Number.isSafeInteger(data?.eval_count) ? data.eval_count : null });
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
