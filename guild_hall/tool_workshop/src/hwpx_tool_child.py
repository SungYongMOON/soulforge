"""Fixed HWPX text replacement and structural readback; no extraction or renderer."""
import hashlib
import html
import json
import pathlib
import re
import stat
import sys
import unicodedata
import xml.etree.ElementTree as ET
import zipfile

HP = 'http://www.hancom.co.kr/hwpml/2011/paragraph'
HS = 'http://www.hancom.co.kr/hwpml/2011/section'
OPF = 'http://www.idpf.org/2007/opf/'
NS = {'hp': HP, 'hs': HS, 'opf': OPF}
SECTION = 'Contents/section0.xml'
PARTS = {'mimetype', 'META-INF/container.xml', 'META-INF/manifest.xml', 'Contents/content.hpf', 'Contents/header.xml', SECTION, 'settings.xml', 'version.xml'}
HEADER_SHA256 = '5695dfef65e1045496eb71e775fc7f4a101f0558bbe077243d499db0471b7528'
SECTION_SHA256 = '4381dfc49a947a8bdb2bffa82624e81bf36c72a2ea67439cae7232312704e014'
MAX_ZIP = 2 * 1024 * 1024


def digest(data):
    return hashlib.sha256(data).hexdigest()


def packet_check(packet):
    assert set(packet) == {'kind', 'project_ref', 'source_ref', 'revision', 'approval_ref', 'provenance', 'template_sha256', 'title', 'body'}
    assert packet['kind'] == 'hwpx_text_packet' and packet['provenance'] in ('synthetic_fixture', 'owner_approved')
    assert all(isinstance(packet[key], str) and re.fullmatch(r'[a-z][a-z0-9_.:-]{1,120}', packet[key]) for key in ('project_ref', 'source_ref', 'revision', 'approval_ref'))
    assert re.fullmatch(r'[a-f0-9]{64}', packet['template_sha256'])
    for key, limit in [('title', 16), ('body', 20)]:
        text = packet[key]
        assert isinstance(text, str) and text.strip() and 1 <= len(text) <= limit
        assert text == unicodedata.normalize('NFC', text) and re.fullmatch(r'[\x20-\x7e\uac00-\ud7a3]+', text) and '{{' not in text


def package(file):
    assert file.stat().st_size <= MAX_ZIP
    raw = file.read_bytes()
    assert raw.startswith(b'PK\x03\x04') and raw[-22:-18] == b'PK\x05\x06', 'ZIP preamble, trailing bytes or comment'
    with zipfile.ZipFile(file) as archive:
        entries = archive.infolist()
        names = [entry.filename for entry in entries]
        assert len(entries) <= 16 and len(names) == len(set(name.casefold() for name in names))
        assert sum(entry.file_size for entry in entries) <= MAX_ZIP and not archive.comment
        for entry in entries:
            assert not entry.extra and not entry.comment, 'unmodeled entry metadata'
            assert not entry.is_dir() and not entry.flag_bits & 1 and entry.compress_type in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED)
            assert stat.S_IFMT(entry.external_attr >> 16) in (0, stat.S_IFREG), 'link/special entry'
            assert entry.file_size <= 512 * 1024 and entry.compress_size <= MAX_ZIP
            assert not entry.filename.startswith('/') and '\\' not in entry.filename and ':' not in entry.filename
            assert all(part not in ('', '.', '..') for part in entry.filename.split('/'))
        assert set(names) == PARTS, 'unsupported entry or preview'
        assert names[0] == 'mimetype' and entries[0].header_offset == 0 and entries[0].compress_type == zipfile.ZIP_STORED
        # Bound expansion before CRC/read; no ZipFile.extractall call exists.
        assert archive.testzip() is None
        contents = {name: archive.read(name) for name in names}
    assert contents['mimetype'] == b'application/hwp+zip'
    roots = {}
    for name, data in contents.items():
        if name == 'mimetype':
            continue
        text = data.decode('utf-8')
        assert not re.search(r'<!DOCTYPE|<!ENTITY|<\?(?!xml\s)|<(?:\w+:)?(?:script|include|binaryItem|ole|pic)\b', text, re.I)
        root = roots[name] = ET.fromstring(data)
        for node in root.iter():
            assert not node.tag.startswith('{http://www.w3.org/2001/XInclude}')
            for key, value in node.attrib.items():
                if name == 'Contents/header.xml' and node.tag == f'{{{HP}}}case' and key == f'{{{HP}}}required-namespace' and value in ('http://www.hancom.co.kr/hwpml/2016/HwpUnitChar', 'http://www.hancom.co.kr/hwpml/2016/paragraph'):
                    continue  # Fixed header feature identifier, never a fetch target.
                assert not re.search(r'^(?:https?|file|ftp|data|javascript):|\\|(?:^|/)\.\.(?:/|$)', value, re.I), 'external reference'
                if key.split('}')[-1] in ('href', 'full-path'):
                    assert value in PARTS, 'unbound package reference'
    assert digest(contents['Contents/header.xml']) == HEADER_SHA256, 'fixed style profile'
    package_root = roots['Contents/content.hpf']
    assert package_root.tag == f'{{{OPF}}}package'
    items = package_root.findall('opf:manifest/opf:item', NS)
    assert [(node.get('id'), node.get('href')) for node in items] == [('header', 'Contents/header.xml'), ('section0', SECTION), ('settings', 'settings.xml')]
    assert [node.get('idref') for node in package_root.findall('opf:spine/opf:itemref', NS)] == ['header', 'section0']
    root = roots[SECTION]
    assert root.tag == f'{{{HS}}}sec' and len(root.findall('.//hp:secPr', NS)) == 1
    assert len(root.findall('hp:p', NS)) == 2
    for paragraph in root.findall('.//hp:p', NS):
        assert paragraph.get('paraPrIDRef') == '0' and paragraph.get('styleIDRef') == '0'
    assert all(run.get('charPrIDRef') == '0' for run in root.findall('.//hp:run', NS))
    tables = root.findall('.//hp:tbl', NS)
    assert len(tables) == 1
    table = tables[0]
    assert table.get('rowCnt') == '2' and table.get('colCnt') == '2' and table.get('borderFillIDRef') == '1'
    assert table.find('hp:sz', NS).attrib == {'width': '42520', 'height': '7200', 'widthRelTo': 'ABSOLUTE', 'heightRelTo': 'ABSOLUTE', 'protect': '0'}
    rows = table.findall('hp:tr', NS)
    assert len(rows) == 2
    for row_index, row in enumerate(rows):
        cells = row.findall('hp:tc', NS)
        assert len(cells) == 2
        for col_index, cell in enumerate(cells):
            assert cell.get('borderFillIDRef') == '1'
            assert cell.find('hp:cellAddr', NS).attrib == {'colAddr': str(col_index), 'rowAddr': str(row_index)}
            assert cell.find('hp:cellSpan', NS).attrib == {'colSpan': '1', 'rowSpan': '1'}
            assert cell.find('hp:cellSz', NS).attrib == {'width': '21260', 'height': '3600'}
            assert len(cell.findall('.//hp:t', NS)) == 1
    assert len(root.findall('.//hp:t', NS)) == 5
    return contents, entries


