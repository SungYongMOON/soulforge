"""Public synthetic bytes only: Windows text translation must not alter keys."""
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from soulforge_secure_work import adapters, winsec


class SyntheticAes:
    @staticmethod
    def generate_key(*, bit_length):
        assert bit_length == 256
        return b'\n\r\x1a' + b'public-test-only'.ljust(29, b'.')

    def __new__(cls, key):
        return AESGCM(key)


class KeywrapBinaryTests(unittest.TestCase):
    def test_new_wrapper_preserves_binary_bytes_and_reopens(self):
        with tempfile.TemporaryDirectory(prefix='secure-keywrap-binary-') as scratch:
            target = Path(scratch) / 'synthetic-wrapper.bin'
            with patch('cryptography.hazmat.primitives.ciphers.aead.AESGCM', SyntheticAes), \
                 patch.object(winsec, 'restrict_to_current_user', return_value=winsec.AclLockdown(False, False, 'SYNTHETIC_NO_ACL_CHANGE')):
                wrapper = adapters.LocalFileKeyWrapper(target)
                self.assertEqual(target.stat().st_size, 32)
                identifier, wrapped = wrapper.wrap(b'public synthetic payload')
                reopened = adapters.LocalFileKeyWrapper(target)
                self.assertEqual(reopened.unwrap(identifier, wrapped), b'public synthetic payload')

    def test_existing_wrong_length_is_preserved_and_refused(self):
        with tempfile.TemporaryDirectory(prefix='secure-keywrap-invalid-') as scratch:
            target = Path(scratch) / 'synthetic-wrapper.bin'
            target.write_bytes(b'public-invalid-fixture'.ljust(33, b'.'))
            before = target.stat()
            with self.assertRaises(adapters.AdapterUnavailable) as raised:
                adapters.LocalFileKeyWrapper(target)
            self.assertEqual(raised.exception.reason, 'key_wrapper_shape')
            self.assertEqual(target.stat().st_size, before.st_size)
            self.assertEqual(target.stat().st_mtime_ns, before.st_mtime_ns)

    def test_short_write_is_refused_without_publishing_acl_receipt(self):
        with tempfile.TemporaryDirectory(prefix='secure-keywrap-short-') as scratch:
            target = Path(scratch) / 'synthetic-wrapper.bin'
            real_write = adapters.os.write
            with patch('cryptography.hazmat.primitives.ciphers.aead.AESGCM', SyntheticAes), \
                 patch.object(adapters.os, 'write', side_effect=lambda fd, data: real_write(fd, data[:7])), \
                 patch.object(winsec, 'restrict_to_current_user') as acl:
                with self.assertRaises(adapters.AdapterUnavailable) as raised:
                    adapters.LocalFileKeyWrapper(target)
                self.assertEqual(raised.exception.reason, 'key_wrapper_write_incomplete')
                acl.assert_not_called()
            self.assertEqual(target.stat().st_size, 7)
            self.assertFalse(target.with_name(target.name + '.acl_receipt.json').exists())


if __name__ == '__main__':
    unittest.main()
