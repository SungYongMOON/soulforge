"""Independent python-pptx and XML readback of a synthetic canary, no author imports."""
import argparse
import hashlib
import json
import pathlib
import xml.etree.ElementTree as ET
import zipfile
from pptx import Presentation


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', required=True)
    args = parser.parse_args()
    root = pathlib.Path(args.root)
    receipt = json.loads((root/'candidate-receipt.json').read_text(encoding='utf-8'))
    artifact = receipt['receipt']['artifact']
    assert receipt['state'] == 'done_candidate'
    packet = json.loads((root/'inputRoot'/f'{receipt["receipt"]["input_bundle_manifest_digest"]}.json').read_text(encoding='utf-8'))
    file = root/'outputRoot'/f'{artifact["sha256"]}.pptx'
    data = file.read_bytes()
    assert hashlib.sha256(data).hexdigest() == artifact['sha256'] and len(data) == artifact['size_bytes']
    presentation = Presentation(file)
    assert len(presentation.slides) == len(packet['slides']) == artifact['render_count']
    profile_path = root/'text-profile.json'
    profile = json.loads(profile_path.read_text(encoding='utf-8')) if profile_path.exists() else None
    count = 0
    for index, slide in enumerate(presentation.slides):
        expected = packet['slides'][index].get('texts', [packet['slides'][index].get('title'), packet['slides'][index].get('body')])
        assert [shape.text for shape in slide.shapes] == expected
        assert all(shape.has_text_frame and not shape.has_table and not shape.has_chart for shape in slide.shapes)
        count += len(slide.shapes)
        if profile:
            for shape, box in zip(slide.shapes, profile['slides'][index]['textboxes']):
                assert [shape.left, shape.top, shape.width, shape.height] == [value*9525 for value in box['geometry']]
                assert all(run.font.name == box['font_family'] and run.font.size.pt == box['font_size']*0.75 for paragraph in shape.text_frame.paragraphs for run in paragraph.runs)
    ns = {'a': 'http://schemas.openxmlformats.org/drawingml/2006/main'}
    with zipfile.ZipFile(root/'templateRoot'/'template.pptx') as before, zipfile.ZipFile(file) as after:
        assert set(before.namelist()) == set(after.namelist()) and after.testzip() is None
        for name in before.namelist():
            if name.startswith('ppt/slides/slide') and name.endswith('.xml'):
                original, actual = ET.fromstring(before.read(name)), ET.fromstring(after.read(name))
                for element in (original, actual):
                    for node in element.findall('.//a:t', ns):
                        node.text = ''
                assert ET.tostring(original) == ET.tostring(actual)
            else:
                assert before.read(name) == after.read(name)
    manifest = (root/'outputRoot'/f'{artifact["render_manifest_digest"]}.json').read_bytes()
    assert hashlib.sha256(manifest).hexdigest() == artifact['render_manifest_digest']
    renders = json.loads(manifest)
    assert len(renders) == len(presentation.slides)
    for render in renders:
        png = (root/'outputRoot'/f'{render["sha256"]}.png').read_bytes()
        assert hashlib.sha256(png).hexdigest() == render['sha256'] and len(png) == render['size_bytes']
    print(json.dumps({'ok': True, 'sha256': artifact['sha256'], 'size_bytes': len(data), 'slide_count': len(presentation.slides), 'editable_textbox_count': count, 'exact_text_geometry_font_parity': True, 'non_slide_parts_unchanged': True, 'render_count': len(renders)}, ensure_ascii=True))


if __name__ == '__main__':
    main()
