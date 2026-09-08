// Installed production-candidate Node authorizer/dispatch + synthetic native
// Hermes only. No model, remote transport, credentials or live profiles.
import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stageFeedbackReadbox } from './feedback_readbox_stage.mjs';
import { createReadboxFixture } from './feedback_readbox_fixture.mjs';

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
const fixturePython = fileURLToPath(new URL('./feedback_readbox_native_fixture.py', import.meta.url));
const sha = value => createHash('sha256').update(value).digest('hex');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function setup(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'feedback-native-test-'));
  const payload = path.join(root, 'payload');
  await fs.mkdir(payload);
  const manifest = await stageFeedbackReadbox({ sourceRoot, targetRoot: payload });
  const fixture = await createReadboxFixture(root);
  const installed = await import(pathToFileURL(path.join(payload, 'guild_hall/dev_worker/feedback_dispatch.mjs')).href);
  const nodeSha = sha(await fs.readFile(process.execPath));
  const children = new Set();
  const dispatchers = new Set();
  let sequence = 0;
  t.after(async () => {
    for (const child of children) await child.stop();
    for (const dispatch of dispatchers) dispatch.close();
    await fixture.close();
    const resolved = await fs.realpath(root), parent = await fs.realpath(os.tmpdir());
    assert.equal(path.dirname(resolved), parent);
    assert.ok(path.basename(resolved).startsWith('feedback-native-test-'));
    await fs.rm(resolved, { recursive: true, force: true });
  });

  async function startNative({ mode = 'ack', delay = 0, responseTimeout = 5 } = {}) {
    const child = spawn(process.platform === 'win32' ? 'python' : 'python3', [fixturePython, '--synthetic-root', path.join(root, `synthetic-hermes-${++sequence}`),
      '--installed-root', payload], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let stderr = '';
    child.stderr.on('data', data => { stderr = (stderr + data.toString()).slice(-4000); });
    const stream = createInterface({ input: child.stdout });
    const lines = stream[Symbol.asyncIterator]();
    let finished = false;
    const exit = new Promise(resolve => {
      child.once('exit', (code, signal) => { finished = true; resolve({ code, signal }); });
      child.once('error', error => { finished = true; resolve({ error }); });
    });
    async function next() {
      let timer;
      try {
        const line = await Promise.race([lines.next(), new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`synthetic child response timeout: ${stderr}`)), 12000);
        })]);
        assert.equal(line.done, false, `synthetic child ended: ${stderr}`);
        return JSON.parse(line.value);
      } finally { clearTimeout(timer); }
    }
    const send = packet => child.stdin.write(`${JSON.stringify(packet)}\n`);
    const handle = {
      async status() { send({ command: 'status' }); return next(); },
      async stop() {
        if (!finished) {
          send({ command: 'stop' });
          const completed = await Promise.race([exit, pause(5000).then(() => null)]);
          if (!completed) { child.kill(); await exit; }
        }
        children.delete(handle);
        stream.close();
      },
    };
    children.add(handle);
    const reservation = await next();
    assert.equal(reservation.state, 'SYNTHETIC_PORT_RESERVED');
    fixture.config.delivery.native_origin = `http://127.0.0.1:${reservation.port}`;
    await fixture.resealConfig();
    const cli = path.join(payload, 'guild_hall/dev_worker/feedback_readbox_cli.mjs');
    const binding = {
      node_executable: process.execPath, node_executable_sha256: nodeSha,
      authorization_script: cli, authorization_script_sha256: sha(await fs.readFile(cli)),
      authorization_argv: ['authorize', '--config', fixture.configPath, '--config-sha256', fixture.configSha256],
      authorization_code_pins: manifest.files.map(file => [path.join(payload, file.path), file.sha256]),
      ledger_path: path.join(root, 'synthetic-native-attempts.sqlite'),
      profile_ref: fixture.policy.profile_ref, bot_ref: fixture.policy.sender_ref,
      loopback_port: reservation.port, authorization_timeout: 10, response_timeout: responseTimeout,
    };
    send({ binding, mode, delay });
    assert.equal((await next()).state, 'SYNTHETIC_CONNECTED');
    handle.origin = fixture.config.delivery.native_origin;
    return handle;
  }
  return { fixture, startNative, async open() {
    const dispatch = await installed.openFeedbackDispatch(fixture.options);
    const close = dispatch.close;
    dispatch.close = () => { if (dispatchers.delete(dispatch)) close(); };
    dispatchers.add(dispatch);
    return dispatch;
  }, payload };
}

