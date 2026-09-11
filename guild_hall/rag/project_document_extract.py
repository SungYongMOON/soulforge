"""Soulforge project document extraction unit.

Reads one pdf byte stream from standard input and answers with one bounded json
document on standard output. The bytes stay in memory, no file system and no
network are touched, no input is echoed back, and anything that cannot be read
becomes one stable structured unreadable marker.
"""

import json
import io
import sys

# The engine binds its message and log destinations to the current standard
# output stream while it loads, so the real stream is held aside first and the
# module level stream is pointed at the diagnostic channel.
_STDOUT = sys.stdout
sys.stdout = sys.stderr

MAX_INPUT_BYTES = 16 * 1024 * 1024
MAX_PAGES = 2048
MAX_PAGE_CHARACTERS = 512 * 1024
# Aggregate caps bound the held text before it is serialized. The character cap
# times the widest json escape stays inside the serialized output cap below.
MAX_TEXT_CHARACTERS = 1024 * 1024
MAX_TEXT_BYTES = 2 * 1024 * 1024
MAX_OUTPUT_BYTES = 6 * 1024 * 1024
ENGINE = "pymupdf"
TABLE_PROFILE = "pdfplumber-tables-v1"
MAX_LOCATION_ITEMS = 100000
UNREADABLE = {"status": "unreadable"}


def emit(document):
    encoded = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if len(encoded) > MAX_OUTPUT_BYTES:
        encoded = json.dumps(UNREADABLE, separators=(",", ":")).encode("utf-8")
    _STDOUT.buffer.write(encoded)
    _STDOUT.buffer.flush()


def extract(data):
    import fitz

    document = fitz.open(stream=data, filetype="pdf")
    try:
        if document.needs_pass:
            return None
        page_count = document.page_count
        if page_count < 1 or page_count > MAX_PAGES:
            return None
        pages = []
        total_characters = 0
        total_bytes = 0
        for index in range(page_count):
            text = document.load_page(index).get_text()
            if not isinstance(text, str) or len(text) > MAX_PAGE_CHARACTERS:
                return None
            total_characters += len(text)
            if total_characters > MAX_TEXT_CHARACTERS:
                return None
            total_bytes += len(text.encode("utf-8"))
            if total_bytes > MAX_TEXT_BYTES:
                return None
            pages.append({"page_number": index + 1, "text": text})
        return {
            "status": "extracted",
            "engine": ENGINE,
            "page_count": page_count,
            "pages": pages,
        }
    finally:
        document.close()


def box(values):
    return [round(float(value), 6) for value in values]


def union_box(boxes):
    return [min(item[0] for item in boxes), min(item[1] for item in boxes),
            max(item[2] for item in boxes), max(item[3] for item in boxes)]


def body_paragraphs(words, tables):
    # Ruled-table words belong to cells, not body paragraphs. Paragraph grouping
    # is a deterministic line-gap heuristic, not document semantic authority.
    body = [word for word in words if not any(
        table["bbox"][0] <= (word["bbox"][0] + word["bbox"][2]) / 2 <= table["bbox"][2]
        and table["bbox"][1] <= (word["bbox"][1] + word["bbox"][3]) / 2 <= table["bbox"][3]
        for table in tables)]
    lines = []
    for word in sorted(body, key=lambda item: (item["bbox"][1], item["bbox"][0])):
        if not lines or abs(word["bbox"][1] - lines[-1][0]["bbox"][1]) > 3:
            lines.append([])
        lines[-1].append(word)
    groups = []
    last_box = None
    for line in lines:
        line.sort(key=lambda item: item["bbox"][0])
        bounds = union_box([word["bbox"] for word in line])
        if last_box is None or bounds[1] - last_box[1] > max(3, last_box[3] - last_box[1]) * 1.6:
            groups.append([])
        groups[-1].extend(line)
        last_box = bounds
    return [{"paragraph_number": index + 1, "text": " ".join(word["text"] for word in group),
             "bbox": union_box([word["bbox"] for word in group])}
            for index, group in enumerate(groups)]


def extract_tables(data):
    import pdfplumber

    with pdfplumber.open(io.BytesIO(data)) as document:
        page_count = len(document.pages)
        if page_count < 1 or page_count > MAX_PAGES:
            return None
        pages = []
        total_characters = total_bytes = total_output = 0
        for index, page in enumerate(document.pages):
            if len(page.chars) > MAX_LOCATION_ITEMS:
                return None
            text = page.extract_text() or ""
            total_characters += len(text)
            total_bytes += len(text.encode("utf-8"))
            if len(text) > MAX_PAGE_CHARACTERS or total_characters > MAX_TEXT_CHARACTERS or total_bytes > MAX_TEXT_BYTES:
                return None
            words = [{"word_number": number + 1, "text": word["text"],
                      "bbox": box([word["x0"], word["top"], word["x1"], word["bottom"]])}
                     for number, word in enumerate(page.extract_words())]
            tables = []
            item_count = len(words)
            for number, table in enumerate(page.find_tables({
                    "vertical_strategy": "lines", "horizontal_strategy": "lines"})):
                rows = table.rows
                values = table.extract()
                column_count = len(table.columns)
                item_count += 1 + len(rows) * column_count + len(rows) + column_count
                if item_count > MAX_LOCATION_ITEMS:
                    return None
                cells = []
                for row_number, row in enumerate(rows):
                    if len(row.cells) != column_count:
                        return None
                    for column_number, bounds in enumerate(row.cells):
                        cells.append({"row_number": row_number + 1, "column_number": column_number + 1,
                                      "text": values[row_number][column_number] if bounds is not None else None,
                                      "bbox": box(bounds) if bounds is not None else None})
                tables.append({"table_number": number + 1, "bbox": box(table.bbox),
                               "row_count": len(rows), "column_count": column_count,
                               "rows": [{"row_number": i + 1, "bbox": box(row.bbox)} for i, row in enumerate(rows)],
                               "columns": [{"column_number": i + 1, "bbox": box(column.bbox)}
                                           for i, column in enumerate(table.columns)], "cells": cells})
            paragraphs = body_paragraphs(words, tables)
            if item_count + len(paragraphs) > MAX_LOCATION_ITEMS:
                return None
            result = {"page_number": index + 1, "text": text,
                      "width": round(float(page.width), 6), "height": round(float(page.height), 6),
                      "coordinate_system": "top-left-points", "paragraphs": paragraphs,
                      "words": words, "tables": tables}
            total_output += len(json.dumps(result, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
            if total_output > MAX_OUTPUT_BYTES - 1024 - MAX_PAGES:
                return None
            pages.append(result)
            page.close()
        return {"status": "extracted", "engine": "pdfplumber", "profile": TABLE_PROFILE,
                "engine_version": pdfplumber.__version__, "page_count": page_count, "pages": pages}


def main():
    if sys.argv[1:] not in ([], [TABLE_PROFILE]):
        emit(UNREADABLE)
        return
    try:
        data = sys.stdin.buffer.read(MAX_INPUT_BYTES + 1)
    except Exception:
        emit(UNREADABLE)
        return
    if not data or len(data) > MAX_INPUT_BYTES:
        emit(UNREADABLE)
        return
    try:
        result = extract_tables(data) if sys.argv[1:] else extract(data)
    except Exception:
        result = None
    emit(UNREADABLE if result is None else result)


main()
