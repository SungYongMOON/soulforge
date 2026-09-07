"""Fixed template author/native validator; trusted paths only, stdlib runtime."""
import hashlib
import importlib.util
import json
import pathlib
import posixpath
import re
import struct
import sys
import unicodedata
import xml.etree.ElementTree as ET
import zipfile
import zlib

NS = {'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
      'p': 'http://schemas.openxmlformats.org/presentationml/2006/main'}
REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def package(file, slide_count=2):
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
            assert entry.filename.endswith(('.xml', '.rels')), 'text profile has no binary or script parts'
            assert not re.search(r'(^|/)(media|charts|diagrams|fonts|customXml)(/|$)', entry.filename, re.I)
        assert archive.testzip() is None
        contents = {name: archive.read(name) for name in names}
    assert '[Content_Types].xml' in contents and 'ppt/presentation.xml' in contents
    slides = [f'ppt/slides/slide{index}.xml' for index in range(1, slide_count+1)]
    assert 2 <= slide_count <= 20
    assert set(name for name in names if re.fullmatch(r'ppt/slides/slide\d+\.xml', name)) == set(slides)
    for name, data in contents.items():
        if name.endswith(('.xml', '.rels')):
            assert b'<!DOCTYPE' not in data.upper() and b'<!ENTITY' not in data.upper()
            root = ET.fromstring(data)
            assert not re.search(r'macroEnabled|oleObject|activeX|embeddedFont|javascript|text/html|<(?:\w+:)?(?:script|html|svg)(?:\s|>)', data.decode('utf-8'), re.I)
            if name.endswith('.rels'):
                base = '' if name == '_rels/.rels' else posixpath.dirname(posixpath.dirname(name))
                for rel in root:
                    assert rel.get('Type', '').split('/')[-1] in {'officeDocument', 'metadata/core-properties', 'core-properties', 'extended-properties', 'slide', 'slideLayout', 'slideMaster', 'notesSlide', 'notesMaster', 'theme', 'presProps', 'viewProps', 'tableStyles'}, 'unsupported relationship'
                    assert rel.get('TargetMode', 'Internal') == 'Internal'
                    target = rel.get('Target', '')
                    assert target and not target.startswith('//') and ':' not in target and '\\' not in target
                    resolved = posixpath.normpath(target[1:] if target.startswith('/') else posixpath.join(base, target))
                    assert not resolved.startswith('../') and resolved in contents
    presentation = ET.fromstring(contents['ppt/presentation.xml'])
    size = presentation.find('p:sldSz', NS)
    assert size is not None and (size.get('cx'), size.get('cy')) == ('12192000', '6858000')
    relationships = ET.fromstring(contents['ppt/_rels/presentation.xml.rels'])
    ids = [node.get('Id') for node in relationships]
    assert len(ids) == len(set(ids))
    by_id = {node.get('Id'): node for node in relationships}
    order = []
    for node in presentation.findall('p:sldIdLst/p:sldId', NS):
        rel = by_id[node.get(f'{{{REL}}}id')]
        assert rel.get('Type') == REL+'/slide'
        target = rel.get('Target')
        order.append(posixpath.normpath(target[1:] if target.startswith('/') else posixpath.join('ppt', target)))
    assert order == slides, 'slide order differs from approved packet'
    return contents


