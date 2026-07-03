from __future__ import annotations

import csv
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
import hashlib
from pathlib import Path
from typing import Any, Dict, List, Optional
from xml.sax.saxutils import escape
from zipfile import ZIP_DEFLATED, ZipFile

from ..models import EmailEvent, message_attachment_count


SCHEMA_VERSION = "soulforge.project_mail_history.private.v1"
DEFAULT_INBOX_PROJECT_CODE = "P00-000_INBOX"
HISTORY_DIR = Path("reports") / "메일_이력"
CSV_FILE_NAME = "메일_이력.csv"
XLSX_FILE_NAME = "메일_이력.xlsx"
SCHEDULE_FILE_NAME = "메일_일정이벤트.ics"
TEXT_LINE_ENDING = "\n"
CSV_HEADERS = [
    "이력키",
    "스키마버전",
    "발생시각",
    "프로젝트코드",
    "단계",
    "몬스터ID",
    "후보ID",
    "이벤트유형",
    "메일소스ID",
    "메일메시지ID",
    "메일수신시각",
    "메일함",
    "수신역할",
    "스레드",
    "제목",
    "발신자",
    "첨부수",
    "작업상태",
    "게이트웨이몬스터참조",
    "프로젝트몬스터참조",
    "파일링패킷참조",
    "미션참조",
    "원문복사여부",
]


@dataclass
class ProjectMailHistorySummary:
    enabled: bool
    updated: int = 0
    skipped: int = 0
    skipped_reason: str = ""
    history_files: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "enabled": self.enabled,
            "updated": self.updated,
            "skipped": self.skipped,
            "skipped_reason": self.skipped_reason,
            "history_files": list(self.history_files),
        }


class ProjectMailHistoryWriter:
    """Write project-local mail history exports before monster assignment exists."""

    def __init__(
        self,
        *,
        repo_root: Path,
        workmeta_root: Optional[Path] = None,
        workspace_root: Optional[Path] = None,
        default_project_code: str = DEFAULT_INBOX_PROJECT_CODE,
    ) -> None:
        self.repo_root = Path(repo_root).expanduser()
        self.workmeta_root = Path(workmeta_root).expanduser() if workmeta_root else self.repo_root / "_workmeta"
        self.workspace_root = Path(workspace_root).expanduser() if workspace_root else self.repo_root / "_workspaces"
        self.default_project_code = _safe_project_code(default_project_code)

    def record_mail_received(
        self,
        event: EmailEvent,
        *,
        candidate_id: str,
        project_code: Optional[str] = None,
        occurred_at: Optional[str] = None,
    ) -> ProjectMailHistorySummary:
        if not isinstance(event, EmailEvent):
            return ProjectMailHistorySummary(enabled=True, skipped=1, skipped_reason="invalid_event")

        target_project = _safe_project_code(project_code or self.default_project_code)
        entry = self._build_mail_received_entry(
            event,
            candidate_id=candidate_id,
            project_code=target_project,
            occurred_at=occurred_at or _now_iso(),
        )
        paths = self._paths(target_project)
        rows = _read_csv_rows(paths["csv"])
        rows_by_key = {str(row.get("이력키", "")): _normalize_row(row) for row in rows if row.get("이력키")}
        rows_by_key[entry["이력키"]] = entry
        next_rows = sorted(rows_by_key.values(), key=lambda row: (row["발생시각"], row["이력키"]))
        _assert_no_duplicate_history_keys(next_rows)

        paths["root"].mkdir(parents=True, exist_ok=True)
        paths["workspace_root"].mkdir(parents=True, exist_ok=True)
        _write_csv(paths["csv"], next_rows)
        _write_xlsx(paths["xlsx"], next_rows)
        _write_ics(paths["ics"], next_rows)
        _remove_legacy_workmeta_xlsx(paths["legacy_xlsx"])

        return ProjectMailHistorySummary(
            enabled=True,
            updated=1,
            history_files=[
                _repo_relative(self.repo_root, paths["csv"]),
                _repo_relative(self.repo_root, paths["xlsx"]),
                _repo_relative(self.repo_root, paths["ics"]),
            ],
        )

    def _build_mail_received_entry(
        self,
        event: EmailEvent,
        *,
        candidate_id: str,
        project_code: str,
        occurred_at: str,
    ) -> Dict[str, str]:
        source_ref = str(event.event_id or "").strip()
        candidate_ref = f"guild_hall/state/gateway/mail_candidate/queue/pending/{candidate_id}.json"
        row = {
            "이력키": _history_key(project_code, "mail_received", candidate_id, source_ref),
            "스키마버전": SCHEMA_VERSION,
            "발생시각": _normalize_timestamp(occurred_at),
            "프로젝트코드": project_code,
            "단계": "mail_candidate_queue",
            "몬스터ID": "",
            "후보ID": candidate_id,
            "이벤트유형": "mail_received",
            "메일소스ID": source_ref,
            "메일메시지ID": str(event.provider_message_id or ""),
            "메일수신시각": str(event.received_at or ""),
            "메일함": _mailbox_history_label(event),
            "수신역할": _recipient_role_for_event(event),
            "스레드": str(event.thread_id or ""),
            "제목": str(event.subject or ""),
            "발신자": _format_addresses(event.from_addrs),
            "첨부수": str(message_attachment_count(event.attachments)),
            "작업상태": "candidate_pending",
            "게이트웨이몬스터참조": "",
            "프로젝트몬스터참조": "",
            "파일링패킷참조": candidate_ref,
            "미션참조": "",
            "원문복사여부": "false",
        }
        return _normalize_row(row)

    def _paths(self, project_code: str) -> Dict[str, Path]:
        project_root = self.workmeta_root / _safe_project_code(project_code)
        history_root = project_root / HISTORY_DIR
        workspace_history_root = self.workspace_root / _safe_project_code(project_code) / HISTORY_DIR
        return {
            "root": history_root,
            "csv": history_root / CSV_FILE_NAME,
            "legacy_xlsx": history_root / XLSX_FILE_NAME,
            "workspace_root": workspace_history_root,
            "xlsx": workspace_history_root / XLSX_FILE_NAME,
            "ics": history_root / SCHEDULE_FILE_NAME,
        }