test('staged real Node authorizer sends native ACK once and refuses revoked current authority', async t => {
  const h = await setup(t), native = await h.startNative(), dispatch = await h.open();
  const prepared = await dispatch.prepare(h.fixture.pins.report);
  assert.equal(prepared.state, 'PREPARED');
  const authorized = await dispatch.authorize(prepared.dispatch_ref, prepared.envelope_sha256);
  const sent = await dispatch.send(prepared.dispatch_ref);
  assert.equal(sent.state, 'ACKNOWLEDGED');
  assert.equal(sent.message_id, 'message.synthetic.ack');
  assert.equal(sent.human_acceptance, 'UNKNOWN');
  assert.equal(sent.official_done, false);
  assert.equal((await dispatch.send(prepared.dispatch_ref)).state, 'ACKNOWLEDGED');
  const status = await native.status();
  assert.equal(status.native_calls, 1);
  assert.deepEqual(status.text_sha256, [sha(Buffer.from(authorized.envelope.text, 'utf8'))]);
  assert.ok(!authorized.envelope.text.includes(h.fixture.rawSentinel));
  const view = await dispatch.snapshot({ limit: 10 }, h.fixture.access);
  assert.equal(view.items.find(item => item.ref === prepared.notice_ref).buzz_delivery, 'ACKNOWLEDGED');
  assert.ok(!JSON.stringify(view).includes(h.fixture.rawSentinel));

  const pending = await dispatch.prepare(h.fixture.pins.result);
  await h.fixture.writeCurrent({ dispatch_enabled: false });
  const response = await fetch(`${native.origin}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dispatch_ref: pending.dispatch_ref, envelope_sha256: pending.envelope_sha256 }) });
  assert.equal((await response.json()).status, 'DENIED');
  assert.equal((await native.status()).native_calls, 1);
  await assert.rejects(dispatch.send(pending.dispatch_ref));
});

test('real Node and native durable ledgers preserve unknown across both process restarts without resend', async t => {
  const h = await setup(t);
  let native = await h.startNative({ mode: 'unknown' });
  let dispatch = await h.open();
  const prepared = await dispatch.prepare(h.fixture.pins.notice);
  assert.equal((await dispatch.send(prepared.dispatch_ref)).state, 'DELIVERY_UNKNOWN');
  assert.equal((await native.status()).native_calls, 1);
  dispatch.close();
  await native.stop();
  native = await h.startNative();
  dispatch = await h.open();
  assert.equal((await dispatch.send(prepared.dispatch_ref)).state, 'DELIVERY_UNKNOWN');
  assert.equal((await dispatch.reconcile(prepared.dispatch_ref)).state, 'DELIVERY_UNKNOWN');
  const duplicate = await fetch(`${native.origin}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dispatch_ref: prepared.dispatch_ref, envelope_sha256: prepared.envelope_sha256 }) });
  assert.equal((await duplicate.json()).status, 'UNKNOWN');
  assert.equal((await native.status()).native_calls, 0);
});

test('native late ACK is reconciled through installed real Node receipt path without a second send', async t => {
  const h = await setup(t), native = await h.startNative({ delay: 0.3, responseTimeout: 0.03 });
  const dispatch = await h.open();
  const prepared = await dispatch.prepare(h.fixture.pins.notice);
  assert.equal((await dispatch.send(prepared.dispatch_ref)).state, 'DELIVERY_UNKNOWN');
  let result, deadline = Date.now() + 5000;
  do { await pause(100); result = await dispatch.reconcile(prepared.dispatch_ref); }
  while (result.state !== 'ACKNOWLEDGED' && Date.now() < deadline);
  assert.equal(result.state, 'ACKNOWLEDGED');
  assert.equal((await native.status()).native_calls, 1);
  assert.equal((await dispatch.send(prepared.dispatch_ref)).state, 'ACKNOWLEDGED');
  assert.equal((await native.status()).native_calls, 1);
});
