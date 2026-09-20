"""Bounded DOCX body-text extractor for Context Engine source preparation.

One DOCX byte stream enters on stdin and one closed JSON result leaves on
stdout. The worker makes no files, network calls, model calls or source writes.
It accepts only body paragraphs and simple rectangular table cells; any content
carrier it cannot fully account for is an explicit refusal rather than a partial
document.
"""

import io
import json
import posixpath
import re
import sys
import unicodedata
import zipfile
from importlib import metadata
from xml.etree import ElementTree as ET

PROFILE = "python-docx-structure-v1"
ENGINE = "python-docx"
MAX_INPUT_BYTES = 16 * 1024 * 1024
MAX_OUTPUT_BYTES = 6 * 1024 * 1024
MAX_MEMBERS = 512
MAX_MEMBER_BYTES = 16 * 1024 * 1024
MAX_TOTAL_BYTES = 64 * 1024 * 1024
MAX_COMPRESSION_RATIO = 100
MAX_UNITS = 2000
MAX_UNIT_CHARACTERS = 20000
MAX_DOCUMENT_CHARACTERS = 400000

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships"
CONTENT_TYPES = "http://schemas.openxmlformats.org/package/2006/content-types"
MAIN_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"
W_TAG = lambda name: f"{{{W}}}{name}"
R_ID = f"{{{R}}}id"
W_VAL = f"{{{W}}}val"

ALLOWED_EXACT_MEMBERS = {
    "[Content_Types].xml", "_rels/.rels", "docProps/core.xml", "docProps/app.xml",
    "docProps/thumbnail.jpeg", "word/document.xml", "word/_rels/document.xml.rels",
    "word/styles.xml", "word/stylesWithEffects.xml", "word/settings.xml",
    "word/webSettings.xml", "word/fontTable.xml", "word/theme/theme1.xml",
    "word/numbering.xml",
}
ALLOWED_MEMBER_PATTERNS = (
    re.compile(r"customXml/item[0-9]+\.xml\Z"),
    re.compile(r"customXml/itemProps[0-9]+\.xml\Z"),
    re.compile(r"customXml/_rels/item[0-9]+\.xml\.rels\Z"),
)
ALLOWED_RELATIONSHIP_TYPES = {
    "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties",
    "http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail",
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties",
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument",
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles",
    "http://schemas.microsoft.com/office/2007/relationships/stylesWithEffects",
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings",
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/webSettings",
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable",
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme",
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml",
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXmlProps",
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering",
}
PARAGRAPH_CHILDREN = {"pPr", "r", "hyperlink", "bookmarkStart", "bookmarkEnd", "proofErr", "permStart", "permEnd"}
HYPERLINK_CHILDREN = {"r", "bookmarkStart", "bookmarkEnd", "proofErr"}
RUN_CHILDREN = {"rPr", "t", "tab", "br", "cr", "noBreakHyphen", "softHyphen", "lastRenderedPageBreak"}
UNSUPPORTED_TAG_CODES = {
    "sdt": "docx_sdt_unsupported", "customXml": "docx_custom_xml_wrapper_unsupported",
    "smartTag": "docx_smart_tag_unsupported", "AlternateContent": "docx_alternate_content_unsupported",
    "oMath": "docx_math_unsupported", "oMathPara": "docx_math_unsupported",
    "ruby": "docx_ruby_unsupported", "sym": "docx_symbol_unsupported",
    "drawing": "docx_drawing_unsupported", "pict": "docx_drawing_unsupported",
    "object": "docx_embedded_object_unsupported", "altChunk": "docx_alt_chunk_unsupported",
    "fldChar": "docx_field_unsupported", "instrText": "docx_field_unsupported",
    "ins": "docx_revision_unsupported", "del": "docx_revision_unsupported",
    "moveFrom": "docx_revision_unsupported", "moveTo": "docx_revision_unsupported",
    "pPrChange": "docx_revision_unsupported", "rPrChange": "docx_revision_unsupported",
    "tblPrChange": "docx_revision_unsupported", "trPrChange": "docx_revision_unsupported",
    "tcPrChange": "docx_revision_unsupported",
    "commentReference": "docx_comments_unsupported", "footnoteReference": "docx_footnote_unsupported",
    "endnoteReference": "docx_endnote_unsupported",
}


