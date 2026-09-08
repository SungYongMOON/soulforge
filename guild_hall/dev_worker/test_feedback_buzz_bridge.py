"""Synthetic installed-copy tests; never imports a real Hermes installation."""
import asyncio
from dataclasses import asdict, replace
from datetime import datetime, timedelta, timezone
import importlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen


NODE_AUTHORIZER = r"""
import fs from 'node:fs';
import crypto from 'node:crypto';
const args = process.argv.slice(2);
const value = flag => args[args.indexOf(flag) + 1];
const fixture = JSON.parse(fs.readFileSync(value('--fixture'), 'utf8'));
const e = fixture.envelope;
const stable = JSON.stringify(Object.fromEntries(Object.keys(e).sort().map(k => [k, e[k]])));
const sha = crypto.createHash('sha256').update(stable, 'utf8').digest('hex');
if (fixture.status !== 'AUTHORIZED' || e.dispatch_ref !== value('--dispatch-ref') || sha !== value('--envelope-sha256')) {
  process.stdout.write(JSON.stringify({status:'DENIED'}));
} else process.stdout.write(JSON.stringify(fixture));
"""

FAKE_ADAPTER = '''
import asyncio
from types import SimpleNamespace
class BuzzAdapter:
    def __init__(self):
        self._self_pubkey = 'synthetic-bot'
        self.calls = []
        self.mode = 'ack'
        self.delay = 0
        self.expected_loop = None
    async def _send_with_retry(self, chat_id, content, reply_to=None, metadata=None, max_retries=2, base_delay=2.0):
        assert asyncio.get_running_loop() is self.expected_loop
        assert max_retries == 0 and reply_to is None and metadata is None
        if getattr(self, 'expected_ledger', None):
            import sqlite3
            db = sqlite3.connect(self.expected_ledger)
            try: assert db.execute("SELECT status FROM feedback_native_attempts").fetchone() == ('UNKNOWN',)
            finally: db.close()
        self.calls.append((chat_id, content))
        await asyncio.sleep(self.delay)
        if self.mode == 'raise': raise RuntimeError('synthetic ambiguous transport failure')
        if self.mode == 'false': return SimpleNamespace(success=False,raw_response={'accepted':False},message_id=None)
        if self.mode == 'partial': return SimpleNamespace(success=True,raw_response={},message_id='synthetic-id')
        if self.mode == 'no-id': return SimpleNamespace(success=True,raw_response={'accepted':True},message_id=' ')
        return SimpleNamespace(success=True,raw_response={'accepted':True},message_id='synthetic-message-id')
'''


class NativeInstalledTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.node = shutil.which('node')
        if not cls.node:
            raise unittest.SkipTest('Node is required for the real authorization subprocess test')
        cls.install = tempfile.TemporaryDirectory(prefix='synthetic-buzz-install-')
        cls.install_root = Path(cls.install.name)
        for directory in ('hermes_cli', 'plugins', 'plugins/platforms', 'plugins/platforms/buzz'):
            path = cls.install_root / directory
            path.mkdir(parents=True, exist_ok=True)
            (path / '__init__.py').write_text('', encoding='utf-8')
        (cls.install_root / 'hermes_cli/profiles.py').write_text(
            "active = 'synthetic-profile'\ndef get_active_profile_name(): return active\n", encoding='utf-8')
        (cls.install_root / 'plugins/platforms/buzz/adapter.py').write_text(FAKE_ADAPTER, encoding='utf-8')
        shutil.copyfile(Path(__file__).with_name('feedback_buzz_bridge.py'), cls.install_root / 'feedback_buzz_bridge.py')
        sys.path.insert(0, str(cls.install_root))
        cls.native = importlib.import_module('plugins.platforms.buzz.adapter')
        cls.profiles = importlib.import_module('hermes_cli.profiles')
        spec = importlib.util.spec_from_file_location('synthetic_installed_bridge', cls.install_root / 'feedback_buzz_bridge.py')
        cls.bridge_module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = cls.bridge_module
        spec.loader.exec_module(cls.bridge_module)
        cls.node_sha = cls.bridge_module.file_sha256(cls.node)

    @classmethod
    def tearDownClass(cls):
        sys.path.remove(str(cls.install_root))
        for name in list(sys.modules):
            if name == 'synthetic_installed_bridge' or name.startswith(('hermes_cli', 'plugins')):
                module = sys.modules[name]
                if str(cls.install_root) in str(getattr(module, '__file__', '')):
                    del sys.modules[name]
        cls.install.cleanup()

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='synthetic-buzz-state-')
        self.root = Path(self.temp.name)
        self.script = self.root / 'authorize.mjs'
        self.script.write_text(NODE_AUTHORIZER, encoding='utf-8')
        self.fixture = self.root / 'authority.json'
        now = datetime.now(timezone.utc)
        self.envelope = dict(version=1, dispatch_ref='synthetic-dispatch', project_ref='synthetic-project',
            event_key='synthetic-event', notice_ref='synthetic-notice', notice_sha256='a'*64,
            state='needs_manager', manager_route_id='synthetic-route', route_sha256='b'*64,
            profile_ref='synthetic-profile', bot_chat_id='synthetic-chat', sender_ref='synthetic-bot',
            purpose='manager_feedback_notice', issued_at=(now-timedelta(seconds=1)).isoformat(),
            expires_at=(now+timedelta(minutes=2)).isoformat(), text='검토 요청: synthetic notice 🙂')
        self.write_authority()
        self.binding = self.bridge_module.NativeBinding(
            node_executable=str(Path(self.node).resolve()), node_executable_sha256=self.node_sha,
            authorization_script=str(self.script), authorization_script_sha256=self.bridge_module.file_sha256(self.script),
            authorization_argv=('--fixture', str(self.fixture)), authorization_code_pins=(),
            ledger_path=str(self.root/'native.sqlite'), profile_ref='synthetic-profile', bot_ref='synthetic-bot',
            loopback_port=0, response_timeout=2)
        self.adapter = self.native.BuzzAdapter()
        self.profiles.active = 'synthetic-profile'
        self.loop = asyncio.new_event_loop()
        self.adapter.expected_loop = self.loop
        self.thread = threading.Thread(target=self.loop.run_forever, daemon=True)
        self.thread.start()
        self.bridge = self.register()

    def register(self):
        async def install():
            return self.bridge_module.register_installed_adapter(self.adapter, self.binding)
        return asyncio.run_coroutine_threadsafe(install(), self.loop).result(5)

    def tearDown(self):
        self.bridge.close()
        self.loop.call_soon_threadsafe(self.loop.stop)
        self.thread.join(5)
        self.loop.close()
        self.temp.cleanup()

    def write_authority(self, status='AUTHORIZED'):
        self.fixture.write_text(json.dumps(dict(status=status,envelope=self.envelope), ensure_ascii=False), encoding='utf-8')

    def request_body(self):
        return dict(dispatch_ref=self.envelope['dispatch_ref'], envelope_sha256=self.bridge_module.envelope_sha256(self.envelope))

    def post(self, path='/send', body=None, headers=None):
        request = Request(f'http://127.0.0.1:{self.bridge.port}{path}',
            data=json.dumps(body or self.request_body()).encode('utf-8'),
            headers={'Content-Type':'application/json', **(headers or {})}, method='POST')
        try:
            response = urlopen(request, timeout=5)
        except HTTPError as error:
            response = error
        with response:
            return response.status, json.loads(response.read())

    def test_real_http_installed_copy_ack_exactly_once_and_metadata_receipt(self):
        self.adapter.expected_ledger = self.binding.ledger_path
        self.assertEqual(self.post()[1]['status'], 'ACKNOWLEDGED')
        self.assertEqual(self.post()[1]['status'], 'ACKNOWLEDGED')
        receipt = self.post('/receipt')[1]
        self.assertEqual(set(receipt), {'status','dispatch_ref','envelope_sha256','message_id'})
        self.assertEqual(self.adapter.calls, [('synthetic-chat', self.envelope['text'])])
        self.bridge.close()
        self.bridge = self.register()
        self.assertEqual(self.post()[1]['status'], 'ACKNOWLEDGED')
        self.assertEqual(len(self.adapter.calls), 1)

    def test_unknown_failure_no_resend_after_restart(self):
        self.adapter.mode = 'raise'
        self.assertEqual(self.post()[1]['status'], 'UNKNOWN')
        self.bridge.close()
        self.bridge = self.register()
        self.adapter.mode = 'ack'
        self.assertEqual(self.post()[1]['status'], 'UNKNOWN')
        self.assertEqual(len(self.adapter.calls), 1)

    def test_ack_requires_all_three_native_fields(self):
        for index, mode in enumerate(('false', 'partial', 'no-id')):
            self.adapter.mode = mode
            self.envelope['dispatch_ref'] = f'synthetic-dispatch-{index}'
            self.write_authority()
            self.assertEqual(self.post()[1]['status'], 'UNKNOWN')
        self.assertEqual(len(self.adapter.calls), 3)

    def test_hash_collision_cannot_send_again(self):
        self.assertEqual(self.post()[1]['status'], 'ACKNOWLEDGED')
        self.envelope['text'] = 'collision'
        self.write_authority()
        self.assertEqual(self.post()[1]['status'], 'COLLISION')
        self.assertEqual(self.post('/receipt')[1]['status'], 'COLLISION')
        self.assertEqual(len(self.adapter.calls), 1)

    def test_expiry_purpose_sender_profile_and_authorization_refuse_before_send(self):
        original = dict(self.envelope)
        mutations = {'expires_at':'2000-01-01T00:00:00Z', 'purpose':'different-purpose',
                     'sender_ref':'wrong-sender', 'profile_ref':'wrong-profile'}
        for key, value in mutations.items():
            self.envelope = {**original, key:value}
            self.write_authority()
            self.assertEqual(self.post()[1]['status'], 'DENIED', key)
        self.envelope = original
        self.write_authority('REVOKED')
        self.assertEqual(self.post()[1]['status'], 'DENIED')
        self.write_authority()
        self.adapter._self_pubkey = 'drifted-native-identity'
        self.assertEqual(self.post()[1]['status'], 'DENIED')
        self.adapter._self_pubkey = self.binding.bot_ref
        self.profiles.active = 'drifted-profile'
        self.assertEqual(self.post()[1]['status'], 'DENIED')
        self.assertEqual(self.adapter.calls, [])
        self.assertEqual(self.post('/receipt')[1]['status'], 'NOT_FOUND')

    def test_code_pin_drift_refuses_before_send(self):
        self.script.write_text(NODE_AUTHORIZER+'\n// drift', encoding='utf-8')
        self.assertEqual(self.post()[1]['status'], 'DENIED')
        self.assertEqual(self.adapter.calls, [])

    def test_lost_http_response_does_not_retry_and_late_ack_is_pollable(self):
        self.bridge.close()
        self.binding = replace(self.binding, response_timeout=0.05)
        self.bridge = self.register()
        self.adapter.delay = 0.3
        self.assertEqual(self.post()[1]['status'], 'UNKNOWN')
        deadline = time.monotonic() + 3
        result = self.post('/receipt')[1]
        while result['status'] != 'ACKNOWLEDGED' and time.monotonic() < deadline:
            time.sleep(0.03)
            result = self.post('/receipt')[1]
        self.assertEqual(result['status'], 'ACKNOWLEDGED')
        self.assertEqual(self.post()[1]['status'], 'ACKNOWLEDGED')
        self.assertEqual(len(self.adapter.calls), 1)

    def test_http_rejects_browser_origin_and_untrusted_payload_fields(self):
        self.assertEqual(self.post(headers={'Origin':'https://example.invalid'})[0], 400)
        self.assertEqual(self.post(body={**self.request_body(), 'text':'untrusted'})[0], 400)
        self.assertEqual(self.post('/unknown')[0], 400)
        self.assertEqual(self.adapter.calls, [])

    def test_offline_generator_installs_real_hook_into_synthetic_native_copy(self):
        # Execute the generated hook in a separate interpreter, not a callback.
        source = self.root/'approved_adapter.py'
        source.write_text(FAKE_ADAPTER + '''
    async def connect(self):
        self.expected_loop = asyncio.get_running_loop()
        return True
    async def disconnect(self):
        return None
''', encoding='utf-8')
        binding_file = self.root/'synthetic-binding.json'
        binding_file.write_text(json.dumps(asdict(self.binding)), encoding='utf-8')
        output = self.root/'candidate'
        generator = Path(__file__).with_name('feedback_buzz_bridge_install.py')
        argv = [sys.executable, str(generator), '--source', str(source), '--source-sha256',
                self.bridge_module.file_sha256(source), '--connect-anchor', '        return True',
                '--disconnect-anchor', '        return None', '--binding-json', str(binding_file), '--output', str(output)]
        result = subprocess.run(argv, capture_output=True, text=True, check=True)
        self.assertEqual(json.loads(result.stdout)['activation'], 'NOT_APPLIED')
        self.assertNotIn('_feedback_notice_bridge', source.read_text('utf-8'))
        # Synthetic profile module is the only profile source available here.
        (output/'hermes_cli').mkdir()
        (output/'hermes_cli/profiles.py').write_text("def get_active_profile_name(): return 'synthetic-profile'\n", encoding='utf-8')
        runner = output/'probe.py'
        runner.write_text('''
import asyncio, json
from urllib.request import Request,urlopen
from plugins.platforms.buzz.adapter import BuzzAdapter
from tools.feedback_buzz_bridge import envelope_sha256
async def main():
    adapter = BuzzAdapter()
    assert await adapter.connect() is True
    bridge = adapter._feedback_notice_bridge
    envelope = json.loads(open('''+repr(str(self.fixture))+''',encoding='utf-8').read())['envelope']
    body = {'dispatch_ref':envelope['dispatch_ref'],'envelope_sha256':envelope_sha256(envelope)}
    def send():
        req = Request('http://127.0.0.1:'+str(bridge.port)+'/send', data=json.dumps(body).encode(), headers={'Content-Type':'application/json'})
        with urlopen(req,timeout=5) as reply: return json.load(reply)
    reply = await asyncio.to_thread(send)
    assert reply['status'] == 'ACKNOWLEDGED'
    assert len(adapter.calls) == 1
    await adapter.disconnect()
    assert adapter._feedback_notice_bridge is None
    print(json.dumps({'status':'SYNTHETIC_INSTALLED_HOOK_PASSED','native_calls':len(adapter.calls)}))
asyncio.run(main())
''', encoding='utf-8')
        probe = subprocess.run([sys.executable, str(runner)], cwd=str(output), capture_output=True, text=True, check=True)
        self.assertEqual(json.loads(probe.stdout)['native_calls'], 1)
        refused = subprocess.run(argv, capture_output=True, text=True)
        self.assertEqual(refused.returncode, 1)  # Existing candidate never overwritten.
        bad_pin = list(argv)
        bad_pin[bad_pin.index('--source-sha256')+1] = '0'*64
        bad_pin[bad_pin.index('--output')+1] = str(self.root/'bad-pin-candidate')
        self.assertEqual(subprocess.run(bad_pin, capture_output=True).returncode, 1)
        self.assertFalse((self.root/'bad-pin-candidate').exists())

    def test_concurrent_http_requests_consume_once(self):
        from concurrent.futures import ThreadPoolExecutor
        self.adapter.delay = 0.1
        with ThreadPoolExecutor(max_workers=5) as pool:
            results = list(pool.map(lambda _: self.post()[1], range(5)))
        self.assertTrue(all(result['status'] in ('UNKNOWN','ACKNOWLEDGED') for result in results))
        self.assertEqual(len(self.adapter.calls), 1)

    def test_bounded_authorization_output_cannot_reach_native_send(self):
        self.bridge.close()
        self.script.write_text("process.stdout.write('x'.repeat(1000000));", encoding='utf-8')
        self.binding = replace(self.binding, authorization_script_sha256=self.bridge_module.file_sha256(self.script))
        self.bridge = self.register()
        self.assertEqual(self.post()[1]['status'], 'DENIED')
        self.assertEqual(self.adapter.calls, [])


if __name__ == '__main__':
    unittest.main()
