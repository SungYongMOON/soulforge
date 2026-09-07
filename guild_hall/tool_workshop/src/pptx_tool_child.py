"""Fixed template author/native validator; trusted paths only, stdlib runtime."""
import hashlib
import importlib.util
import json
import pathlib
import posixpath
import re
import struct
import sys
import xml.etree.ElementTree as ET
import zipfile
import zlib

NS = {'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
      'p': 'http://schemas.openxmlformats.org/presentationml/2006/main'}
SLIDES = ['ppt/slides/slide1.xml', 'ppt/slides/slide2.xml']


def digest(data):
    return hashlib.sha256(data).hexdigest()


def package(file):
    assert file.stat().st_size <= 8 * 1024 * 1024
    with zipfile.ZipFile(file) as archive:
        records = archive.infolist()
        names = [entry.filename for entry in records]
        assert 1 <= len(names) <= 200 and len(set(name.lower() for name in names)) == len(names)
        assert sum(entry.file_size for entry in records) <= 16 * 1024 * 1024
        for entry in records:
            assert not entry.is_dir() and not entry.flag_bits & 1
            assert entry.file_size <= 4 * 1024 * 1024
            assert not entry.filename.startswith('/') and '\\' not in entry.filename and ':' not in entry.filename
            assert all(part not in ('', '.', '..') for part in entry.filename.split('/'))
            assert not re.search(r'vba|embedding|activex|externallink|oleobject', entry.filename, re.I)
        assert archive.testzip() is None
        contents = {name: archive.read(name) for name in names}
    assert '[Content_Types].xml' in contents and 'ppt/presentation.xml' in contents
    assert sorted(name for name in names if re.fullmatch(r'ppt/slides/slide\d+\.xml', name)) == SLIDES
    for name, data in contents.items():
        if name.endswith(('.xml', '.rels')):
            assert b'<!DOCTYPE' not in data.upper() and b'<!ENTITY' not in data.upper()
            root = ET.fromstring(data)
            if name.endswith('.rels'):
                base = '' if name == '_rels/.rels' else posixpath.dirname(posixpath.dirname(name))
                for rel in root:
                    assert rel.get('TargetMode') != 'External'
                    target = rel.get('Target', '')
                    assert target and not target.startswith('//') and ':' not in target and '\\' not in target
                    resolved = posixpath.normpath(target[1:] if target.startswith('/') else posixpath.join(base, target))
                    assert not resolved.startswith('../') and resolved in contents
    return contents


def native_check(template, output, packet):
    template_bytes = template.read_bytes()
    assert digest(template_bytes) == packet['template_sha256']
    before, after = package(template), package(output)
    assert before.keys() == after.keys()
    assert all(before[name] == after[name] for name in before if name not in SLIDES)
    for index, name in enumerate(SLIDES):
        baseline, actual = ET.fromstring(before[name]), ET.fromstring(after[name])
        expected = [packet['slides'][index]['title'], packet['slides'][index]['body']]
        assert [node.text for node in actual.findall('.//a:t', NS)] == expected
        assert [node.text for node in baseline.findall('.//a:t', NS)] == [f'{{{{TITLE_{index+1}}}}}', f'{{{{BODY_{index+1}}}}}']
        assert len(actual.findall('.//p:sp', NS)) == 2
        assert len(actual.findall('.//p:pic', NS)) == 0
        for root in (baseline, actual):
            for node in root.findall('.//a:t', NS):
                node.text = ''
        assert ET.tostring(baseline) == ET.tostring(actual), 'template geometry or style drift'
    data = output.read_bytes()
    return {'sha256': digest(data), 'size_bytes': len(data), 'slide_count': 2,
            'template_sha256': packet['template_sha256']}


def png_check(file):
    data = file.read_bytes()
    assert data[:8] == b'\x89PNG\r\n\x1a\n' and len(data) <= 4 * 1024 * 1024
    cursor, compressed, header = 8, b'', None
    while cursor < len(data):
        size = struct.unpack('>I', data[cursor:cursor+4])[0]
        tag, payload = data[cursor+4:cursor+8], data[cursor+8:cursor+8+size]
        assert len(payload) == size
        assert zlib.crc32(tag+payload) & 0xffffffff == struct.unpack('>I', data[cursor+8+size:cursor+12+size])[0]
        if tag == b'IHDR':
            header = struct.unpack('>IIBBBBB', payload)
        if tag == b'IDAT':
            compressed += payload
        cursor += size + 12
    assert header and header[0:3] == (1280, 720, 8) and header[3] in (2, 6) and header[6] == 0
    channels, width, height = (4 if header[3] == 6 else 3), 1280, 720
    stride = width * channels
    inflater = zlib.decompressobj()
    raw = inflater.decompress(compressed, (stride+1)*height+1)
    assert inflater.eof and len(raw) == (stride+1)*height
    previous = bytearray(stride)
    regions = [0, 0]
    for y in range(height):
        kind, row = raw[y*(stride+1)], bytearray(raw[y*(stride+1)+1:(y+1)*(stride+1)])
        assert 0 <= kind <= 4
        for x in range(stride):
            left, up = (row[x-channels] if x >= channels else 0), previous[x]
            diagonal = previous[x-channels] if x >= channels else 0
            predictor = left + up - diagonal
            distances = [abs(predictor-left), abs(predictor-up), abs(predictor-diagonal)]
            paeth = [left, up, diagonal][distances.index(min(distances))]
            row[x] = (row[x] + [0, left, up, (left+up)//2, paeth][kind]) % 256
        for x in range(width):
            pixel = row[x*channels:(x+1)*channels]
            if min(pixel[:3]) < 160 and (channels == 3 or pixel[3] > 200):
                assert 60 <= x <= 1220 and 35 <= y <= 655, 'ink outside approved layout'
                if y < 140:
                    regions[0] += 1
                else:
                    regions[1] += 1
        previous = row
    assert min(regions) >= 50, 'blank title or body render'
    return {'sha256': digest(data), 'size_bytes': len(data), 'width': width, 'height': height}


def main():
    mode, packet_path, template_path, output_path = sys.argv[1:]
    packet = json.loads(pathlib.Path(packet_path).read_text(encoding='utf-8'))
    template, output = pathlib.Path(template_path), pathlib.Path(output_path)
    if mode == 'author':
        contents = package(template)
        assert digest(template.read_bytes()) == packet['template_sha256']
        staging = output.parent / 'pptx-edit'
        staging.mkdir()
        for name, data in contents.items():
            target = staging / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        source = pathlib.Path(__file__).parents[3] / '.registry/skills/pptx_autofill_conversion/codex/scripts/replace_text_runs.py'
        spec = importlib.util.spec_from_file_location('approved_replacer', source)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        mapping = {}
        for index, slide in enumerate(packet['slides'], 1):
            mapping[f'{{{{TITLE_{index}}}}}'] = slide['title']
            mapping[f'{{{{BODY_{index}}}}}'] = slide['body']
        assert module.replace_exact_text(staging, mapping) == 4
        with zipfile.ZipFile(output, 'x', compression=zipfile.ZIP_DEFLATED) as archive:
            for name in sorted(contents):
                archive.writestr(zipfile.ZipInfo(name, date_time=(2000, 1, 1, 0, 0, 0)), (staging/name).read_bytes())
    elif mode not in ('validate', 'render-qa'):
        raise ValueError('mode')
    result = native_check(template, output, packet)
    if mode == 'render-qa':
        result['renders'] = [png_check(output.parent/f'slide-{index}.png') for index in (1, 2)]
    print(json.dumps(result))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('pptx_tool_failed', file=sys.stderr)
        sys.exit(1)
