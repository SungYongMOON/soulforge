"""Best-effort local first-page previews; original documents are never edited."""
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile

OFFICE_SUFFIXES = {".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx", ".odt", ".ods", ".odp"}
TIMEOUT_SECONDS = 45

# A fresh profile prevents inheriting user macros, trusted locations, or linked
# document update preferences. DisableMacrosExecution also blocks non-Basic
# scripts; untrusted linked content and active OLE/DDE are disabled separately.
_PROFILE = '''<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry">
<item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item>
<item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="DisableMacrosExecution" oor:op="fuse"><value>true</value></prop><prop oor:name="DisableActiveContent" oor:op="fuse"><value>true</value></prop><prop oor:name="BlockUntrustedRefererLinks" oor:op="fuse"><value>true</value></prop></item>
<item oor:path="/org.openoffice.Office.Calc/Content/Update"><prop oor:name="Link" oor:op="fuse"><value>0</value></prop></item>
<item oor:path="/org.openoffice.Office.Writer/Content/Update"><prop oor:name="Link" oor:op="fuse"><value>0</value></prop></item>
</oor:items>
'''


def _libreoffice():
    for name in ("soffice.com", "soffice", "libreoffice"):
        found = shutil.which(name)
        if found:
            return found
    if os.name == "nt":
        for variable in ("PROGRAMFILES", "PROGRAMFILES(X86)"):
            root = os.environ.get(variable)
            if root:
                for name in ("soffice.com", "soffice.exe"):
                    candidate = Path(root) / "LibreOffice" / "program" / name
                    if candidate.is_file():
                        return str(candidate)
    return None


def _run(args):
    # Child converters receive OS necessities only, never gateway credentials
    # or Python import overrides from the parent profile.
    allowed = {"SYSTEMROOT", "WINDIR", "COMSPEC", "TEMP", "TMP", "TMPDIR",
               "PATH", "PATHEXT", "LANG", "LC_ALL", "SYSTEMDRIVE"}
    environment = {key: value for key, value in os.environ.items() if key.upper() in allowed}
    environment["PYTHONDONTWRITEBYTECODE"] = "1"
    process = subprocess.Popen(args, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                               stderr=subprocess.DEVNULL, env=environment,
                               start_new_session=os.name != "nt",
                               creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    try:
        process.communicate(timeout=TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired:
        # Kill only the tree rooted at this still-owned child PID. A launcher
        # may own a separate soffice.bin, so killing the launcher alone leaks it.
        try:
            if os.name == "nt":
                system_root = environment.get("SYSTEMROOT") or environment.get("SystemRoot") or environment.get("WINDIR")
                taskkill = str(Path(system_root) / "System32" / "taskkill.exe") if system_root else "taskkill.exe"
                subprocess.run([taskkill, "/PID", str(process.pid), "/T", "/F"],
                               stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                               stderr=subprocess.DEVNULL, env=environment, timeout=10,
                               creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0), check=False)
            else:
                os.killpg(process.pid, signal.SIGKILL)
        finally:
            if process.poll() is None:
                process.kill()
            process.wait(timeout=10)
        raise
    if process.returncode:
        raise subprocess.CalledProcessError(process.returncode, args)


def _raster_pdf(source, destination):
    import pymupdf as fitz
    from PIL import Image

    with fitz.open(source) as document:
        if document.needs_pass or not document.page_count:
            return False
        page = document[0]
        rect = page.rect
        if rect.width <= 0 or rect.height <= 0:
            return False
        scale = min(1000 / rect.width, 1400 / rect.height, 2)
        pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), colorspace=fitz.csRGB, alpha=False)
        if pixmap.width > 1000 or pixmap.height > 1400:
            return False
        # A fresh pixel-only image omits PyMuPDF's pHYs resolution metadata,
        # which the relay's canonical media policy rejects.
        image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
        image.save(str(destination), format="PNG")
        return True


def render_preview(path, output_dir):
    """Return a first-page PNG or None; never raise or mutate the source.

    Conversion is bounded in isolated processes. Office documents require an
    installed LibreOffice; PDFs require PyMuPDF in this Python environment.
    """
    try:
        source = Path(path)
        suffix = source.suffix.lower()
        if suffix not in OFFICE_SUFFIXES | {".pdf"} or not source.is_file():
            return None
        office = _libreoffice() if suffix != ".pdf" else None
        if suffix != ".pdf" and not office:
            return None
        output = Path(output_dir)
        output.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="document-preview-") as temporary:
            work = Path(temporary)
            # A fixed local copy avoids source-directory writes and filename
            # interpretation as a CLI option. Original bytes remain untouched.
            local_source = work / ("document" + suffix)
            shutil.copyfile(source, local_source)
            pdf = local_source
            if office:
                profile = work / "profile"
                (profile / "user").mkdir(parents=True)
                (profile / "user" / "registrymodifications.xcu").write_text(_PROFILE, encoding="utf-8")
                converted = work / "converted"
                converted.mkdir()
                _run([office, "-env:UserInstallation=" + profile.as_uri(),
                      "--headless", "--invisible", "--nologo", "--nodefault",
                      "--norestore", "--convert-to", "pdf", "--outdir",
                      str(converted), str(local_source)])
                pdf = converted / "document.pdf"
                if not pdf.is_file():
                    return None
            rendered = work / "preview.png"
            _run([sys.executable, str(Path(__file__).resolve()), "--raster",
                  str(pdf), str(rendered)])
            if not rendered.is_file():
                return None
            # Reserve a unique name without overwriting an earlier preview.
            with tempfile.NamedTemporaryFile(prefix="page-1-", suffix=".png", dir=output, delete=False) as final:
                destination = Path(final.name)
            shutil.copyfile(rendered, destination)
            return destination
    except Exception:
        return None


if __name__ == "__main__":
    try:
        ok = len(sys.argv) == 4 and sys.argv[1] == "--raster" and _raster_pdf(sys.argv[2], sys.argv[3])
    except Exception:
        ok = False
    raise SystemExit(0 if ok else 1)
