# Attachment render worker: a PDF in, page images out.
#
# LibreOffice converts a presentation or a document to PDF; only the first page
# survives its own PNG export, so the page images are made here with PyMuPDF,
# which is the one library on this host that can rasterize a page at a chosen
# resolution. One request on stdin, one ASCII JSON object on stdout; it writes
# only into the output directory the request names, opens no network, calls no
# model, and never puts a path or page content into an error.
import contextlib
import json
import os
import sys

WORKER_SCHEMA = "soulforge.context_attachment_render_worker.v1"


@contextlib.contextmanager
def _stdout_reserved():
    """Keep file descriptor 1 for the answer and nothing else.

    MuPDF writes its own diagnostics ("format error: No common ancestor in
    structure tree" on a LibreOffice-made PDF) straight to the C-level stdout,
    which lands in front of the JSON and makes the whole answer unreadable to the
    caller. Pointing descriptor 1 at stderr for the duration of the work sends
    that noise where the caller already discards it, and the answer is written
    after the descriptor is restored.
    """
    sys.stdout.flush()
    saved = os.dup(1)
    os.dup2(2, 1)
    try:
        yield
    finally:
        sys.stdout.flush()
        os.dup2(saved, 1)
        os.close(saved)


class WorkerError(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.code = code


def render(request):
    import fitz  # PyMuPDF

    source = request.get("pdf_path")
    out_dir = request.get("out_dir")
    prefix = request.get("prefix") or "page"
    dpi = int(request.get("dpi") or 120)
    max_pages = int(request.get("max_pages") or 8)
    if not isinstance(source, str) or not source or not isinstance(out_dir, str) or not out_dir:
        raise WorkerError("request_invalid")
    if dpi < 36 or dpi > 300 or max_pages < 1 or max_pages > 64:
        raise WorkerError("request_bounds")
    if not str(prefix).isalnum():
        raise WorkerError("request_invalid")
    try:
        fitz.TOOLS.mupdf_display_errors(False)
        fitz.TOOLS.mupdf_display_warnings(False)
    except Exception:
        pass
    pages = []
    document = fitz.open(source)
    try:
        for index, page in enumerate(document, start=1):
            if index > max_pages:
                break
            pixmap = page.get_pixmap(dpi=dpi)
            name = "{}-{}.png".format(prefix, index)
            pixmap.save(os.path.join(out_dir, name))
            pages.append({"page": index, "file": name, "width": int(pixmap.width), "height": int(pixmap.height)})
        total = document.page_count
    finally:
        document.close()
    return {"status": "ok", "pages": pages, "counts": {"pages_in_file": int(total), "pages_rendered": len(pages)},
            "renderer": {"pymupdf": fitz.VersionBind if hasattr(fitz, "VersionBind") else None, "dpi": dpi}}


def main():
    raw = sys.stdin.buffer.read(int(1024 * 1024))
    try:
        request = json.loads(raw.decode("utf-8"))
    except Exception:
        raise WorkerError("request_unreadable")
    if not isinstance(request, dict) or request.get("schema_version") != WORKER_SCHEMA:
        raise WorkerError("request_schema_unknown")
    if request.get("operation") != "render_pages":
        raise WorkerError("operation_unknown")
    try:
        with _stdout_reserved():
            return render(request)
    except WorkerError:
        raise
    except ImportError:
        raise WorkerError("renderer_unavailable")
    except Exception as error:
        return {"status": "error", "code": "render_failed", "error_type": type(error).__name__}


if __name__ == "__main__":
    try:
        code, payload = 0, json.dumps(main(), ensure_ascii=True, sort_keys=True, allow_nan=False)
    except WorkerError as error:
        code, payload = 3, json.dumps({"status": "error", "code": error.code}, sort_keys=True)
    except Exception as error:  # never echo request content or paths
        code, payload = 4, json.dumps({"status": "error", "code": "worker_failed",
                                       "error_type": type(error).__name__}, sort_keys=True)
    sys.stdout.buffer.write(payload.encode("ascii"))
    sys.stdout.buffer.flush()
    sys.exit(code)
