"""Independent XML/ZIP canary readback; does not import the author or validator."""
import argparse
import hashlib
import json
import pathlib
import xml.etree.ElementTree as ET
import zipfile


def main():
    parser = argparse.ArgumentParser()
    for name in ('packet', 'template', 'candidate'):
        parser.add_argument('--'+name, required=True)
    args = parser.parse_args()
    packet = json.loads(pathlib.Path(args.packet).read_text(encoding='utf-8'))
    template, candidate = pathlib.Path(args.template), pathlib.Path(args.candidate)
    assert hashlib.sha256(template.read_bytes()).hexdigest() == packet['template_sha256']
    ns = {'hp': 'http://www.hancom.co.kr/hwpml/2011/paragraph'}
    with zipfile.ZipFile(template) as before, zipfile.ZipFile(candidate) as after:
        assert before.namelist() == after.namelist() and after.testzip() is None
        assert after.namelist()[0] == 'mimetype' and after.getinfo('mimetype').compress_type == 0
        assert not any(name.startswith('Preview/') for name in after.namelist())
        for name in before.namelist():
            if name != 'Contents/section0.xml':
                assert before.read(name) == after.read(name)
        original = ET.fromstring(before.read('Contents/section0.xml'))
        actual = ET.fromstring(after.read('Contents/section0.xml'))
        a, b = original.findall('.//hp:t', ns), actual.findall('.//hp:t', ns)
        assert [node.text for node in a] == ['{{TITLE}}', '항목', '결과', '합성 검토', '{{BODY}}']
        assert [node.text for node in b] == [packet['title'], '항목', '결과', '합성 검토', packet['body']]
        for nodes in (a, b):
            nodes[0].text = ''; nodes[4].text = ''
        assert ET.tostring(original) == ET.tostring(actual)
        table = actual.findall('.//hp:tbl', ns)
        assert len(table) == 1 and table[0].get('rowCnt') == '2' and table[0].get('colCnt') == '2'
    data = candidate.read_bytes()
    print(json.dumps({'ok': True, 'sha256': hashlib.sha256(data).hexdigest(), 'size_bytes': len(data), 'changed_text_nodes': 2, 'other_entry_bytes_unchanged': True, 'table_shape': '2x2', 'preview': 'absent', 'render': 'not_performed'}))


if __name__ == '__main__':
    main()
