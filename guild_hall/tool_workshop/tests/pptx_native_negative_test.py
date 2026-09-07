"""Synthetic adversarial native-format checks. Does not author source files."""
import importlib.util
import copy
import pathlib
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location('native_validator', pathlib.Path(__file__).parents[1]/'src/pptx_tool_child.py')
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)


def text_case(count=3):
    profile = {'family': 'workshop.approved_text', 'revision': 'template:test1', 'slides': [
        {'textboxes': [{'placeholder': '{{TEXT_%d}}' % index, 'geometry': [72, 48, 1136, 128], 'font_family': 'Malgun Gothic', 'font_size': 32}]} for index in range(1, count+1)]}
    packet = {'slides': [{'texts': ['합성 검토: 24 V ± 5%']} for _ in range(count)]}
    presentation = f'<p:presentation xmlns:p="{native.NS["p"]}" xmlns:r="{native.REL}"><p:sldIdLst>'+''.join(f'<p:sldId id="{255+i}" r:id="r{i}"/>' for i in range(1, count+1))+'</p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>'
    rels = '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+''.join(f'<Relationship Id="r{i}" Type="{native.REL}/slide" Target="slides/slide{i}.xml"/>' for i in range(1, count+1))+'</Relationships>'
    entries = {'[Content_Types].xml': '<Types/>', 'ppt/presentation.xml': presentation, 'ppt/_rels/presentation.xml.rels': rels}
    for index in range(1, count+1):
        entries[f'ppt/slides/slide{index}.xml'] = f'<p:sld xmlns:p="{native.NS["p"]}" xmlns:a="{native.NS["a"]}"><p:cSld><p:spTree><p:sp><p:spPr><a:xfrm><a:off x="685800" y="457200"/><a:ext cx="10820400" cy="1219200"/></a:xfrm></p:spPr><p:txBody><a:bodyPr><a:noAutofit/></a:bodyPr><a:p><a:r><a:rPr sz="2400"><a:latin typeface="Malgun Gothic"/><a:ea typeface="Malgun Gothic"/><a:cs typeface="Malgun Gothic"/></a:rPr><a:t>{{{{TEXT_{index}}}}}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>'
    return profile, packet, {key: value.encode('utf-8') for key, value in entries.items()}


class NegativeNativeTests(unittest.TestCase):
    def invalid_package(self, entries):
        with tempfile.TemporaryDirectory(prefix='workshop-pptx-negative-') as temporary:
            file = pathlib.Path(temporary)/'candidate.pptx'
            with zipfile.ZipFile(file, 'w') as archive:
                for name, data in entries:
                    archive.writestr(name, data)
            with self.assertRaises(AssertionError):
                native.package(file)

    def test_path_traversal(self):
        self.invalid_package([('../outside.xml', '<x/>')])

    def test_macro_carrier(self):
        self.invalid_package([('ppt/vbaProject.bin', 'macro')])

    def test_case_folded_duplicate(self):
        self.invalid_package([('ppt/a.xml', '<x/>'), ('PPT/A.xml', '<x/>')])

    def test_missing_slides_and_non_native_bytes(self):
        self.invalid_package([('[Content_Types].xml', '<Types/>')])

    def test_png_corruption(self):
        with tempfile.TemporaryDirectory(prefix='workshop-pptx-negative-') as temporary:
            file = pathlib.Path(temporary)/'slide.png'
            file.write_bytes(b'not a PNG')
            with self.assertRaises(AssertionError):
                native.png_check(file)

    def test_twenty_slide_order_and_upper_bound(self):
        for count in (2, 3, 20):
            profile, packet, entries = text_case(count)
            native.profile_check(profile, packet)
            with tempfile.TemporaryDirectory() as temporary:
                file = pathlib.Path(temporary)/'template.pptx'
                with zipfile.ZipFile(file, 'w') as archive:
                    for name, data in entries.items():
                        archive.writestr(name, data)
                native.template_check(native.package(file, count), profile)
        profile, packet, _ = text_case(21)
        with self.assertRaises(AssertionError):
            native.profile_check(profile, packet)

    def test_native_gate_independently_rejects_unicode_and_overflow(self):
        profile, packet, _ = text_case()
        for text in ['\u1112\u1161\u11ab글', '가\u202e나', '가\u2066나', '가\u0301', '가\u2028나', '가\u2029나', '가\t나', '가\ue000', '\ud800', '한'*40, '가\n나\n다']:
            changed = copy.deepcopy(packet)
            changed['slides'][0]['texts'][0] = text
            with self.subTest(text=repr(text)), self.assertRaises(AssertionError):
                native.profile_check(profile, changed)

    def test_approved_mapping_rejects_geometry_font_autofit_and_unmapped_text(self):
        profile, _, baseline = text_case()
        for before, after in [(b'x="685800"', b'x="685801"'), (b'Malgun Gothic', b'Arial'), (b'<a:noAutofit/>', b'<a:spAutoFit/>'), (b'<a:bodyPr>', b'<a:bodyPr rot="900000">'), (b'{{TEXT_1}}', b'{{UNKNOWN}}')]:
            entries = dict(baseline)
            entries['ppt/slides/slide1.xml'] = entries['ppt/slides/slide1.xml'].replace(before, after)
            with self.subTest(after=after), self.assertRaises(AssertionError):
                native.template_check(entries, profile)
        entries = dict(baseline)
        entries['ppt/notesSlides/notes1.xml'] = f'<p:notes xmlns:p="{native.NS["p"]}" xmlns:a="{native.NS["a"]}"><a:t>Unmapped text</a:t></p:notes>'.encode()
        with self.assertRaises(AssertionError):
            native.template_check(entries, profile)

    def test_package_rejects_reordered_slides_external_relationship_and_script(self):
        _, _, baseline = text_case()
        for name, before, after in [
            ('ppt/presentation.xml', b'r:id="r1"', b'r:id="r2"'),
            ('ppt/_rels/presentation.xml.rels', b'Target="slides/slide1.xml"', b'Target="https://example.invalid/a" TargetMode="External"'),
            ('[Content_Types].xml', b'<Types/>', b'<Types ContentType="text/html"/>')
        ]:
            entries = dict(baseline)
            entries[name] = entries[name].replace(before, after)
            with tempfile.TemporaryDirectory() as temporary:
                file = pathlib.Path(temporary)/'candidate.pptx'
                with zipfile.ZipFile(file, 'w') as archive:
                    for key, data in entries.items():
                        archive.writestr(key, data)
                with self.subTest(name=name), self.assertRaises(AssertionError):
                    native.package(file, 3)

    def test_native_readback_rejects_content_drift(self):
        profile, packet, entries = text_case()
        with tempfile.TemporaryDirectory() as temporary:
            template, candidate = [pathlib.Path(temporary)/name for name in ('template.pptx', 'candidate.pptx')]
            with zipfile.ZipFile(template, 'w') as archive:
                for name, data in entries.items():
                    archive.writestr(name, data)
            packet['template_sha256'] = native.digest(template.read_bytes())
            with zipfile.ZipFile(candidate, 'w') as archive:
                for name, data in entries.items():
                    for index in range(1, 4):
                        data = data.replace(('{{TEXT_%d}}' % index).encode(), packet['slides'][index-1]['texts'][0].encode())
                    archive.writestr(name, data)
            self.assertEqual(native.native_check(template, candidate, packet, profile)['slide_count'], 3)
            packet['slides'][0]['texts'][0] = '의미가 바뀐 승인 밖 문장'
            with self.assertRaises(AssertionError):
                native.native_check(template, candidate, packet, profile)


if __name__ == '__main__':
    unittest.main()
