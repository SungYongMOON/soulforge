"""Fixed data-only HWPX assembly through the canonical pack and reference gate."""
import contextlib
import io
import json
import pathlib
import re
import sys


def text_edit_replacements(original, roots, sections, allowed, edits, ref, etree):
    """Map lexical spans to admitted parser identities before changing text bytes."""
    ref.check(isinstance(edits, list) and 0 < len(edits) <= 20000, 'text_edits_invalid')
    targets = {}
    for edit in edits:
        ref.check(isinstance(edit, dict) and set(edit) == {'part', 'text_index', 'before', 'after'}, 'text_edits_invalid')
        part, index = edit['part'], edit['text_index']
        ref.check(isinstance(part, str) and part in allowed, 'text_edit_part_invalid')
        ref.check(type(index) is int and index >= 0 and isinstance(edit['before'], str)
                  and isinstance(edit['after'], str), 'text_edits_invalid')
        key = (part, index)
        ref.check(key not in targets, 'text_edit_duplicate')
        nodes = list(roots[part].iter(f'{{{ref.HP}}}t'))
        ref.check(index < len(nodes), 'text_edit_index_invalid')
        node = nodes[index]
        ref.check(len(node) == 0 and not any(parent.tag == f'{{{ref.HP}}}t' for parent in node.iterancestors()), 'text_edit_complex')
        ref.check((node.text or '') == edit['before'], 'text_edit_before_mismatch')
        # lxml validates XML characters; escaping is performed on the original
        # byte span below, so no unrelated XML serialization is introduced.
        node.text = edit['after']
        targets[key] = edit['after']
    replacements = {}
    tokens = re.compile(rb'<!--.*?-->|<!\[CDATA\[.*?\]\]>|<\?.*?\?>|<(?:[^<>"\']|"[^"]*"|\'[^\']*\')*>', re.S)
    for part in allowed:
        if not any(key[0] == part for key in targets):
            continue
        data, root = original[part], roots[part]
        elements = [node for node in root.iter() if isinstance(node.tag, str)]
        stack, changes, element_index, text_index = [], [], 0, 0
        for token in tokens.finditer(data):
            raw = token.group()
            if raw.startswith((b'<!--', b'<![CDATA[', b'<?')):
                continue
            if raw.startswith(b'</'):
                ref.check(bool(stack), 'text_edit_xml_mapping')
                name, opening, selected = stack.pop()
                ref.check(raw[2:-1].strip() == name, 'text_edit_xml_mapping')
                if selected is not None:
                    changes.append((opening.end(), token.start(), selected))
                continue
            ref.check(element_index < len(elements), 'text_edit_xml_mapping')
            node = elements[element_index]
            element_index += 1
            name = re.match(rb'<([^\s/>]+)', raw).group(1)
            lexical = name.decode('utf-8').split(':')
            ref.check(len(lexical) <= 2, 'text_edit_xml_mapping')
            namespace = node.nsmap.get(lexical[0] if len(lexical) == 2 else None)
            qualified = f'{{{namespace}}}{lexical[-1]}' if namespace else lexical[-1]
            ref.check(node.tag == qualified, 'text_edit_xml_mapping')
            selected = None
            if node.tag == f'{{{ref.HP}}}t':
                if (part, text_index) in targets:
                    text = targets[(part, text_index)]
                    selected = text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('\r', '&#13;').encode('utf-8')
                text_index += 1
            if raw.endswith(b'/>'):
                if selected is not None:
                    changes.append((token.end() - 2, token.end(), b'>' + selected + b'</' + name + b'>'))
            else:
                stack.append((name, token, selected))
        ref.check(not stack and element_index == len(elements)
                  and len(changes) == sum(key[0] == part for key in targets), 'text_edit_xml_mapping')
        for start, end, replacement in sorted(changes, reverse=True):
            data = data[:start] + replacement + data[end:]
        replacements[part] = data
    expected = [''.join(node.itertext()) for part in sections for node in roots[part].iter(f'{{{ref.HP}}}t')]
    return replacements, expected


