"""Behavior tests for the bounded synthetic PPT Workshop MCP seam."""

from __future__ import annotations

import importlib.util
import os
from pathlib import Path
import tempfile
import unittest


MODULE = Path(__file__).resolve().parents[1] / "fixtures" / "ppt_workshop_pilot_mcp.py"


def load_module():
    spec = importlib.util.spec_from_file_location("ppt_workshop_pilot_mcp", MODULE)
    if spec is None or spec.loader is None:
        raise RuntimeError("module_spec_missing")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PptWorkshopPilotTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        base = Path(self.temp.name)
        os.environ["PPT_JOB_ROOT"] = str(base / "jobs")
        os.environ["PPT_WORK_PRODUCT_ROOT"] = str(base / "work-products")

    def tearDown(self):
        os.environ.pop("PPT_JOB_ROOT", None)
        os.environ.pop("PPT_WORK_PRODUCT_ROOT", None)
        self.temp.cleanup()

    def test_good_checkpoint_path_is_finalized_and_bad_branch_is_excluded(self):
        module = load_module()
        initial = module.initialize_synthetic_ppt(
            "PILOT-PROJECT", "ART-PILOT-PPT-001", "JOB-0001"
        )
        self.assertEqual(initial["checkpoint_id"], "C0000")
        self.assertEqual(initial["slide_titles"][2], "Baseline slide 3")
        job_root = Path(os.environ["PPT_JOB_ROOT"]) / "PILOT-PROJECT" / "JOB-0001"
        self.assertTrue((job_root / "REQUEST" / "request.json").is_file())
        self.assertTrue((job_root / "CHECKPOINTS" / "C0000" / "pilot_deck.pptx").is_file())

        c1 = module.edit_slide_checkpoint(
            "PILOT-PROJECT",
            "ART-PILOT-PPT-001",
            "JOB-0001",
            "C0000",
            "C0001",
            3,
            "Slide 3 good",
        )
        self.assertEqual(c1["slide_titles"][2], "Slide 3 good")
        self.assertTrue((job_root / "CHECKPOINTS" / "C0001" / "pilot_deck.pptx").is_file())

        bad = module.edit_slide_checkpoint(
            "PILOT-PROJECT",
            "ART-PILOT-PPT-001",
            "JOB-0001",
            "C0001",
            "C0002",
            4,
            "Slide 4 wrong",
        )
        self.assertEqual(bad["slide_titles"][3], "Slide 4 wrong")

        corrected = module.edit_slide_checkpoint(
            "PILOT-PROJECT",
            "ART-PILOT-PPT-001",
            "JOB-0001",
            "C0001",
            "C0003",
            4,
            "Slide 4 corrected",
        )
        self.assertEqual(corrected["slide_titles"][2:], ["Slide 3 good", "Slide 4 corrected"])

        revision = module.finalize_candidate_revision(
            "PILOT-PROJECT",
            "ART-PILOT-PPT-001",
            "JOB-0001",
            "C0003",
            "R0001",
            "V1.1",
        )
        self.assertTrue((job_root / "OUTPUT" / "R0001" / "pilot_deck_V1.1.pptx").is_file())
        self.assertTrue((job_root / "RECEIPT" / "R0001.json").is_file())
        verified = module.verify_ppt_revision(
            "PILOT-PROJECT",
            "ART-PILOT-PPT-001",
            "R0001",
            revision["sha256"],
        )
        self.assertEqual(verified["verdict"], "PASS")
        self.assertEqual(verified["slide_titles"][2:], ["Slide 3 good", "Slide 4 corrected"])
        self.assertNotIn("Slide 4 wrong", verified["slide_titles"])
        self.assertEqual(verified["effect_count"], 0)
        mismatch = module.verify_ppt_revision(
            "PILOT-PROJECT",
            "ART-PILOT-PPT-001",
            "R0001",
            "0" * 64,
        )
        self.assertEqual(mismatch["verdict"], "HOLD")
        self.assertEqual(mismatch["failures"], ["SHA256_MISMATCH"])
        self.assertEqual(mismatch["effect_count"], 0)

        c1_readback = module.get_ppt_checkpoint_state(
            "PILOT-PROJECT", "ART-PILOT-PPT-001", "C0001"
        )
        self.assertEqual(c1_readback["slide_titles"][2:], ["Slide 3 good", "Baseline slide 4"])

    def test_checkpoint_is_create_only(self):
        module = load_module()
        module.initialize_synthetic_ppt("PILOT-PROJECT", "ART-PILOT-PPT-001", "JOB-0001")
        module.edit_slide_checkpoint(
            "PILOT-PROJECT", "ART-PILOT-PPT-001", "JOB-0001",
            "C0000", "C0001", 3, "Slide 3 good",
        )
        with self.assertRaisesRegex(FileExistsError, "checkpoint_exists"):
            module.edit_slide_checkpoint(
                "PILOT-PROJECT", "ART-PILOT-PPT-001", "JOB-0001",
                "C0000", "C0001", 3, "Overwrite attempt",
            )

    def test_invalid_refs_and_unknown_parent_fail_closed(self):
        module = load_module()
        with self.assertRaisesRegex(ValueError, "project_ref_invalid"):
            module.initialize_synthetic_ppt("../escape", "ART-PILOT-PPT-001", "JOB-0001")
        module.initialize_synthetic_ppt("PILOT-PROJECT", "ART-PILOT-PPT-001", "JOB-0001")
        with self.assertRaisesRegex(FileNotFoundError, "parent_checkpoint_missing"):
            module.edit_slide_checkpoint(
                "PILOT-PROJECT", "ART-PILOT-PPT-001", "JOB-0001",
                "C9999", "C0001", 3, "No parent",
            )

    def test_edit_and_finalize_require_the_original_job_binding(self):
        module = load_module()
        module.initialize_synthetic_ppt("PILOT-PROJECT", "ART-PILOT-PPT-001", "JOB-0001")
        with self.assertRaisesRegex(FileNotFoundError, "job_request_missing"):
            module.edit_slide_checkpoint(
                "PILOT-PROJECT", "ART-PILOT-PPT-001", "JOB-OTHER",
                "C0000", "C0001", 3, "Wrong job",
            )
        self.assertFalse(
            (
                Path(os.environ["PPT_JOB_ROOT"])
                / "PILOT-PROJECT"
                / "JOB-OTHER"
            ).exists()
        )


if __name__ == "__main__":
    unittest.main()