def profile_check(profile, packet):
    if profile is None:
        assert len(packet['slides']) == 2
        for slide in packet['slides']:
            assert set(slide) == {'title', 'body'}
            for key, limit in [('title', 24), ('body', 35)]:
                assert isinstance(slide[key], str) and 1 <= len(slide[key]) <= limit
                assert re.fullmatch(r'[\x20-\x7e]+', slide[key]) and '{{' not in slide[key]
        return
    assert set(profile) == {'family', 'revision', 'slides'}
    assert profile['family'] == 'workshop.approved_text' and re.fullmatch(r'[a-z][a-z0-9_.:-]{1,120}', profile['revision'])
    assert 2 <= len(profile['slides']) <= 20 and len(packet['slides']) == len(profile['slides'])
    placeholders = set()
    for slide, content in zip(profile['slides'], packet['slides']):
        assert set(slide) == {'textboxes'} and 1 <= len(slide['textboxes']) <= 4
        assert set(content) == {'texts'} and len(content['texts']) == len(slide['textboxes'])
        for box, text in zip(slide['textboxes'], content['texts']):
            assert set(box) == {'placeholder', 'geometry', 'font_family', 'font_size'}
            assert re.fullmatch(r'\{\{[A-Z][A-Z0-9_]{0,39}\}\}', box['placeholder']) and box['placeholder'] not in placeholders
            placeholders.add(box['placeholder'])
            assert box['font_family'] == 'Malgun Gothic' and type(box['font_size']) is int and 24 <= box['font_size'] <= 64
            assert len(box['geometry']) == 4 and all(type(value) is int for value in box['geometry'])
            x, y, width, height = box['geometry']
            assert x >= 60 and y >= 35 and width >= 100 and height >= box['font_size']*1.6 and x+width <= 1220 and y+height <= 655
            assert isinstance(text, str) and text.strip() and len(text) <= 800 and unicodedata.normalize('NFC', text) == text and '{{' not in text
            assert not any(unicodedata.category(char) in ('Cf', 'Cs', 'Co', 'Cn', 'Mn', 'Mc', 'Me', 'Zl', 'Zp') for char in text)
            assert re.fullmatch(r'[\x20-\x7e\n\u00a1-\u024f\u2000-\u206f\u2100-\u214f\u2190-\u22ff\u3000-\u303f\uac00-\ud7a3]+', text)
            lines = text.split('\n')
            assert len(lines) <= 8 and all(line.strip() for line in lines)
            assert len(lines)*box['font_size']*1.6 <= height-12, 'text height overflow'
            assert all(sum(1.1 if ord(char) < 128 else 1.2 for char in line)*box['font_size'] <= width-32 for line in lines), 'text width overflow'
        for i, box in enumerate(slide['textboxes']):
            x, y, width, height = box['geometry']
            for earlier in slide['textboxes'][:i]:
                a, b, c, d = earlier['geometry']
                assert not (x < a+c+8 and x+width+8 > a and y < b+d+8 and y+height+8 > b)


def template_check(contents, profile):
    if profile is None:
        return
    for index, slide in enumerate(profile['slides'], 1):
        root = ET.fromstring(contents[f'ppt/slides/slide{index}.xml'])
        shapes = root.findall('p:cSld/p:spTree/p:sp', NS)
        assert len(shapes) == len(slide['textboxes'])
        tree = root.find('p:cSld/p:spTree', NS)
        assert all(node.tag in {f'{{{NS["p"]}}}{tag}' for tag in ('nvGrpSpPr', 'grpSpPr', 'sp')} for node in tree)
        assert [node.text for node in root.findall('.//a:t', NS)] == [box['placeholder'] for box in slide['textboxes']]
        for shape, box in zip(shapes, slide['textboxes']):
            assert len(shape.findall('.//a:t', NS)) == 1 and len(shape.findall('.//a:p', NS)) == 1
            transform = shape.find('p:spPr/a:xfrm', NS)
            assert transform is not None and not transform.attrib
            off, ext = transform.find('a:off', NS), transform.find('a:ext', NS)
            assert [int(off.get('x')), int(off.get('y')), int(ext.get('cx')), int(ext.get('cy'))] == [value*9525 for value in box['geometry']]
            assert shape.find('p:txBody/a:bodyPr/a:noAutofit', NS) is not None
            body = shape.find('p:txBody/a:bodyPr', NS)
            assert not body.attrib, 'unsupported text insets, direction or anchoring'
            run = shape.find('p:txBody/a:p/a:r/a:rPr', NS)
            assert run is not None and int(run.get('sz')) == box['font_size']*75
            assert all(run.find(f'a:{tag}', NS).get('typeface') == box['font_family'] for tag in ('latin', 'ea', 'cs'))
    for name, data in contents.items():
        if name.endswith('.xml') and not re.fullmatch(r'ppt/slides/slide\d+\.xml', name):
            assert not any(node.text for node in ET.fromstring(data).findall('.//a:t', NS)), 'unmapped text in inherited or notes parts'