class Refusal(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.code = code


def refuse(code):
    raise Refusal(code)


def local(tag):
    return tag.rsplit("}", 1)[-1]


def on(value):
    if value is None:
        return True
    return str(value).strip().lower() not in ("0", "false", "off", "no")


def safe_member_name(name):
    if not isinstance(name, str) or not name or "\\" in name or "\x00" in name or name.startswith("/"):
        return False
    pieces = name[:-1].split("/") if name.endswith("/") else name.split("/")
    return all(piece not in ("", ".", "..") for piece in pieces)


def decode_xml(raw):
    try:
        if raw.startswith(b"\xef\xbb\xbf"):
            return raw.decode("utf-8-sig")
        if raw.startswith((b"\xff\xfe", b"\xfe\xff")):
            return raw.decode("utf-16")
        if raw[:4] == b"\x00<\x00?":
            return raw.decode("utf-16-be")
        if raw[:4] == b"<\x00?\x00":
            return raw.decode("utf-16-le")
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        refuse("docx_xml_encoding_unsupported")


def parse_xml(raw):
    text = decode_xml(raw)
    upper = text.upper()
    if "<!DOCTYPE" in upper or "<!ENTITY" in upper:
        refuse("docx_xml_directive_unsupported")
    try:
        return ET.fromstring(text)
    except ET.ParseError:
        refuse("docx_xml_invalid")


def allowed_member(name):
    if name in ALLOWED_EXACT_MEMBERS:
        return True
    return any(pattern.fullmatch(name) for pattern in ALLOWED_MEMBER_PATTERNS)


def package_members(data):
    if not data or len(data) > MAX_INPUT_BYTES:
        refuse("docx_input_bounds_exceeded")
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except (zipfile.BadZipFile, OSError):
        refuse("docx_unreadable")
    members = {}
    normalized = set()
    total = 0
    try:
        infos = archive.infolist()
        if not infos or len(infos) > MAX_MEMBERS:
            refuse("docx_zip_bounds_exceeded")
        for info in infos:
            name = info.filename
            folded = unicodedata.normalize("NFC", name).casefold()
            if not safe_member_name(name) or folded in normalized:
                refuse("docx_zip_member_unsafe")
            normalized.add(folded)
            if info.flag_bits & 1:
                refuse("docx_zip_encrypted_unsupported")
            if info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
                refuse("docx_zip_compression_unsupported")
            if info.is_dir():
                continue
            if not allowed_member(name):
                feature_code = (
                    "docx_drawing_unsupported" if name.startswith("word/media/")
                    else "docx_headers_footers_unsupported" if re.fullmatch(r"word/(?:header|footer)[0-9]+\.xml", name)
                    else "docx_comments_unsupported" if "comments" in name
                    else "docx_footnote_unsupported" if "footnote" in name
                    else "docx_endnote_unsupported" if "endnote" in name
                    else "docx_embedded_object_unsupported" if name.startswith(("word/embeddings/", "word/vbaProject"))
                    else "docx_package_member_unsupported"
                )
                refuse(feature_code)
            if info.file_size > MAX_MEMBER_BYTES or total + info.file_size > MAX_TOTAL_BYTES:
                refuse("docx_zip_bounds_exceeded")
            if info.file_size > 0 and (info.compress_size <= 0
                                      or info.file_size / info.compress_size > MAX_COMPRESSION_RATIO):
                refuse("docx_zip_bounds_exceeded")
            try:
                with archive.open(info) as handle:
                    chunks, size = [], 0
                    while True:
                        chunk = handle.read(1024 * 1024)
                        if not chunk:
                            break
                        size += len(chunk)
                        if size > MAX_MEMBER_BYTES or total + size > MAX_TOTAL_BYTES:
                            refuse("docx_zip_bounds_exceeded")
                        chunks.append(chunk)
                raw = b"".join(chunks)
            except (zipfile.BadZipFile, RuntimeError, OSError):
                refuse("docx_zip_corrupt")
            if len(raw) != info.file_size:
                refuse("docx_zip_corrupt")
            total += len(raw)
            members[name] = raw
    finally:
        archive.close()
    required = {"[Content_Types].xml", "_rels/.rels", "word/document.xml"}
    if not required.issubset(members):
        refuse("docx_package_invalid")
    for name, raw in members.items():
        if name.endswith((".xml", ".rels")):
            parse_xml(raw)
    return members


def relationship_source(name):
    if name == "_rels/.rels":
        return ""
    match = re.fullmatch(r"(.*/)?_rels/([^/]+)\.rels", name)
    if not match:
        refuse("docx_relationship_invalid")
    return f"{match.group(1) or ''}{match.group(2)}"


def validate_relationships(members):
    office_targets = []
    for name, raw in members.items():
        if not name.endswith(".rels"):
            continue
        root = parse_xml(raw)
        if root.tag != f"{{{PKG_REL}}}Relationships":
            refuse("docx_relationship_invalid")
        source = relationship_source(name)
        base = posixpath.dirname(source)
        ids = set()
        for relation in list(root):
            if relation.tag != f"{{{PKG_REL}}}Relationship":
                refuse("docx_relationship_invalid")
            rel_id, rel_type, target = relation.get("Id"), relation.get("Type"), relation.get("Target")
            if not rel_id or rel_id in ids or rel_type not in ALLOWED_RELATIONSHIP_TYPES or not target:
                refuse("docx_relationship_unsupported")
            ids.add(rel_id)
            if relation.get("TargetMode") is not None:
                refuse("docx_external_relationship_unsupported")
            if any(mark in target for mark in ("\\", "\x00", "?", "#", "%")) or ":" in target:
                refuse("docx_relationship_invalid")
            resolved = posixpath.normpath(posixpath.join(base, target.lstrip("/")))
            if resolved == ".." or resolved.startswith("../") or resolved not in members:
                refuse("docx_relationship_invalid")
            if rel_type.endswith("/officeDocument"):
                office_targets.append(resolved)
    if office_targets != ["word/document.xml"]:
        refuse("docx_main_document_invalid")


def validate_content_types(members):
    root = parse_xml(members["[Content_Types].xml"])
    if root.tag != f"{{{CONTENT_TYPES}}}Types":
        refuse("docx_content_types_invalid")
    main = []
    for child in list(root):
        if child.tag not in (f"{{{CONTENT_TYPES}}}Default", f"{{{CONTENT_TYPES}}}Override"):
            refuse("docx_content_types_invalid")
        if child.get("PartName") == "/word/document.xml":
            main.append(child.get("ContentType"))
    if main != [MAIN_CONTENT_TYPE]:
        refuse("docx_main_document_invalid")


HIDDEN_PROPERTIES = ("vanish", "webHidden", "specVanish")


def hidden_values(properties):
    values = {name: None for name in HIDDEN_PROPERTIES}
    if properties is None:
        return values
    for name in HIDDEN_PROPERTIES:
        node = properties.find(W_TAG(name))
        if node is not None:
            values[name] = on(node.get(W_VAL))
    return values


def apply_hidden(current, update):
    return {name: current[name] if update[name] is None else update[name] for name in HIDDEN_PROPERTIES}


def num_id(properties):
    if properties is None:
        return None
    node = properties.find(f"{W_TAG('numPr')}/{W_TAG('numId')}")
    if node is None:
        return None
    value = node.get(W_VAL)
    return 0 if value == "0" else value or "present"


def style_id(properties, name):
    if properties is None:
        return None
    node = properties.find(W_TAG(name))
    return node.get(W_VAL) if node is not None else None


def style_state(members):
    raw = members.get("word/styles.xml")
    if raw is None:
        return {"styles": {}, "defaults": {"hidden": {name: False for name in HIDDEN_PROPERTIES},
                                             "numbering": None}, "paragraph_default": None}
    root = parse_xml(raw)
    if root.tag != W_TAG("styles"):
        refuse("docx_styles_invalid")
    defaults = {"hidden": {name: False for name in HIDDEN_PROPERTIES}, "numbering": None}
    doc_defaults = root.find(W_TAG("docDefaults"))
    if doc_defaults is not None:
        rpr = doc_defaults.find(f"{W_TAG('rPrDefault')}/{W_TAG('rPr')}")
        ppr = doc_defaults.find(f"{W_TAG('pPrDefault')}/{W_TAG('pPr')}")
        defaults = {"hidden": {name: bool(value) for name, value in hidden_values(rpr).items()},
                    "numbering": num_id(ppr)}
    styles, paragraph_default = {}, None
    for node in root.findall(W_TAG("style")):
        sid, kind = node.get(W_TAG("styleId")), node.get(W_TAG("type"))
        if not sid or sid in styles:
            refuse("docx_styles_invalid")
        based = node.find(W_TAG("basedOn"))
        row = {"kind": kind, "based": based.get(W_VAL) if based is not None else None,
               "hidden": hidden_values(node.find(W_TAG("rPr"))),
               "numbering": num_id(node.find(W_TAG("pPr")))}
        styles[sid] = row
        default_value = node.get(W_TAG("default"))
        if kind == "paragraph" and default_value is not None and on(default_value) and paragraph_default is None:
            paragraph_default = sid
    return {"styles": styles, "defaults": defaults, "paragraph_default": paragraph_default}


def style_chain(state, sid, kind):
    if sid is None:
        return []
    chain, seen = [], set()
    while sid is not None:
        if sid in seen or len(chain) > 64:
            refuse("docx_styles_invalid")
        seen.add(sid)
        row = state["styles"].get(sid)
        if row is None or row["kind"] != kind:
            refuse("docx_styles_invalid")
        chain.append(row)
        sid = row["based"]
    chain.reverse()
    return chain


def paragraph_policy(paragraph, state):
    ppr = paragraph.find(W_TAG("pPr"))
    paragraph_sid = style_id(ppr, "pStyle") or state["paragraph_default"]
    hidden = dict(state["defaults"]["hidden"])
    numbering = state["defaults"]["numbering"]
    for row in style_chain(state, paragraph_sid, "paragraph"):
        hidden = apply_hidden(hidden, row["hidden"])
        if row["numbering"] is not None:
            numbering = row["numbering"]
    direct_numbering = num_id(ppr)
    if direct_numbering is not None:
        numbering = direct_numbering
    if numbering not in (None, 0):
        refuse("docx_numbering_unsupported")
    for run in paragraph.findall(f".//{W_TAG('r')}"):
        rpr = run.find(W_TAG("rPr"))
        run_hidden = dict(hidden)
        for row in style_chain(state, style_id(rpr, "rStyle"), "character"):
            run_hidden = apply_hidden(run_hidden, row["hidden"])
        run_hidden = apply_hidden(run_hidden, hidden_values(rpr))
        if any(run_hidden.values()):
            refuse("docx_hidden_text_unsupported")


def reject_tag(element):
    code = UNSUPPORTED_TAG_CODES.get(local(element.tag))
    if code:
        refuse(code)


def validate_run(run):
    for child in list(run):
        reject_tag(child)
        if local(child.tag) not in RUN_CHILDREN:
            refuse("docx_structure_unsupported")
        if local(child.tag) not in ("rPr",) and list(child):
            refuse("docx_structure_unsupported")


def validate_paragraph(paragraph, state):
    for child in list(paragraph):
        reject_tag(child)
        name = local(child.tag)
        if name not in PARAGRAPH_CHILDREN:
            refuse("docx_structure_unsupported")
        if name == "r":
            validate_run(child)
        elif name == "hyperlink":
            for nested in list(child):
                reject_tag(nested)
                if local(nested.tag) not in HYPERLINK_CHILDREN:
                    refuse("docx_structure_unsupported")
                if local(nested.tag) == "r":
                    validate_run(nested)
        elif name not in ("pPr",) and list(child):
            refuse("docx_structure_unsupported")
    paragraph_policy(paragraph, state)


def validate_table(table, state):
    grid = table.find(W_TAG("tblGrid"))
    columns = len(grid.findall(W_TAG("gridCol"))) if grid is not None else 0
    rows = table.findall(W_TAG("tr"))
    if columns < 1 or not rows:
        refuse("docx_table_structure_unsupported")
    for child in list(table):
        reject_tag(child)
        if local(child.tag) not in ("tblPr", "tblGrid", "tr"):
            refuse("docx_structure_unsupported")
    for row in rows:
        cells = row.findall(W_TAG("tc"))
        if len(cells) != columns:
            refuse("docx_table_merge_unsupported")
        trpr = row.find(W_TAG("trPr"))
        if trpr is not None and (trpr.find(W_TAG("gridBefore")) is not None or trpr.find(W_TAG("gridAfter")) is not None):
            refuse("docx_table_merge_unsupported")
        for child in list(row):
            reject_tag(child)
            if local(child.tag) not in ("trPr", "tc"):
                refuse("docx_structure_unsupported")
        for cell in cells:
            tcpr = cell.find(W_TAG("tcPr"))
            if tcpr is not None and (tcpr.find(W_TAG("gridSpan")) is not None
                                     or tcpr.find(W_TAG("vMerge")) is not None
                                     or tcpr.find(W_TAG("hMerge")) is not None):
                refuse("docx_table_merge_unsupported")
            paragraphs = cell.findall(W_TAG("p"))
            if not paragraphs:
                refuse("docx_table_structure_unsupported")
            for child in list(cell):
                reject_tag(child)
                if local(child.tag) not in ("tcPr", "p"):
                    refuse("docx_table_nested_content_unsupported")
            for paragraph in paragraphs:
                validate_paragraph(paragraph, state)
    return len(rows), columns


def validate_document_structure(members):
    root = parse_xml(members["word/document.xml"])
    if root.tag != W_TAG("document"):
        refuse("docx_main_document_invalid")
    if any(local(child.tag) != "body" for child in list(root)) or len(list(root)) != 1:
        refuse("docx_structure_unsupported")
    body = root.find(W_TAG("body"))
    for node in body.iter():
        reject_tag(node)
        if not node.tag.startswith(f"{{{W}}}"):
            refuse("docx_structure_unsupported")
    state = style_state(members)
    shape, seen_section = [], False
    paragraph_index = table_index = 0
    for block_index, child in enumerate(list(body), start=1):
        reject_tag(child)
        name = local(child.tag)
        if seen_section:
            refuse("docx_structure_unsupported")
        if name == "sectPr":
            seen_section = True
            if any(local(node.tag) in ("headerReference", "footerReference", "footnotePr", "endnotePr")
                   for node in child.iter()):
                refuse("docx_headers_footers_unsupported")
            continue
        if name == "p":
            paragraph_index += 1
            validate_paragraph(child, state)
            shape.append({"kind": "paragraph", "block_index": block_index, "paragraph_index": paragraph_index})
        elif name == "tbl":
            table_index += 1
            rows, columns = validate_table(child, state)
            shape.append({"kind": "table", "block_index": block_index, "table_index": table_index,
                          "row_count": rows, "column_count": columns})
        else:
            refuse("docx_structure_unsupported")
    return shape


def extract(data, shape):
    try:
        from docx import Document
        from docx.table import Table
        from docx.text.paragraph import Paragraph
    except ImportError:
        refuse("docx_parser_unavailable")
    try:
        version = metadata.version("python-docx")
        document = Document(io.BytesIO(data))
    except Exception:
        refuse("docx_unreadable")
    blocks, unit_count, character_count = [], 0, 0
    content = list(document.iter_inner_content())
    if len(content) != len(shape):
        refuse("docx_structure_mismatch")
    for expected, block in zip(shape, content):
        if expected["kind"] == "paragraph" and isinstance(block, Paragraph):
            text = block.text
            row = {**expected, "text": text}
            texts = [text]
        elif expected["kind"] == "table" and isinstance(block, Table):
            if len(block.rows) != expected["row_count"] or any(len(row.cells) != expected["column_count"] for row in block.rows):
                refuse("docx_structure_mismatch")
            cells = [{"row_number": row_index + 1, "column_number": column_index + 1, "text": cell.text}
                     for row_index, row in enumerate(block.rows)
                     for column_index, cell in enumerate(row.cells)]
            row = {**expected, "cells": cells}
            texts = [cell["text"] for cell in cells]
        else:
            refuse("docx_structure_mismatch")
        for text in texts:
            if not isinstance(text, str) or len(text) > MAX_UNIT_CHARACTERS:
                refuse("docx_preparation_unit_limit_exceeded")
            if text.strip():
                unit_count += 1
                character_count += len(text.strip())
                if unit_count > MAX_UNITS or character_count > MAX_DOCUMENT_CHARACTERS:
                    refuse("docx_preparation_document_limit_exceeded")
        blocks.append(row)
    if unit_count == 0:
        refuse("docx_content_unavailable")
    return {"status": "extracted", "engine": ENGINE, "profile": PROFILE, "engine_version": version,
            "block_count": len(blocks), "unit_count": unit_count, "character_count": character_count,
            "blocks": blocks}


def main():
    if sys.argv[1:] != [PROFILE]:
        refuse("docx_profile_invalid")
    data = sys.stdin.buffer.read(MAX_INPUT_BYTES + 1)
    members = package_members(data)
    validate_content_types(members)
    validate_relationships(members)
    shape = validate_document_structure(members)
    return extract(data, shape)


try:
    result = main()
except Refusal as error:
    result = {"status": "refused", "code": error.code}
except Exception:
    result = {"status": "refused", "code": "docx_worker_failed"}
encoded = json.dumps(result, ensure_ascii=True, separators=(",", ":")).encode("ascii")
if len(encoded) > MAX_OUTPUT_BYTES:
    encoded = b'{"status":"refused","code":"docx_worker_output_exceeded"}'
sys.stdout.buffer.write(encoded)
sys.stdout.buffer.flush()
