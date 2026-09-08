"""Generate an offline native Buzz adapter candidate from exact reviewed bytes.

This never applies to an installed Hermes tree, starts a gateway, or sends. Both
insertion anchors must be unique whole lines in the native connect/disconnect
methods. The reviewer chooses a connect anchor after identity lock succeeds and
before polling starts. No historical vendor digest is treated as a current pin.
"""
import argparse
import ast
from dataclasses import asdict
import difflib
import hashlib
import json
from pathlib import Path

from feedback_buzz_bridge import NativeBinding


def _sha(data):
    return hashlib.sha256(data).hexdigest()


def _anchor(source, tree, anchor, method):
    lines = source.splitlines(keepends=True)
    matches = [i for i, line in enumerate(lines) if line.rstrip("\r\n") == anchor]
    if len(matches) != 1 or not anchor.strip() or "\n" in anchor or "\r" in anchor:
        raise ValueError("anchor must be a unique whole source line")
    index = matches[0]
    classes = [node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == 'BuzzAdapter']
    methods = [node for cls in classes for node in cls.body
               if isinstance(node, ast.AsyncFunctionDef) and node.name == method]
    if len(methods) != 1 or not methods[0].lineno < index + 1 <= methods[0].end_lineno:
        raise ValueError("anchor must be inside the exact native async method")
    indent = anchor[:len(anchor)-len(anchor.lstrip())]
    if len(indent) != methods[0].col_offset + 4:
        raise ValueError("anchor must be at the unconditional method body indentation")
    return index, indent


def prepare_candidate(source_path, source_sha256, connect_anchor, disconnect_anchor,
                      binding_values, output_directory):
    source_path, output = Path(source_path), Path(output_directory)
    raw = source_path.read_bytes()
    if _sha(raw) != source_sha256:
        raise ValueError("source pin mismatch")
    source = raw.decode('utf-8')
    if '_feedback_notice_bridge' in source:
        raise ValueError("source already contains this bridge")
    tree = ast.parse(source)
    connect_index, connect_indent = _anchor(source, tree, connect_anchor, 'connect')
    disconnect_index, disconnect_indent = _anchor(source, tree, disconnect_anchor, 'disconnect')
    values = dict(binding_values)
    values['authorization_argv'] = tuple(values['authorization_argv'])
    values['authorization_code_pins'] = tuple(tuple(pin) for pin in values['authorization_code_pins'])
    binding = NativeBinding(**values)
    binding.validate()
    # Port zero is useful for isolated tests; never infer a production port.
    if output.exists():
        raise ValueError("candidate output must be a new directory")
    if not output.is_absolute() or not output.parent.is_dir():
        raise ValueError("candidate parent must already exist")
    connect_code = [
        'from tools.feedback_buzz_bridge import register_installed_adapter',
        'from tools.feedback_buzz_bridge_binding import BINDING',
        'self._feedback_notice_bridge = register_installed_adapter(self, BINDING)',
    ]
    disconnect_code = [
        '_feedback_bridge = getattr(self, "_feedback_notice_bridge", None)',
        'if _feedback_bridge is not None:',
        '    import asyncio as _feedback_asyncio',
        '    await _feedback_asyncio.to_thread(_feedback_bridge.close)',
        '    self._feedback_notice_bridge = None',
    ]
    lines = source.splitlines(keepends=True)
    newline = '\r\n' if '\r\n' in source else '\n'
    for index, indent, code in sorted(((connect_index, connect_indent, connect_code),
                                      (disconnect_index, disconnect_indent, disconnect_code)), reverse=True):
        lines[index:index] = [indent + line + newline for line in code]
    patched = ''.join(lines)
    ast.parse(patched)
    bridge_bytes = Path(__file__).with_name('feedback_buzz_bridge.py').read_bytes()
    binding_source = ('# Generated private installation binding; never commit actual values.\n'
                      'from tools.feedback_buzz_bridge import NativeBinding\n'
                      'BINDING = NativeBinding(**' + repr(asdict(binding)) + ')\n')
    patch = ''.join(difflib.unified_diff(source.splitlines(keepends=True), patched.splitlines(keepends=True),
                                       fromfile='a/plugins/platforms/buzz/adapter.py',
                                       tofile='b/plugins/platforms/buzz/adapter.py'))
    receipt = dict(status='OFFLINE_CANDIDATE', source_sha256=source_sha256,
                   patched_adapter_sha256=_sha(patched.encode('utf-8')),
                   bridge_sha256=_sha(bridge_bytes), binding_sha256=_sha(binding_source.encode('utf-8')),
                   activation='NOT_APPLIED', native_connection='NOT_OBSERVED')
    output.mkdir()
    (output/'plugins/platforms/buzz').mkdir(parents=True)
    (output/'tools').mkdir()
    (output/'plugins/platforms/buzz/adapter.py').write_bytes(patched.encode('utf-8'))
    (output/'tools/feedback_buzz_bridge.py').write_bytes(bridge_bytes)
    (output/'tools/feedback_buzz_bridge_binding.py').write_bytes(binding_source.encode('utf-8'))
    (output/'hermes-feedback-bridge.patch').write_bytes(patch.encode('utf-8'))
    (output/'receipt.json').write_text(json.dumps(receipt, indent=2)+'\n', encoding='utf-8')
    return receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True)
    parser.add_argument('--source-sha256', required=True)
    parser.add_argument('--connect-anchor', required=True)
    parser.add_argument('--disconnect-anchor', required=True)
    parser.add_argument('--binding-json', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    try:
        receipt = prepare_candidate(args.source, args.source_sha256, args.connect_anchor,
                                    args.disconnect_anchor, json.loads(Path(args.binding_json).read_text('utf-8')), args.output)
    except Exception:
        print(json.dumps({'status':'REFUSED'}))
        return 1
    print(json.dumps(receipt))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
