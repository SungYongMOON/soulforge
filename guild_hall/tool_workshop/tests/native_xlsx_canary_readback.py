"""Optional independent XLSX canary readback; use an installed/bundled openpyxl.

No desktop application, network, source authoring or acceptance operation occurs.
Only metadata is printed. This script does not modify the workbook.
"""
import argparse
import hashlib
import json
import pathlib
import re
import zipfile

import openpyxl


def verify(root):
    receipt = json.loads((root / "candidate-receipt.json").read_text(encoding="utf-8"))["receipt"]
    artifact = receipt["artifact"]
    digest = artifact["sha256"]
    input_digest = receipt["input_bundle_manifest_digest"]
    assert re.fullmatch(r"[0-9a-f]{64}", digest)
    assert re.fullmatch(r"[0-9a-f]{64}", input_digest)
    workbook_path = root / "outputRoot" / f"{digest}.xlsx"
    input_path = root / "inputRoot" / f"{input_digest}.json"
    input_bytes = input_path.read_bytes()
    assert hashlib.sha256(input_bytes).hexdigest() == input_digest
    source = json.loads(input_bytes)
    actual_bytes = workbook_path.read_bytes()
    assert hashlib.sha256(actual_bytes).hexdigest() == digest
    assert len(actual_bytes) == artifact["size_bytes"]
    with zipfile.ZipFile(workbook_path) as archive:
        assert archive.testzip() is None
        assert set(archive.namelist()) == {
            "[Content_Types].xml", "_rels/.rels", "xl/workbook.xml",
            "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/worksheets/sheet1.xml",
        }
    workbook = openpyxl.load_workbook(workbook_path, data_only=False)
    assert len(workbook.worksheets) == 1
    sheet = workbook.active
    assert sheet.sheet_state == "visible"
    actual = list(sheet.values)
    expected = [tuple(source["columns"])] + [
        tuple(row[column] for column in source["columns"]) for row in source["rows"]
    ]
    assert actual == expected
    # Python equates False and 0; verify each cell's native type separately.
    assert all(type(got) is type(want) for row, expected_row in zip(actual, expected)
               for got, want in zip(row, expected_row))
    assert not any(cell.data_type == "f" or cell.hyperlink for row in sheet for cell in row)
    assert receipt["claim"] == "workshop_output_candidate_only"
    return {
        "engine": "openpyxl", "version": openpyxl.__version__,
        "native_readback": "pass", "rows_including_header": len(actual),
        "columns": len(actual[0]), "sha256": digest, "size_bytes": len(actual_bytes),
        "formulas": 0, "external_links": 0, "hidden_sheets": 0,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=pathlib.Path, required=True)
    options = parser.parse_args()
    print(json.dumps(verify(options.root)))
