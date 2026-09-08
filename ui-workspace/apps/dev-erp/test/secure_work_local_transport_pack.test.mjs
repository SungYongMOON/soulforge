import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pythonBin } from '../../../../guild_hall/shared/python_bin.mjs';

// The same test resolves the checkout or installed payload containing itself.
// No installed settings, kit, credential, provider or real model is discovered.
const payloadRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const packageRoot = path.join(payloadRoot, 'guild_hall/secure_work/src');
const python = process.env.SOULFORGE_SECURE_WORK_TEST_PYTHON || pythonBin();
const baseEnv = Object.fromEntries(['SystemRoot', 'WINDIR', 'PATH', 'PATHEXT']
  .filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
const flags = ['-I', '-S', '-B'];
const probe = spawnSync(python, [...flags, '-c', 'import sys; assert sys.version_info >= (3, 10); print("ready")'],
  { encoding: 'utf8', env: baseEnv, windowsHide: true, timeout: 5000, maxBuffer: 4096 });
const availablePython = probe.status === 0 && probe.stdout.trim() === 'ready';
const options = { skip: availablePython ? false : 'Python 3.10+ unavailable; configure SOULFORGE_SECURE_WORK_TEST_PYTHON', timeout: 20000 };
const bootstrap = String.raw`
import json, pathlib, sys
assert sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode
package_root = pathlib.Path(sys.argv[1]).resolve()
sys.path.insert(0, str(package_root))
import soulforge_secure_work.adapters as adapters
assert pathlib.Path(adapters.__file__).resolve() == package_root / 'soulforge_secure_work' / 'adapters.py'
assert pathlib.Path(adapters.winsec.__file__).resolve() == package_root / 'soulforge_secure_work' / 'winsec.py'
assert 'cryptography' not in sys.modules and 'sf_sewe' not in sys.modules
`;

async function isolated(t, code, args = [], extraEnv = {}) {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'sf-secure-pack-'));
  t.after(async () => {
    assert.equal(path.dirname(await fs.realpath(root)), await fs.realpath(tmpdir()));
    assert.ok(path.basename(root).startsWith('sf-secure-pack-'));
    await fs.rm(root, { recursive: true, force: true });
  });
  const child = spawn(python, [...flags, '-c', bootstrap + '\n' + code, packageRoot, ...args], {
    cwd: root, env: { ...baseEnv, HOME: root, USERPROFILE: root, TMP: root, TEMP: root, ...extraEnv },
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '', stderr = '', expired = false, overflow = false;
  const stop = () => child.kill('SIGKILL');
  const timer = setTimeout(() => { expired = true; stop(); }, 8000);
  t.after(() => { clearTimeout(timer); if (child.exitCode === null && child.signalCode === null) stop(); });
  for (const [stream, append] of [[child.stdout, value => { stdout += value; }], [child.stderr, value => { stderr += value; }]])
    stream.on('data', bytes => { append(bytes.toString('utf8')); if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > 8192) { overflow = true; stop(); } });
  let result;
  try { result = await once(child, 'close'); } finally { clearTimeout(timer); }
  assert.equal(expired, false, 'owned Python child exceeded its time bound');
  assert.equal(overflow, false, 'owned Python child exceeded its output bound');
  assert.equal(result[0], 0, stderr); assert.equal(stderr, '');
  assert.deepEqual(await fs.readdir(root), [], 'isolated import must not write bytecode or user files');
  return JSON.parse(stdout);
}
async function server(t, handler) {
  const service = createServer(handler);
  service.listen(0, '127.0.0.1'); await once(service, 'listening');
  t.after(async () => { service.closeAllConnections(); await new Promise(resolve => service.close(resolve)); });
  return `http://127.0.0.1:${service.address().port}`;
}

test('installed package import resolves adapters and its winsec closure from this payload only', options, async t => {
  assert.deepEqual(await isolated(t, `print(json.dumps({'imported': True, 'optional_dependencies_loaded': False}))`),
    { imported: true, optional_dependencies_loaded: false });
});