def native_check(template, output, packet, profile=None):
    profile_check(profile, packet)
    template_bytes = template.read_bytes()
    assert digest(template_bytes) == packet['template_sha256']
    slide_count = len(packet['slides'])
    slides = [f'ppt/slides/slide{index}.xml' for index in range(1, slide_count+1)]
    before, after = package(template, slide_count), package(output, slide_count)
    template_check(before, profile)
    assert before.keys() == after.keys()
    assert all(before[name] == after[name] for name in before if name not in slides)
    for index, name in enumerate(slides):
        baseline, actual = ET.fromstring(before[name]), ET.fromstring(after[name])
        expected = packet['slides'][index]['texts'] if profile else [packet['slides'][index]['title'], packet['slides'][index]['body']]
        assert [node.text for node in actual.findall('.//a:t', NS)] == expected
        placeholders = [box['placeholder'] for box in profile['slides'][index]['textboxes']] if profile else [f'{{{{TITLE_{index+1}}}}}', f'{{{{BODY_{index+1}}}}}']
        assert [node.text for node in baseline.findall('.//a:t', NS)] == placeholders
        assert len(actual.findall('.//p:sp', NS)) == len(expected)
        assert len(actual.findall('.//p:pic', NS)) == 0
        for root in (baseline, actual):
            for node in root.findall('.//a:t', NS):
                node.text = ''
        assert ET.tostring(baseline) == ET.tostring(actual), 'template geometry or style drift'
    data = output.read_bytes()
    return {'sha256': digest(data), 'size_bytes': len(data), 'slide_count': slide_count,
            'template_sha256': packet['template_sha256']}


def png_check(file, boxes=None):
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
    regions = [0] * (len(boxes) if boxes else 2)
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
                if boxes:
                    matches = [index for index, box in enumerate(boxes) if box['geometry'][0]+2 <= x < box['geometry'][0]+box['geometry'][2]-2 and box['geometry'][1]+2 <= y < box['geometry'][1]+box['geometry'][3]-2]
                    assert len(matches) == 1, 'ink outside or touching textbox boundary'
                    regions[matches[0]] += 1
                elif y < 140:
                    regions[0] += 1
                else:
                    regions[1] += 1
        previous = row
    assert min(regions) >= 50, 'blank textbox render'
    return {'sha256': digest(data), 'size_bytes': len(data), 'width': width, 'height': height}


def main():
    assert len(sys.argv) in (5, 6)
    mode, packet_path, template_path, output_path = sys.argv[1:5]
    packet = json.loads(pathlib.Path(packet_path).read_text(encoding='utf-8'))
    profile = json.loads(pathlib.Path(sys.argv[5]).read_text(encoding='utf-8')) if len(sys.argv) == 6 else None
    profile_check(profile, packet)
    template, output = pathlib.Path(template_path), pathlib.Path(output_path)
    if mode == 'author':
        contents = package(template, len(packet['slides']))
        template_check(contents, profile)
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
            if profile:
                mapping.update({box['placeholder']: text for box, text in zip(profile['slides'][index-1]['textboxes'], slide['texts'])})
            else:
                mapping[f'{{{{TITLE_{index}}}}}'] = slide['title']
                mapping[f'{{{{BODY_{index}}}}}'] = slide['body']
        assert module.replace_exact_text(staging, mapping) == len(mapping)
        with zipfile.ZipFile(output, 'x', compression=zipfile.ZIP_DEFLATED) as archive:
            for name in sorted(contents):
                archive.writestr(zipfile.ZipInfo(name, date_time=(2000, 1, 1, 0, 0, 0)), (staging/name).read_bytes())
    elif mode not in ('validate', 'render-qa'):
        raise ValueError('mode')
    result = native_check(template, output, packet, profile)
    if mode == 'render-qa':
        result['renders'] = [png_check(output.parent/f'slide-{index}.png', profile['slides'][index-1]['textboxes'] if profile else None) for index in range(1, len(packet['slides'])+1)]
    print(json.dumps(result))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('pptx_tool_failed', file=sys.stderr)
        sys.exit(1)
