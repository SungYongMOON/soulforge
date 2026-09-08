"""Read-only checks for the fixed single-page HWPX rendering profile.

Packages are supplied by the trusted adapter's pinned, isolated snapshot.
Neither extracted text nor PDF metadata is returned to the caller. These fixed
profile checks are not a general PDF sanitizer or a visual acceptance decision.
"""
import hashlib
import json
import math
from pathlib import Path
import re
import stat
import sys


def fail():
    raise ValueError("hwpx_pdf_readback_failed")


def read_regular(file, limit):
    info = file.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or not 0 < info.st_size <= limit:
        fail()
    data = file.read_bytes()
    if len(data) != info.st_size:
        fail()
    return data


def digest(data):
    return hashlib.sha256(data).hexdigest()


def check(mode, root, packages):
    if mode not in ("inspect", "validate") or root.is_symlink() or packages.is_symlink():
        fail()
    request = json.loads(read_regular(root / "pdf-readback-request.json", 16384))
    if set(request) != {"pdf_sha256", "hwpx_sha256", "title", "body"}:
        fail()
    if any(not isinstance(request[key], str) or not re.fullmatch(r"[a-f0-9]{64}", request[key])
           for key in ("pdf_sha256", "hwpx_sha256")):
        fail()
    if any(not isinstance(request[key], str) or not request[key].strip() or len(request[key]) > 64
           for key in ("title", "body")):
        fail()
    sys.path.insert(0, str(packages))
    from pypdf import PdfReader
    from io import BytesIO

    pdf = read_regular(root / "rendered.pdf", 8 * 1024 * 1024)
    if digest(pdf) != request["pdf_sha256"]:
        fail()
    document = PdfReader(BytesIO(pdf), strict=True)
    if document.is_encrypted or len(document.pages) != 1:
        fail()
    catalog = document.trailer["/Root"]
    if any(key in catalog for key in ("/AcroForm", "/AA", "/AF", "/Collection")):
        fail()
    names = catalog.get("/Names")
    if names and any(key != "/Dests" for key in names.get_object()):
        fail()
    action = catalog.get("/OpenAction")
    if action and isinstance(action.get_object(), dict) and action.get_object().get("/S") != "/GoTo":
        fail()
    page = document.pages[0]
    if page.get("/AA") or float(page.get("/UserUnit", 1)) != 1 or int(page.get("/Rotate", 0)) % 360:
        fail()
    if page.get("/Annots") or page.get("/AF"):
        fail()
    width, height = float(page.mediabox.width), float(page.mediabox.height)
    if not (math.isfinite(width) and math.isfinite(height)
            and abs(width - 595.28) <= 1 and abs(height - 841.89) <= 1):
        fail()
    normalize = lambda value: re.sub(r"\s+", "", value)
    text = normalize(page.extract_text() or "")
    if any(normalize(request[key]) not in text for key in ("title", "body")):
        fail()
    result = {"pdf_sha256": digest(pdf), "pdf_size_bytes": len(pdf),
              "hwpx_sha256": request["hwpx_sha256"], "page_count": 1,
              "page_width": width, "page_height": height, "text_readback": True,
              "restricted_features_absent": True, "visual_review_required": True}
    if mode == "validate":
        from PIL import Image, ImageChops
        image_bytes = read_regular(root / "page-1.png", 8 * 1024 * 1024)
        with Image.open(BytesIO(image_bytes)) as image:
            if image.format != "PNG" or image.size != (794, 1123):
                fail()
            image.load()
            pixels = image.convert("RGB")
            box = ImageChops.difference(pixels, Image.new("RGB", pixels.size, "white")).getbbox()
            if box is None or (box[2] - box[0]) * (box[3] - box[1]) < 32:
                fail()
        if digest(read_regular(root / "rendered.pdf", 8 * 1024 * 1024)) != result["pdf_sha256"]:
            fail()
        result["renders"] = [{"sha256": digest(image_bytes), "size_bytes": len(image_bytes),
                               "width": 794, "height": 1123}]
    return result


if __name__ == "__main__":
    try:
        if len(sys.argv) != 4:
            fail()
        print(json.dumps(check(sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3])), separators=(",", ":")))
    except Exception:
        print('{"error":"hwpx_pdf_readback_failed"}')
        raise SystemExit(1)