def _read_csv_rows(path: Path) -> List[Dict[str, str]]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8-sig", newline="") as fp:
        return list(csv.DictReader(fp))


def _write_csv(path: Path, rows: List[Dict[str, str]]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as fp:
        writer = csv.DictWriter(fp, fieldnames=CSV_HEADERS, lineterminator=TEXT_LINE_ENDING)
        writer.writeheader()
        for row in rows:
            writer.writerow(_normalize_row(row))


def _write_xlsx(path: Path, rows: List[Dict[str, str]]) -> None:
    sheet_rows = [_normalize_row(dict(zip(CSV_HEADERS, CSV_HEADERS)))] + [_normalize_row(row) for row in rows]
    sheet_xml = _worksheet_xml(sheet_rows)
    with ZipFile(path, "w", ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", _content_types_xml())
        archive.writestr("_rels/.rels", _root_rels_xml())
        archive.writestr("xl/workbook.xml", _workbook_xml())
        archive.writestr("xl/_rels/workbook.xml.rels", _workbook_rels_xml())
        archive.writestr("xl/styles.xml", _styles_xml())
        archive.writestr("xl/worksheets/sheet1.xml", sheet_xml)


def _remove_legacy_workmeta_xlsx(path: Path) -> None:
    try:
        path.unlink()
    except FileNotFoundError:
        return


def _write_ics(path: Path, rows: List[Dict[str, str]]) -> None:
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Soulforge//Project Mail History//KO",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
    ]
    for row in rows:
        start = row["메일수신시각"] or row["발생시각"]
        summary = f"[{row['프로젝트코드']}] {row['제목'] or row['후보ID'] or row['몬스터ID']}"
        lines.extend(
            [
                "BEGIN:VEVENT",
                f"UID:{row['이력키']}@soulforge.local",
                f"DTSTAMP:{_ics_date(row['발생시각'])}",
                f"DTSTART:{_ics_date(start)}",
                f"DTEND:{_ics_date(_add_minutes(start, 15))}",
                f"SUMMARY:{_escape_ics(summary)}",
                "DESCRIPTION:"
                + _escape_ics(
                    "\\n".join(
                        [
                            f"이벤트유형: {row['이벤트유형']}",
                            f"후보ID: {row['후보ID']}",
                            f"몬스터ID: {row['몬스터ID']}",
                            f"메일소스ID: {row['메일소스ID']}",
                            "원문복사여부: false",
                        ]
                    )
                ),
                "CATEGORIES:메일,수신이력",
                "END:VEVENT",
            ]
        )
    lines.append("END:VCALENDAR")
    with path.open("w", encoding="utf-8", newline="") as handle:
        handle.write(TEXT_LINE_ENDING.join(lines) + TEXT_LINE_ENDING)


def _worksheet_xml(rows: List[Dict[str, str]]) -> str:
    row_xml = []
    for row_index, row in enumerate(rows, start=1):
        cells = []
        for column_index, header in enumerate(CSV_HEADERS, start=1):
            cell_ref = f"{_column_name(column_index)}{row_index}"
            value = escape(str(row.get(header, "")))
            cells.append(f'<c r="{cell_ref}" t="inlineStr"><is><t>{value}</t></is></c>')
        row_xml.append(f'<row r="{row_index}">{"".join(cells)}</row>')
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<sheetData>{"".join(row_xml)}</sheetData></worksheet>'
    )


