"""Bounded admission and reuse of canonical HWPX validators; never an author."""
import contextlib
import hashlib
import importlib.util
import io
import json
import os
import pathlib
import re
import stat
import sys
import zipfile

sys.dont_write_bytecode = True
MAX_ZIP = 32 * 1024 * 1024
MAX_EXPANDED = 64 * 1024 * 1024
MAX_PART = 16 * 1024 * 1024
SECTION = re.compile(r"Contents/section(0|[1-9][0-9]*)\.xml\Z")
DIGEST = re.compile(r"[a-f0-9]{64}\Z")
HP = "http://www.hancom.co.kr/hwpml/2011/paragraph"
HS = "http://www.hancom.co.kr/hwpml/2011/section"
RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#"
STATIC_PARTS = {
    "mimetype", "Contents/content.hpf", "Contents/header.xml", "settings.xml",
    "version.xml", "META-INF/container.xml", "META-INF/manifest.xml",
    "META-INF/container.rdf", "Preview/PrvText.txt", "Preview/PrvImage.png",
}


class Blocked(Exception):
    pass


def check(condition, code):
    if not condition:
        raise Blocked(code)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def direct(value, directory=False):
    p = pathlib.Path(value)
    check(p.is_absolute() and not str(p).startswith(("\\\\", "//")), "path_invalid")
    check(not re.search(r"[\x00-\x1f]", str(p)) and ":" not in str(p)[len(p.drive):], "path_invalid")
    check(not any(part in ("..", ".") or part.endswith((" ", ".")) for part in p.parts), "path_invalid")
    check(os.path.normcase(str(p.resolve(strict=True))) == os.path.normcase(str(p)), "path_invalid")
    for part in [p, *p.parents]:
        meta = part.lstat()
        check(not stat.S_ISLNK(meta.st_mode) and not getattr(meta, "st_file_attributes", 0) & 0x400, "path_link_forbidden")
    meta = p.stat()
    check(stat.S_ISDIR(meta.st_mode) if directory else stat.S_ISREG(meta.st_mode) and meta.st_nlink == 1, "path_type_invalid")
    return p


def bounded_read(file, limit):
    file = direct(file)
    before = file.stat()
    check(0 < before.st_size <= limit, "size_limit")
    with file.open("rb") as stream:
        data = stream.read(limit + 1)
    after = file.stat()
    check(len(data) == before.st_size and (before.st_dev, before.st_ino, before.st_mtime_ns, before.st_size) == (after.st_dev, after.st_ino, after.st_mtime_ns, after.st_size), "input_changed")
    return data


def request_object(pairs):
    result = {}
    for key, value in pairs:
        check(key not in result, "request_invalid")
        result[key] = value
    return result