def build(run_root, scripts_root, reference_child, etree):
    # Imports resolve only inside the Node-created, hash-checked code/runtime
    # snapshot. The model draft never supplies a module, executable or root.
    import importlib.util
    spec = importlib.util.spec_from_file_location('_hwpx_author_reference', reference_child)
    ref = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = ref
    spec.loader.exec_module(ref)
    run_root = ref.direct(run_root, True)
    scripts_root = ref.direct(scripts_root, True)
    request = json.loads(ref.bounded_read(run_root / 'author-request.json', 65536), object_pairs_hook=ref.request_object)
    ref.check(set(request) == {'reference_sha256', 'draft_sha256', 'allowed_parts', 'pack_sha256'}, 'request_invalid')
    draft_bytes = ref.bounded_read(run_root / 'draft.json', 65536)
    reference_bytes = ref.bounded_read(run_root / 'reference.hwpx', ref.MAX_ZIP)
    ref.check(ref.digest(draft_bytes) == request['draft_sha256'] and ref.digest(reference_bytes) == request['reference_sha256'], 'hash_mismatch')
    draft = json.loads(draft_bytes.decode('utf-8'), object_pairs_hook=ref.request_object)
    ref.check(isinstance(draft, dict) and set(draft) in ({'sections', 'expected_text'}, {'text_edits'}), 'draft_invalid')
    original, roots, source_sections = ref.admission(reference_bytes, etree)
    ref.check(set(request['allowed_parts']) <= set(source_sections), 'allowed_parts_invalid')
    if 'text_edits' in draft:
        replacements, expected = text_edit_replacements(original, roots, source_sections, request['allowed_parts'], draft['text_edits'], ref, etree)
    else:
        sections = draft['sections']
        ref.check(isinstance(sections, list) and all(isinstance(item, dict) and set(item) == {'part', 'xml'} for item in sections), 'draft_invalid')
        ref.check([item['part'] for item in sections] == request['allowed_parts'] and all(isinstance(item['xml'], str) for item in sections), 'allowed_parts_invalid')
        replacements = {item['part']: item['xml'].encode('utf-8') for item in sections}
        expected = draft['expected_text']
    original_tree = run_root / 'original-parts'
    candidate_tree = run_root / 'candidate-parts'
    original_tree.mkdir()
    candidate_tree.mkdir()
    # Admission has already bounded every ZIP member and excluded traversal,
    # symlinks, active content and external references. Never extractall/unpack.
    for name, data in original.items():
        for tree, body in [(original_tree, data), (candidate_tree, replacements.get(name, data))]:
            destination = tree / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            with destination.open('xb') as output:
                output.write(body)
    pack_path = scripts_root / 'office' / 'pack.py'
    ref.check(ref.digest(ref.bounded_read(pack_path, 2 * 1024 * 1024)) == request['pack_sha256'], 'pack_binding_drift')
    pack = ref.load_canonical(pack_path, '_hwpx_author_pack')
    # pack() accepts ZipFile's file-object target. Exclusive creation keeps its
    # internal mode='w' away from every prior output and the approved original.
    with (run_root / 'candidate.hwpx').open('xb') as output:
        pack.pack(str(candidate_tree), output)
    candidate = ref.bounded_read(run_root / 'candidate.hwpx', ref.MAX_ZIP)
    verification = {'reference_sha256': request['reference_sha256'], 'candidate_sha256': ref.digest(candidate),
                    'allowed_parts': request['allowed_parts'], 'expected_text': expected}
    verify_path = run_root / 'verify-request.json'
    with verify_path.open('x', encoding='utf-8') as output:
        json.dump(verification, output)
    # Actual canonical validation and every-section page guard run before the
    # assembled bytes are eligible for input publication or durable custody.
    checked = ref.verify(verify_path, scripts_root, run_root, etree)
    ref.check(checked['ok'] is True and ref.bounded_read(run_root / 'reference.hwpx', ref.MAX_ZIP) == reference_bytes
              and ref.bounded_read(run_root / 'draft.json', 65536) == draft_bytes, 'input_changed')
    expected_bytes = json.dumps(expected, ensure_ascii=True, separators=(',', ':')).encode('utf-8')
    with (run_root / 'expected-text.json').open('xb') as output:
        output.write(expected_bytes)
    return {'ok': True, 'sha256': ref.digest(candidate), 'size_bytes': len(candidate), 'render_required': True,
            'expected_text_sha256': ref.digest(expected_bytes)}


if __name__ == '__main__':
    try:
        if len(sys.argv) != 4:
            raise ValueError('arguments_invalid')
        from lxml import etree
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            result = build(pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), pathlib.Path(sys.argv[3]), etree)
        print(json.dumps(result, separators=(',', ':')))
    except Exception:
        # Canonical diagnostics can contain draft text or paths. No raw output
        # crosses this fixed child contract; the failed work tree is preserved.
        print('{"ok":false,"code":"hwpx_author_failed"}')
        sys.exit(1)
