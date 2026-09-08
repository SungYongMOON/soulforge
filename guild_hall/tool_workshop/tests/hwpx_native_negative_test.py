import copy
import importlib.util
import pathlib
import struct
import tempfile
import unittest
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[3]


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, file)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


native = module('hwpx_native', ROOT/'guild_hall/tool_workshop/src/hwpx_tool_child.py')
fixture = module('hwpx_fixture', ROOT/'docs/architecture/workspace/examples/tool_workshop/synthetic_hwpx_fixture.py')


class NativeTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='workshop-hwpx-native-')
        self.root = pathlib.Path(self.temporary.name)
        self.template = self.root/'template.hwpx'
        fixture.build(self.template)
        self.contents, self.entries = native.package(self.template)
        self.packet = {'kind': 'hwpx_text_packet', 'project_ref': 'project.synthetic', 'source_ref': 'source.synthetic', 'revision': 'revision:v1', 'approval_ref': 'approval.synthetic', 'provenance': 'synthetic_fixture', 'template_sha256': native.digest(self.template.read_bytes()), 'title': '합성 검토 기록', 'body': '조건 확인 완료'}

    def tearDown(self):
        self.temporary.cleanup()

    def write(self, contents, extra=None, transform=None):
        file = self.root/'candidate.hwpx'
        with zipfile.ZipFile(file, 'w') as archive:
            for original in self.entries:
                entry = copy.copy(original)
                if transform:
                    transform(entry)
                archive.writestr(entry, contents[original.filename])
            if extra:
                archive.writestr(*extra)
        return file

    def test_valid_candidate_keeps_every_other_entry_and_two_texts(self):
        data = dict(self.contents)
        data[native.SECTION] = native.replacement(data[native.SECTION], self.packet)
        result = native.validate(self.template, self.write(data), self.packet)
        self.assertEqual(result['validation_level'], 'structural_only_no_render')
        self.assertEqual(result['preview_status'], 'absent_by_profile')
        escaped = dict(self.packet); escaped['title'] = 'A & B < C'
        data[native.SECTION] = native.replacement(self.contents[native.SECTION], escaped)
        self.assertEqual(native.validate(self.template, self.write(data), escaped)['editable_text_count'], 2)

    def test_archive_traversal_duplicate_special_preview_and_oversize(self):
        for extra in [('../escape.xml', b'x'), ('MIMETYPE', b'x'), ('Preview/PrvText.txt', b'stale'), ('Contents/section1.xml', b'<x/>')]:
            with self.subTest(extra=extra[0]), self.assertRaises(AssertionError):
                native.package(self.write(self.contents, extra=extra))
        for filename in ('/absolute.xml', 'C:ads.xml', 'a\\bad.xml', 'a/./bad.xml'):
            with self.subTest(filename=filename), self.assertRaises(AssertionError):
                native.package(self.write(self.contents, extra=(filename, b'x')))
        huge = dict(self.contents); huge['settings.xml'] = b'x'*(512*1024+1)
        with self.assertRaises(AssertionError):
            native.package(self.write(huge))
        def symlink(entry):
            if entry.filename == 'settings.xml':
                entry.create_system = 3; entry.external_attr = 0o120777 << 16
        with self.assertRaises(AssertionError):
            native.package(self.write(self.contents, transform=symlink))

    def test_encrypted_entry_and_mimetype_compression(self):
        file = self.write(self.contents)
        data = bytearray(file.read_bytes())
        struct.pack_into('<H', data, 6, struct.unpack_from('<H', data, 6)[0] | 1)
        central = data.index(b'PK\x01\x02')
        struct.pack_into('<H', data, central+8, struct.unpack_from('<H', data, central+8)[0] | 1)
        file.write_bytes(data)
        with self.assertRaises(AssertionError):
            native.package(file)
        def compress(entry):
            entry.compress_type = zipfile.ZIP_DEFLATED
        with self.assertRaises(AssertionError):
            native.package(self.write(self.contents, transform=compress))
        file = self.write(self.contents); file.write_bytes(file.read_bytes()+b'unmapped payload')
        with self.assertRaises(AssertionError):
            native.package(file)

    def test_per_entry_extra_is_rejected(self):
        def extra(entry):
            if entry.filename == 'settings.xml':
                entry.extra = b'\xfe\xca\x06\x00HIDDEN'
        file = self.write(self.contents, transform=extra)
        with zipfile.ZipFile(file) as archive:
            self.assertEqual(len(archive.getinfo('settings.xml').extra), 10)
        with self.assertRaises(AssertionError):
            native.package(file)

    def test_per_entry_comment_is_rejected(self):
        def comment(entry):
            if entry.filename == 'settings.xml':
                entry.comment = b'HIDDEN'
        file = self.write(self.contents, transform=comment)
        with zipfile.ZipFile(file) as archive:
            self.assertEqual(archive.getinfo('settings.xml').comment, b'HIDDEN')
        with self.assertRaises(AssertionError):
            native.package(file)

    def test_archive_comment_remains_rejected(self):
        file = self.write(self.contents)
        with zipfile.ZipFile(file, 'a') as archive:
            archive.comment = b'HIDDEN'
        with self.assertRaises(AssertionError):
            native.package(file)

    def test_external_reference_entity_style_table_and_immutable_entry(self):
        for name, old, new in [('settings.xml', b'pos="16"', b'pos="16" href="https://example.invalid/"'), ('settings.xml', b'<ha:HWPApplicationSetting', b'<!DOCTYPE x [<!ENTITY y SYSTEM "file:///secret">]><ha:HWPApplicationSetting'), ('Contents/header.xml', b'height="1000"', b'height="9000"'), (native.SECTION, b'rowCnt="2"', b'rowCnt="3"'), (native.SECTION, b'colSpan="1"', b'colSpan="2"')]:
            data = dict(self.contents); self.assertIn(old, data[name]); data[name] = data[name].replace(old, new)
            with self.subTest(name=name, new=new), self.assertRaises(AssertionError):
                native.package(self.write(data))
        data = dict(self.contents); data[native.SECTION] = native.replacement(data[native.SECTION], self.packet)
        data['settings.xml'] = data['settings.xml'].replace(b'pos="16"', b'pos="17"')
        with self.assertRaises(AssertionError):
            native.validate(self.template, self.write(data), self.packet)

    def test_wrong_template_text_and_scope(self):
        data = dict(self.contents); data[native.SECTION] = native.replacement(data[native.SECTION], self.packet)
        output = self.write(data)
        bad = dict(self.packet); bad['template_sha256'] = '0'*64
        with self.assertRaises(AssertionError):
            native.validate(self.template, output, bad)
        bad = dict(self.packet); bad['body'] = '다른 내용'
        with self.assertRaises(AssertionError):
            native.validate(self.template, output, bad)
        for text in ['가'*21, '가\n나', '\u1112\u1161\u11ab', '가\u202e나', '가\u0301', '가\u2028나', '{{BODY}}']:
            bad = dict(self.packet); bad['body'] = text
            with self.subTest(text=repr(text)), self.assertRaises(AssertionError):
                native.packet_check(bad)


if __name__ == '__main__':
    unittest.main()
