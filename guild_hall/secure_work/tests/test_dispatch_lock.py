"""Actual local OS lock exclusion, normal release and process-death release."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


class DispatchLockContract(unittest.TestCase):
    def child(self, root, mode):
        env = {k: os.environ[k] for k in ("SystemRoot", "WINDIR", "TEMP", "TMP") if k in os.environ}
        return subprocess.Popen([sys.executable, "-I", "-B",
            str(Path(__file__).with_name("dispatch_lock_child.py")), str(root), mode],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)

    def verify_release(self, crash):
        with tempfile.TemporaryDirectory(prefix="sfx_synthetic_lock_") as root:
            first = self.child(root, "wait")
            try:
                self.assertEqual(first.stdout.readline(), b"LOCKED\n" if os.name != "nt" else b"LOCKED\r\n")
                second = self.child(root, "probe")
                out, error = second.communicate(timeout=5)
                self.assertEqual(second.returncode, 3)
                self.assertEqual(out.strip(), b"DISPATCH_BUSY")
                self.assertFalse(error)
                if crash:
                    first.kill()
                    first.communicate(timeout=5)
                else:
                    first.communicate(input=b"release\n", timeout=5)
                    self.assertEqual(first.returncode, 0)
                third = self.child(root, "probe")
                out, error = third.communicate(timeout=5)
                self.assertEqual(third.returncode, 0)
                self.assertEqual(out.strip(), b"LOCKED")
                self.assertFalse(error)
            finally:
                if first.poll() is None:
                    first.kill()
                    first.communicate(timeout=5)

    def test_normal_release(self):
        self.verify_release(False)

    def test_process_death_release(self):
        self.verify_release(True)


if __name__ == "__main__":
    unittest.main()