test('installed local adapter refuses disabled and non-loopback inputs before any socket attempt', options, async t => {
  const result = await isolated(t, String.raw`
attempts = []
def audit(event, args):
    if event in ('socket.connect', 'socket.getaddrinfo', 'socket.sendto'):
        attempts.append(event)
        raise AssertionError('unexpected synthetic socket attempt')
sys.addaudithook(audit)
for enabled, url, expected in [(False, 'http://127.0.0.1:1/v1', 'disabled'),
                               (True, 'https://192.0.2.1/v1', 'invalid_local_endpoint')]:
    adapter = adapters.LocalManagerAdapter(url, 'synthetic.model', 1, enabled)
    assert adapter.probe().state == ('UNAVAILABLE' if enabled else 'DISABLED')
    try:
        adapter.propose('SYNTHETIC_PACK_INPUT')
    except adapters.AdapterUnavailable as error:
        assert error.reason == expected
    else:
        raise AssertionError('adapter accepted denied endpoint')
assert attempts == []
print(json.dumps({'denied_cases': 2, 'socket_attempts': len(attempts)}))
`);
  assert.deepEqual(result, { denied_cases: 2, socket_attempts: 0 });
});

test('installed local adapter reaches only the owned synthetic endpoint and refuses redirects/proxies', options, async t => {
  let diverted = 0, models = 0, completions = 0;
  const trap = await server(t, (_req, res) => { diverted++; res.writeHead(500).end(); });
  const origin = await server(t, async (req, res) => {
    assert.equal(req.headers.authorization, undefined);
    if (req.method === 'GET' && req.url === '/v1/models') {
      models++;
      if (models > 1) { res.writeHead(302, { Location: `${trap}/redirect-target` }).end(); return; }
      res.end(JSON.stringify({ data: [{ id: 'synthetic.model' }] })); return;
    }
    assert.equal(req.method, 'POST'); assert.equal(req.url, '/v1/chat/completions');
    let text = ''; for await (const chunk of req) { text += chunk; assert.ok(text.length < 4096); }
    const body = JSON.parse(text); assert.equal(body.model, 'synthetic.model');
    assert.equal(body.messages[1].content, 'SYNTHETIC_PACK_INPUT'); assert.equal(body.stream, false);
    completions++;
    res.end(JSON.stringify({ choices: [{ message: { content: 'SYNTHETIC_PACK_ANSWER' }, finish_reason: 'stop' }] }));
  });
  const result = await isolated(t, String.raw`
origin = sys.argv[2]
from urllib.parse import urlsplit
allowed_port = urlsplit(origin).port
connects = []
def audit(event, args):
    if event == 'socket.connect':
        address = args[1]
        assert address[0] == '127.0.0.1' and address[1] == allowed_port
        connects.append(address)
    elif event == 'socket.getaddrinfo':
        assert args[0] == '127.0.0.1' and args[1] == allowed_port
    elif event in ('socket.sendto', 'subprocess.Popen'):
        raise AssertionError('unbound synthetic effect')
sys.addaudithook(audit)
adapter = adapters.LocalManagerAdapter(origin + '/v1', 'synthetic.model', 2, True)
assert adapter.probe().state == 'AVAILABLE'
assert adapter.propose('SYNTHETIC_PACK_INPUT') == ('synthetic.model', 'SYNTHETIC_PACK_ANSWER', 'stop')
assert adapter.probe().state == 'UNAVAILABLE'
assert len(connects) == 3
print(json.dumps({'probe': 'AVAILABLE', 'completion': 'synthetic', 'redirect': 'UNAVAILABLE', 'owned_connections': len(connects)}))
`, [origin], { HTTP_PROXY: trap, HTTPS_PROXY: trap, ALL_PROXY: trap, http_proxy: trap, https_proxy: trap, all_proxy: trap, NO_PROXY: '', no_proxy: '' });
  assert.deepEqual(result, { probe: 'AVAILABLE', completion: 'synthetic', redirect: 'UNAVAILABLE', owned_connections: 3 });
  assert.equal(models, 2); assert.equal(completions, 1); assert.equal(diverted, 0);
});
