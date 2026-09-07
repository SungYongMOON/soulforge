"""Public-safe regressions for source adaptation and known-string guards."""
import json
import unicodedata

import pytest

from soulforge_secure_work import extract, guard


@pytest.mark.parametrize("channel,term", [
    ("bound_values", "SYNTHETIC_금액_732641원"),
    ("source_names", "SYNTHETIC_원가자료"),
    ("source_refs", "src.synthetic.alpha"),
    ("bound_values", 'SYNTHETIC_"quoted"\nline'),
    ("bound_values", "SYNTHETIC_🚀"),
])
@pytest.mark.parametrize("as_key", [False, True])
def test_json_decoded_known_strings_are_checked(channel, term, as_key):
    # Escape ASCII too: ordinary ensure_ascii leaves ASCII refs literal.
    encoded = ''.join('\\u%04x' % ord(c) if ord(c) < 65536 else
                      json.dumps(c, ensure_ascii=True)[1:-1] for c in term)
    item = '{"' + encoded + '": "opaque"}' if as_key else '"' + encoded + '"'
    body = ('{"nested": [' + item + ']}').encode()
    kwargs = dict(source_refs=[], source_names=[], bound_values=[])
    kwargs[channel] = [term]
    codes = {f.code for f in guard.scan_released_bytes(body, **kwargs)}
    assert channel.upper().removesuffix("S") + "_IN_PACKET" in codes


def test_guard_normalization_paths_plain_text_and_opaque_control():
    value = "합성값"
    body = json.dumps({"note": unicodedata.normalize("NFD", value)}).encode()
    assert guard.scan_released_bytes(body, source_refs=[], source_names=[], bound_values=[value])
    path = "file:" + "/" * 3 + "synthetic/example"
    body = json.dumps({"note": path}).replace("/", r"\/").encode()
    assert "FILE_URI_IN_PACKET" in {f.code for f in guard.scan_released_bytes(
        body, source_refs=[], source_names=[], bound_values=[])}
    assert guard.scan_released_bytes(b"plain opaque text", source_refs=[], source_names=[], bound_values=[]) == []
    assert guard.scan_released_bytes(b'{"slots":["o_opaque"]}', source_refs=[],
                                     source_names=[], bound_values=[value]) == []


@pytest.mark.parametrize("body", [b'[' * 40 + b'0' + b']' * 40,
                                  b'{"x": "unterminated}', b'{"x":NaN}',
                                  b'{"x":0,"x":1}', b'"' + b'x' * (1024 * 1024) + b'"'],
                         ids=["depth", "malformed", "constant", "duplicate", "size"])
def test_json_scan_limits_fail_closed_without_echo(body):
    findings = guard.scan_released_bytes(body, source_refs=[], source_names=[], bound_values=[])
    assert findings
    assert all(f.where == "body" and f.code.startswith("RELEASE_SCAN_") for f in findings)


@pytest.mark.parametrize("text,status,section", [
    ("기능 이상 없음.", "FACT", "facts"),
    ("오류가 없다.", "FACT", "facts"),
    ("시험 결과 없음.", "UNKNOWN", "unknowns"),
    ("설정 없음.", "UNKNOWN", "unknowns"),
    ("측정값 미정.", "UNKNOWN", "unknowns"),
    ("결과는 없지만 제안한다.", "PROPOSAL", "unknowns"),
    ("변경 제안은 철회되었다.", "FACT", "facts"),
    ("변경 후보는 취소됐다.", "FACT", "facts"),
    ("변경 제안을 철회하자.", "PROPOSAL", "facts"),
    ("변경 제안은 철회되지 않았다.", "PROPOSAL", "facts"),
    ("시험 결과는 TBD.", "UNKNOWN", "unknowns"),
    ("시험 결과는 tbd.", "UNKNOWN", "unknowns"),
    ("TBDataset을 확인했다.", "FACT", "facts"),
])
def test_status_and_section_share_bounded_language_rules(text, status, section):
    assert extract.status_for(text) == status
    assert extract.section_for("synthetic", text) == section


@pytest.mark.parametrize("stem,expected", [
    ("04_change_request_beta", "changes"), ("06_change_request_alpha", "changes"),
    ("120_change_request", "changes"), ("change_request_revision", "changes"),
    ("04_change_requested", "facts"), ("archive_change_request", "facts"),
])
def test_change_request_filename_family(stem, expected):
    assert extract.section_for(stem, "상한 변경 제안.") == expected


def test_adaptation_keeps_source_bytes_and_spans(tmp_path):
    raw = "# 합성\r\n기능 이상 없음. 변경 제안은 철회되었다.\r\n시험 결과는 TBD.\r\n".encode()
    (tmp_path / "04_change_request_check.md").write_bytes(raw)
    pins, parts = extract.read_exact(tmp_path)
    assert pins[0]["sha256"] == extract.digest_bytes(raw)
    assert {p.status for p in parts} == {"FACT", "UNKNOWN"}
    assert all(p.section_ids == ("changes",) for p in parts)
    assert all(raw[p.span_start:p.span_end] == p.value.encode() for p in parts)