def admission(raw, etree):
    check(raw.startswith(b"PK\x03\x04") and raw[-22:-18] == b"PK\x05\x06", "zip_invalid")
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        entries = archive.infolist()
        names = [entry.filename for entry in entries]
        check(0 < len(entries) <= 512 and len({name.casefold() for name in names}) == len(names), "zip_members_invalid")
        check(not archive.comment and sum(entry.file_size for entry in entries) <= MAX_EXPANDED, "zip_limit")
        for entry in entries:
            name = entry.filename
            check(not entry.is_dir() and not name.startswith("/") and "\\" not in name and ":" not in name and all(part not in ("", ".", "..") for part in name.split("/")), "zip_path_invalid")
            check(not re.search(r"[\x00-\x1f\x7f]", name), "zip_path_invalid")
            check(stat.S_IFMT(entry.external_attr >> 16) in (0, stat.S_IFREG), "zip_link_forbidden")
            check(not entry.flag_bits & 1 and entry.compress_type in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED), "zip_format_invalid")
            check(entry.file_size <= MAX_PART and entry.compress_size <= MAX_ZIP and entry.file_size <= max(1, entry.compress_size) * 200, "zip_limit")
            check(name in STATIC_PARTS or SECTION.fullmatch(name) or re.fullmatch(r"Contents/masterPage[0-9]+\.xml", name) or re.fullmatch(r"BinData/[A-Za-z0-9_.-]+\.(?:png|jpe?g|gif|bmp)", name, re.I), "active_part_forbidden")
        # All decompression happens after entry/ratio/aggregate bounds, without
        # extracting archive paths. ZipFile.read also checks local names and CRC.
        parts = {name: archive.read(name) for name in names}
    roots = {}
    parser = etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False, huge_tree=False)
    for name, data in parts.items():
        if not name.endswith((".xml", ".hpf", ".rdf")):
            continue
        # UTF-8 is the bounded profile; rejecting NUL also excludes UTF-16 DTD
        # spellings before the canonical scripts use their default XML parser.
        check(b"\0" not in data, "xml_unsafe")
        text = data.decode("utf-8-sig")
        check(not re.search(r"<!DOCTYPE|<!ENTITY|<\?(?!xml\s)", text, re.I), "xml_unsafe")
        root = etree.fromstring(data, parser)
        check(not root.getroottree().docinfo.doctype and not root.xpath("//processing-instruction()"), "xml_unsafe")
        roots[name] = root
        for node in root.iter():
            if not isinstance(node.tag, str):
                continue
            local = etree.QName(node).localname.lower()
            check(etree.QName(node).namespace != "http://www.w3.org/2001/XInclude" and local not in {"script", "ole", "oleobject", "object", "embed", "iframe", "video", "audio"}, "active_part_forbidden")
            for key, value in node.attrib.items():
                attr = etree.QName(key).localname.lower()
                check(not attr.startswith("on") and not (local == "fieldbegin" and attr == "type" and value.upper() in {"HYPERLINK", "DDE"}), "active_part_forbidden")
                # These values are vocabulary identifiers, not fetch locations.
                if attr == "required-namespace" and value in {"http://www.hancom.co.kr/hwpml/2016/HwpUnitChar", "http://www.hancom.co.kr/hwpml/2016/paragraph"}:
                    continue
                if node.tag == f"{{{RDF}}}type" and key == f"{{{RDF}}}resource" and value in {"http://www.hancom.co.kr/hwpml/2016/meta/pkg#" + kind for kind in ("HeaderFile", "SectionFile", "Document")}:
                    continue
                check("\\" not in value and not re.search(r"(?:https?|file|ftp|data|javascript|vbscript|smb|mailto):|(?:^|/)\.\.(?:/|$)", value, re.I), "external_reference")
                if attr in {"href", "full-path", "src", "target", "resource", "about"} and value:
                    check(value in parts or value.startswith("#") and len(value) > 1, "external_reference")
    sections = sorted((name for name in names if SECTION.fullmatch(name)), key=lambda name: int(SECTION.fullmatch(name)[1]))
    check(0 < len(sections) <= 64 and sections == [f"Contents/section{i}.xml" for i in range(len(sections))], "section_membership_invalid")
    check(all(roots[name].tag == f"{{{HS}}}sec" for name in sections), "section_invalid")
    return parts, roots, sections


def load_canonical(file, name):
    direct(file)
    spec = importlib.util.spec_from_file_location(name, file)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def section_metrics(page_guard, parts, section, destination):
    # The existing collector reads section0 only. Feed each admitted section to
    # that same function through a create-only, run-owned miniature container.
    with zipfile.ZipFile(destination, "x", compression=zipfile.ZIP_STORED) as archive:
        archive.writestr("Contents/section0.xml", parts[section])
    return page_guard.collect_metrics(destination)


