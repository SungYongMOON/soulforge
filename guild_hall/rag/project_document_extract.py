"""Soulforge project document extraction unit.

Reads one pdf byte stream from standard input and answers with one bounded json
document on standard output. The bytes stay in memory, no file system and no
network are touched, no input is echoed back, and anything that cannot be read
becomes one stable structured unreadable marker.
"""

import json
import sys

# The engine binds its message and log destinations to the current standard
# output stream while it loads, so the real stream is held aside first and the
# module level stream is pointed at the diagnostic channel.
_STDOUT = sys.stdout
sys.stdout = sys.stderr

import fitz  # noqa: E402

MAX_INPUT_BYTES = 16 * 1024 * 1024
MAX_PAGES = 2048
MAX_PAGE_CHARACTERS = 512 * 1024
# Aggregate caps bound the held text before it is serialized. The character cap
# times the widest json escape stays inside the serialized output cap below.
MAX_TEXT_CHARACTERS = 1024 * 1024
MAX_TEXT_BYTES = 2 * 1024 * 1024
MAX_OUTPUT_BYTES = 6 * 1024 * 1024
ENGINE = "pymupdf"
UNREADABLE = {"status": "unreadable"}


def emit(document):
    encoded = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if len(encoded) > MAX_OUTPUT_BYTES:
        encoded = json.dumps(UNREADABLE, separators=(",", ":")).encode("utf-8")
    _STDOUT.buffer.write(encoded)
    _STDOUT.buffer.flush()


def extract(data):
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


def main():
    try:
        data = sys.stdin.buffer.read(MAX_INPUT_BYTES + 1)
    except Exception:
        emit(UNREADABLE)
        return
    if not data or len(data) > MAX_INPUT_BYTES:
        emit(UNREADABLE)
        return
    try:
        result = extract(data)
    except Exception:
        result = None
    emit(UNREADABLE if result is None else result)


main()