def _content_types_xml() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        "</Types>"
    )


def _root_rels_xml() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        "</Relationships>"
    )


def _workbook_xml() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        '<sheets><sheet name="메일_이력" sheetId="1" r:id="rId1"/></sheets></workbook>'
    )


def _workbook_rels_xml() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
        "</Relationships>"
    )


def _styles_xml() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>'
        '<fills count="1"><fill><patternFill patternType="none"/></fill></fills>'
        '<borders count="1"><border/></borders>'
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>'
        "</styleSheet>"
    )


def _normalize_row(row: Dict[str, Any]) -> Dict[str, str]:
    return {header: "" if row.get(header) is None else str(row.get(header, "")) for header in CSV_HEADERS}


def _assert_no_duplicate_history_keys(rows: List[Dict[str, str]]) -> None:
    seen = set()
    duplicates = []
    for row in rows:
        key = str(row.get("이력키", ""))
        if not key:
            continue
        if key in seen:
            duplicates.append(key)
        seen.add(key)
    if duplicates:
        raise ValueError(f"duplicate project mail history keys: {', '.join(sorted(set(duplicates)))}")


def _history_key(project_code: str, event_type: str, candidate_id: str, source_ref: str) -> str:
    raw = "|".join([project_code, event_type, candidate_id, source_ref or "no_mail_source"])
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:24]


def _safe_project_code(value: str) -> str:
    raw = str(value or "").strip()
    if not raw:
        raise ValueError("missing project_code")
    if not all(ch.isalnum() or ch in "._-" for ch in raw):
        raise ValueError("project_code contains unsupported path characters")
    return raw


def _format_addresses(value: Any) -> str:
    rows = value if isinstance(value, list) else []
    rendered = []
    for item in rows:
        name = str(getattr(item, "name", "") or "")
        address = str(getattr(item, "address", "") or "")
        if name and address:
            rendered.append(f"{name} <{address}>")
        elif address or name:
            rendered.append(address or name)
    return "; ".join(rendered)


def _address_list_contains(value: Any, mailbox: str) -> bool:
    mailbox_email = str(mailbox or "").strip().lower()
    if not mailbox_email:
        return False
    rows = value if isinstance(value, list) else []
    for item in rows:
        address = str(getattr(item, "address", "") or getattr(item, "email", "") or item or "").strip().lower()
        if address == mailbox_email:
            return True
    return False


def _recipient_role_for_event(event: EmailEvent) -> str:
    mailbox = _mailbox_history_label(event)
    if _address_list_contains(event.to_addrs, mailbox):
        return "to"
    if _address_list_contains(event.cc_addrs, mailbox):
        return "cc"
    return ""


def _mailbox_history_label(event: EmailEvent) -> str:
    metadata = event.metadata if isinstance(event.metadata, dict) else {}
    mailbox = metadata.get("mailbox")
    if isinstance(mailbox, dict):
        for key in ("email", "id"):
            value = str(mailbox.get(key, "") or "").strip()
            if value:
                return value
    return f"{_workspace_for_source(event.source)}_mailbox"


def _workspace_for_source(source: str) -> str:
    source_text = str(source or "").strip()
    if source_text in {"hiworks", "o365"}:
        return "company"
    return "personal"


def _column_name(index: int) -> str:
    value = index
    name = ""
    while value > 0:
        value, remainder = divmod(value - 1, 26)
        name = chr(65 + remainder) + name
    return name


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _normalize_timestamp(value: str) -> str:
    return _parse_dt(value).isoformat().replace("+00:00", "Z")


def _parse_dt(value: str) -> datetime:
    raw = str(value or "").strip()
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except Exception:
        parsed = datetime.fromtimestamp(0, tz=timezone.utc)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _ics_date(value: str) -> str:
    return _parse_dt(value).strftime("%Y%m%dT%H%M%SZ")


def _add_minutes(value: str, minutes: int) -> str:
    return (_parse_dt(value) + timedelta(minutes=minutes)).isoformat()


def _escape_ics(value: str) -> str:
    return str(value or "").replace("\\", "\\\\").replace("\n", "\\n").replace(";", "\\;").replace(",", "\\,")


def _repo_relative(repo_root: Path, file_path: Path) -> str:
    try:
        return file_path.relative_to(repo_root).as_posix()
    except ValueError:
        return file_path.as_posix()