def verify(request_path, scripts_root, run_root, etree):
    run_root = direct(run_root, True)
    scripts_root = direct(scripts_root, True)
    request_path = direct(request_path)
    check(request_path.parent == run_root and request_path.suffix == ".json", "request_path_invalid")
    request_bytes = bounded_read(request_path, 2 * 1024 * 1024)
    request = json.loads(request_bytes, object_pairs_hook=request_object)
    check(isinstance(request, dict) and set(request) == {"reference_sha256", "candidate_sha256", "allowed_parts", "expected_text"}, "request_invalid")
    check(all(isinstance(request[key], str) and DIGEST.fullmatch(request[key]) for key in ("reference_sha256", "candidate_sha256")), "request_invalid")
    allowed, expected = request["allowed_parts"], request["expected_text"]
    check(isinstance(allowed, list) and 0 < len(allowed) <= 64 and all(isinstance(name, str) and SECTION.fullmatch(name) for name in allowed) and len(set(allowed)) == len(allowed), "allowed_parts_invalid")
    check(isinstance(expected, list) and len(expected) <= 20000 and all(isinstance(text, str) and len(text) <= 65536 for text in expected) and sum(len(text) for text in expected) <= 1024 * 1024, "expected_text_invalid")
    reference, candidate = run_root / "reference.hwpx", run_root / "candidate.hwpx"
    before_bytes, after_bytes = bounded_read(reference, MAX_ZIP), bounded_read(candidate, MAX_ZIP)
    check(digest(before_bytes) == request["reference_sha256"] and digest(after_bytes) == request["candidate_sha256"], "hash_mismatch")
    before, before_roots, sections = admission(before_bytes, etree)
    after, after_roots, out_sections = admission(after_bytes, etree)
    check(set(before) == set(after) and sections == out_sections, "section_membership_invalid")
    check(set(allowed) <= set(sections), "allowed_parts_invalid")
    check(all(before[name] == after[name] for name in before if name not in allowed), "immutable_part_changed")
    actual = ["".join(node.itertext()) for section in sections for node in after_roots[section].iter(f"{{{HP}}}t")]
    check(actual == expected, "text_readback_mismatch")
    validator = load_canonical(scripts_root / "validate.py", "_hwpx_reference_validate")
    page_guard = load_canonical(scripts_root / "page_guard.py", "_hwpx_reference_page_guard")
    check(validator.validate(str(reference)) == [] and validator.validate(str(candidate)) == [], "canonical_validation_failed")
    metrics_root = run_root / "reference-metrics"
    metrics_root.mkdir()  # create-only; an existing attempt is never overwritten
    for index, section in enumerate(sections):
        ref_metrics = section_metrics(page_guard, before, section, metrics_root / f"reference-{index}.hwpx")
        out_metrics = section_metrics(page_guard, after, section, metrics_root / f"candidate-{index}.hwpx")
        check(page_guard.compare_metrics(ref_metrics, out_metrics, 0.15, 0.25) == [], "page_guard_failed")
    check(bounded_read(reference, MAX_ZIP) == before_bytes and bounded_read(candidate, MAX_ZIP) == after_bytes and bounded_read(request_path, 2 * 1024 * 1024) == request_bytes, "input_changed")
    changed = sum(before[name] != after[name] for name in sections)
    preview = any(name.startswith("Preview/") for name in after)
    return {
        "ok": True, "reference_sha256": request["reference_sha256"],
        "candidate_sha256": request["candidate_sha256"], "candidate_size_bytes": len(after_bytes),
        "section_count": len(sections), "changed_section_count": changed,
        "text_node_count": len(actual), "canonical_validation": "passed",
        "page_guard": "passed_all_sections", "page_count_verified": False,
        "preview_status": "preview_stale" if preview and changed else "present_unverified" if preview else "absent",
        "render_required": True, "validation_level": "structural_reference_only",
    }


def main():
    check(len(sys.argv) == 5 and sys.argv[1] == "verify", "arguments_invalid")
    try:
        from lxml import etree
    except ImportError:
        raise Blocked("lxml_unavailable") from None
    # Canonical functions are trusted, but their diagnostic text is never part
    # of the child wire contract. Only the bounded metadata receipt is emitted.
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        result = verify(*sys.argv[2:], etree)
    print(json.dumps(result, separators=(",", ":")))


if __name__ == "__main__":
    try:
        main()
    except Blocked as error:
        print(json.dumps({"ok": False, "code": str(error)}, separators=(",", ":")))
        sys.exit(1)
    except Exception:
        print('{"ok":false,"code":"reference_verification_failed"}')
        sys.exit(1)
