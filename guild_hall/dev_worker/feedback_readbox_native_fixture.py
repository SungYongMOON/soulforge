"""Synthetic Hermes process for the readbox installed-Node integration test.

Only temporary synthetic identity modules are created; no installed Hermes,
credentials, profile files, models or remote transport are discovered or used.
The bridge itself is loaded from the separately staged payload supplied by the
test. Its Node authorization command is real, pinned production candidate code.
"""
import argparse
import asyncio
import hashlib
import importlib
import json
from pathlib import Path
import socket
import sys


ADAPTER = '''
import asyncio
from types import SimpleNamespace
class BuzzAdapter:
    def __init__(self):
        self._self_pubkey = 'sender.synthetic'
        self.mode = 'ack'
        self.delay = 0
        self.calls = []
    async def _send_with_retry(self, chat_id, content, reply_to=None, metadata=None, max_retries=2, base_delay=2.0):
        assert chat_id == 'chat.synthetic'
        assert reply_to is None and metadata is None and max_retries == 0
        assert content.startswith('Feedback ')
        self.calls.append((chat_id, content))
        await asyncio.sleep(self.delay)
        if self.mode == 'unknown': raise RuntimeError('synthetic ambiguous native transport')
        return SimpleNamespace(success=True, raw_response={'accepted':True}, message_id='message.synthetic.ack')
'''


def emit(value):
    print(json.dumps(value, separators=(',', ':')), flush=True)


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--synthetic-root', required=True)
    parser.add_argument('--installed-root', required=True)
    args = parser.parse_args()
    root = Path(args.synthetic_root)
    installed = Path(args.installed_root)
    if not root.is_absolute() or not installed.is_absolute() or root.exists():
        raise ValueError('new absolute synthetic root required')
    root.mkdir()
    for relative in ('hermes_cli', 'plugins', 'plugins/platforms', 'plugins/platforms/buzz'):
        directory = root / relative
        directory.mkdir(parents=True, exist_ok=True)
        (directory / '__init__.py').write_text('', encoding='utf-8')
    (root / 'hermes_cli/profiles.py').write_text("def get_active_profile_name(): return 'profile.synthetic'\n", encoding='utf-8')
    (root / 'plugins/platforms/buzz/adapter.py').write_text(ADAPTER, encoding='utf-8')
    sys.path.insert(0, str(installed / 'guild_hall/dev_worker'))
    sys.path.insert(0, str(root))
    bridge_module = importlib.import_module('feedback_buzz_bridge')
    adapter_module = importlib.import_module('plugins.platforms.buzz.adapter')
    reservation = socket.socket()
    reservation.bind(('127.0.0.1', 0))
    port = reservation.getsockname()[1]
    emit({'state':'SYNTHETIC_PORT_RESERVED', 'port':port})
    packet = json.loads(await asyncio.to_thread(sys.stdin.readline))
    values = packet['binding']
    if values['profile_ref'] != 'profile.synthetic' or values['bot_ref'] != 'sender.synthetic' or values['loopback_port'] != port:
        raise ValueError('only the fixed synthetic identity is allowed')
    values['authorization_argv'] = tuple(values['authorization_argv'])
    values['authorization_code_pins'] = tuple(tuple(pin) for pin in values['authorization_code_pins'])
    binding = bridge_module.NativeBinding(**values)
    adapter = adapter_module.BuzzAdapter()
    adapter.mode = packet.get('mode', 'ack')
    adapter.delay = packet.get('delay', 0)
    if adapter.mode not in ('ack', 'unknown') or not 0 <= adapter.delay <= 5:
        raise ValueError('invalid synthetic transport mode')
    reservation.close()
    bridge = bridge_module.register_installed_adapter(adapter, binding)
    emit({'state':'SYNTHETIC_CONNECTED', 'port':bridge.port})
    try:
        while True:
            line = await asyncio.to_thread(sys.stdin.readline)
            if not line:
                break
            command = json.loads(line)
            if command == {'command':'stop'}:
                break
            if command != {'command':'status'}:
                raise ValueError('unknown synthetic command')
            emit({'state':'SYNTHETIC_STATUS', 'native_calls':len(adapter.calls),
                  'text_sha256':[hashlib.sha256(content.encode('utf-8')).hexdigest() for _, content in adapter.calls]})
    finally:
        await asyncio.to_thread(bridge.close)
    emit({'state':'SYNTHETIC_STOPPED', 'native_calls':len(adapter.calls)})


if __name__ == '__main__':
    asyncio.run(main())