def replacement(section, packet):
    assert digest(section) == SECTION_SHA256, 'fixed single-section template profile'
    for key in ('title', 'body'):
        token = f'<hp:t>{{{{{key.upper()}}}}}</hp:t>'.encode()
        assert section.count(token) == 1
        value = f'<hp:t>{html.escape(packet[key], quote=False)}</hp:t>'.encode('utf-8')
        section = section.replace(token, value)
    return section


def validate(template, output, packet):
    packet_check(packet)
    assert digest(template.read_bytes()) == packet['template_sha256']
    before, _ = package(template)
    after, _ = package(output)
    baseline_texts = [node.text for node in ET.fromstring(before[SECTION]).findall('.//hp:t', NS)]
    assert baseline_texts == ['{{TITLE}}', '항목', '결과', '합성 검토', '{{BODY}}']
    assert after[SECTION] == replacement(before[SECTION], packet), 'section bytes changed outside two approved text nodes'
    assert all(after[name] == before[name] for name in PARTS - {SECTION}), 'immutable entry changed'
    assert [node.text for node in ET.fromstring(after[SECTION]).findall('.//hp:t', NS)] == [packet['title'], '항목', '결과', '합성 검토', packet['body']]
    data = output.read_bytes()
    return {'sha256': digest(data), 'size_bytes': len(data), 'template_sha256': packet['template_sha256'], 'section_count': 1, 'table_shape': '2x2', 'editable_text_count': 2, 'preview_status': 'absent_by_profile', 'validation_level': 'structural_only_no_render'}


def main():
    mode, packet_path, template_path, output_path = sys.argv[1:]
    packet = json.loads(pathlib.Path(packet_path).read_text(encoding='utf-8'))
    packet_check(packet)
    template, output = pathlib.Path(template_path), pathlib.Path(output_path)
    assert digest(template.read_bytes()) == packet['template_sha256']
    if mode == 'author':
        contents, entries = package(template)
        contents[SECTION] = replacement(contents[SECTION], packet)
        with zipfile.ZipFile(output, 'x') as archive:
            for entry in entries:
                archive.writestr(entry, contents[entry.filename])
    else:
        assert mode == 'validate'
    print(json.dumps(validate(template, output, packet)))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('hwpx_tool_failed', file=sys.stderr)
        sys.exit(1)
