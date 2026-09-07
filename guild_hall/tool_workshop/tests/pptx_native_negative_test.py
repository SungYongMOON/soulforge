"""Synthetic adversarial native-format checks. Does not author source files."""
import importlib.util
import pathlib
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location('native_validator', pathlib.Path(__file__).parents[1]/'src/pptx_tool_child.py')
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)


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


if __name__ == '__main__':
    unittest.main()
