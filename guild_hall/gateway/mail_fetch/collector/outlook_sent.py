from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
from typing import Any, Callable, Dict, Mapping, Optional
from uuid import uuid4

from .pipeline.mail_occurrence_shadow import (
    MailOccurrenceShadowError,
    MailOccurrenceShadowStore,
    create_mailbox_observation,
    validate_exact_occurrence_ref,
)
from .storage.source_custody import (
    SourceCustodyError,
    ensure_source_custody_directory,
    persist_outlook_msg,
    verify_outlook_msg,
)


OUTLOOK_SENT_RUN_SCHEMA_VERSION = "email.fetch.outlook_sent_run.v1"
_DIGEST_RE = re.compile(r"^sha256:[0-9a-f]{64}$")
_CURSOR_RE = re.compile(r"^outlook_cursor:(\d{1,16})(?::[0-9a-f]{16})?$")
_RFC_MESSAGE_ID_RE = re.compile(
    r"^<[A-Za-z0-9!#$%&'*+\-/=?^_`{|}~]+(?:\.[A-Za-z0-9!#$%&'*+\-/=?^_`{|}~]+)*"
    r"@[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?>$"
)
_REPARSE_POINT_ATTRIBUTE = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x00000400)
_KST = timezone(timedelta(hours=9))


class OutlookSentError(RuntimeError):
    def __init__(self, code: str, *, retryable: bool = False) -> None:
        self.code = code
        self.retryable = retryable
        super().__init__(code)


@dataclass(frozen=True)
class OutlookSentConfig:
    enabled: bool
    dry_run: bool
    capsule_bound: bool
    source_custody_root: Path
    shadow_state_file: Path
    source_ref: str
    source_scope_ref: str
    account_ref: str
    account_role: str
    folder_ref: str
    default_store_fingerprint: str
    default_folder_fingerprint: str
    overlap_seconds: int
    initial_window_seconds: int
    max_items: int
    max_msg_bytes: int
    allowed_windows_kst: tuple[tuple[int, int], ...]


Exporter = Callable[[OutlookSentConfig, Path, datetime, datetime], Mapping[str, Any]]


def _sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _opaque_ref(prefix: str, value: str) -> str:
    return f"{prefix}:{_sha256_text(value)}"


def _parse_env_text(text: str) -> Dict[str, str]:
    values: Dict[str, str] = {}
    for raw in str(text or "").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def _env_bool(values: Mapping[str, str], key: str, default: bool = False) -> bool:
    raw = values.get(key)
    if raw is None:
        return default
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}


def _env_int(
    values: Mapping[str, str], key: str, default: int, minimum: int, maximum: int
) -> int:
    try:
        value = int(str(values.get(key, default)).strip())
    except (TypeError, ValueError) as exc:
        raise OutlookSentError("outlook_sent_config_invalid") from exc
    if value < minimum or value > maximum:
        raise OutlookSentError("outlook_sent_config_invalid")
    return value


def _required_digest(values: Mapping[str, str], key: str) -> str:
    value = str(values.get(key, "") or "").strip()
    if not _DIGEST_RE.fullmatch(value):
        raise OutlookSentError("outlook_sent_fingerprint_pin_required")
    return value


def _minute_of_day(value: str, *, allow_end_of_day: bool = False) -> int:
    match = re.fullmatch(r"(\d{2}):(\d{2})", value)
    if match is None:
        raise OutlookSentError("outlook_sent_schedule_invalid")
    hour, minute = (int(part) for part in match.groups())
    if allow_end_of_day and hour == 24 and minute == 0:
        return 24 * 60
    if hour > 23 or minute > 59:
        raise OutlookSentError("outlook_sent_schedule_invalid")
    return hour * 60 + minute


def _allowed_windows_kst(
    values: Mapping[str, str], *, enabled: bool
) -> tuple[tuple[int, int], ...]:
    raw = str(values.get("OUTLOOK_SENT_ALLOWED_WINDOWS_KST", "") or "").strip()
    if not raw:
        if enabled:
            raise OutlookSentError("outlook_sent_schedule_required")
        return ()
    windows: list[tuple[int, int]] = []
    for token in raw.split(","):
        parts = token.strip().split("-")
        if len(parts) != 2:
            raise OutlookSentError("outlook_sent_schedule_invalid")
        start = _minute_of_day(parts[0].strip())
        end = _minute_of_day(parts[1].strip(), allow_end_of_day=True)
        if start >= end:
            raise OutlookSentError("outlook_sent_schedule_invalid")
        windows.append((start, end))
    windows.sort()
    if any(left[1] > right[0] for left, right in zip(windows, windows[1:])):
        raise OutlookSentError("outlook_sent_schedule_invalid")
    return tuple(windows)


def build_outlook_sent_config(
    *,
    mailbox_id: str,
    account_id: str,
    account_role: str,
    workspace: str,
    env_text: str,
    env_overrides: Optional[Mapping[str, str]] = None,
    capsule_bound: bool,
    dry_run: bool = False,
) -> OutlookSentConfig:
    values = _parse_env_text(env_text)
    values.update({str(key): str(value) for key, value in (env_overrides or {}).items()})
    enabled = _env_bool(values, "OUTLOOK_SENT_ENABLED", False)
    if enabled and not capsule_bound:
        raise OutlookSentError("outlook_sent_capsule_required")

    inbox_root_raw = str(values.get("EMAIL_FETCH_INBOX_ROOT", "") or "").strip()
    runtime_root_raw = str(values.get("EMAIL_FETCH_RUNTIME_DIR", "") or "").strip()
    if not Path(inbox_root_raw).is_absolute() or not Path(runtime_root_raw).is_absolute():
        raise OutlookSentError("outlook_sent_data_root_required")

    role = str(account_role or values.get("OUTLOOK_SENT_ACCOUNT_ROLE", "team")).strip()
    if role not in {"owner", "team"}:
        raise OutlookSentError("outlook_sent_config_invalid")
    mailbox_token = str(mailbox_id or "").strip()
    account_token = str(account_id or mailbox_token).strip()
    workspace_token = str(workspace or "company").strip().strip("/\\")
    if not mailbox_token or not account_token or not workspace_token:
        raise OutlookSentError("outlook_sent_config_invalid")

    inbox_root = Path(inbox_root_raw)
    runtime_root = Path(runtime_root_raw) / "mailboxes" / mailbox_token
    custody_root = inbox_root / workspace_token / "mail" / "source_custody"
    store_pin = _required_digest(values, "OUTLOOK_SENT_DEFAULT_STORE_FINGERPRINT")
    folder_pin = _required_digest(values, "OUTLOOK_SENT_DEFAULT_FOLDER_FINGERPRINT")
    allowed_windows = _allowed_windows_kst(values, enabled=enabled)
    return OutlookSentConfig(
        enabled=enabled,
        dry_run=bool(dry_run),
        capsule_bound=bool(capsule_bound),
        source_custody_root=custody_root,
        shadow_state_file=runtime_root / "state" / "outlook_sent_shadow.json",
        source_ref=_opaque_ref("source_outlook_sent", mailbox_token),
        source_scope_ref=_opaque_ref("scope_outlook_sent", mailbox_token),
        account_ref=_opaque_ref("account", account_token),
        account_role=role,
        folder_ref=f"folder:{folder_pin.split(':', 1)[1]}",
        default_store_fingerprint=store_pin,
        default_folder_fingerprint=folder_pin,
        overlap_seconds=_env_int(
            values, "OUTLOOK_SENT_OVERLAP_SECONDS", 300, 0, 86_400
        ),
        initial_window_seconds=_env_int(
            values, "OUTLOOK_SENT_INITIAL_WINDOW_SECONDS", 86_400, 1, 31_536_000
        ),
        max_items=_env_int(values, "OUTLOOK_SENT_MAX_ITEMS", 100, 1, 5_000),
        max_msg_bytes=_env_int(
            values,
            "OUTLOOK_SENT_MAX_MSG_BYTES",
            100 * 1024 * 1024,
            1,
            2 * 1024 * 1024 * 1024,
        ),
        allowed_windows_kst=allowed_windows,
    )


def _utc_seconds(value: datetime) -> datetime:
    if value.tzinfo is None:
        raise OutlookSentError("outlook_sent_time_invalid")
    return value.astimezone(timezone.utc).replace(microsecond=0)


def _iso(value: datetime) -> str:
    return _utc_seconds(value).isoformat().replace("+00:00", "Z")


def _cursor_time(value: Optional[str]) -> Optional[datetime]:
    if value is None:
        return None
    match = _CURSOR_RE.fullmatch(value)
    if not match:
        raise OutlookSentError("outlook_sent_cursor_invalid")
    return datetime.fromtimestamp(int(match.group(1)), tz=timezone.utc)


def _cursor(value: datetime, batch_id: str) -> str:
    return (
        f"outlook_cursor:{int(_utc_seconds(value).timestamp())}:"
        f"{_sha256_text(batch_id)[:16]}"
    )


def _window(
    config: OutlookSentConfig, cursor_before: Optional[str], now: datetime
) -> tuple[datetime, datetime]:
    end = _utc_seconds(now)
    previous = _cursor_time(cursor_before)
    if previous is None:
        start = end - timedelta(seconds=config.initial_window_seconds)
    else:
        start = previous - timedelta(seconds=config.overlap_seconds)
    if start >= end:
        raise OutlookSentError("outlook_sent_window_invalid")
    return start, end


def _schedule_slot(
    config: OutlookSentConfig, now: datetime
) -> Optional[tuple[datetime, datetime]]:
    local = _utc_seconds(now).astimezone(_KST)
    minute = local.hour * 60 + local.minute
    for start_minute, end_minute in config.allowed_windows_kst:
        if start_minute <= minute < end_minute:
            start_local = local.replace(
                hour=start_minute // 60,
                minute=start_minute % 60,
                second=0,
                microsecond=0,
            )
            end_local = (
                local.replace(hour=0, minute=0, second=0, microsecond=0)
                + timedelta(days=1)
                if end_minute == 24 * 60
                else local.replace(
                    hour=end_minute // 60,
                    minute=end_minute % 60,
                    second=0,
                    microsecond=0,
                )
            )
            return start_local.astimezone(timezone.utc), end_local.astimezone(timezone.utc)
    return None


def _safe_staged_msg(path: Path, staging_root: Path, max_bytes: int) -> bytes:
    candidate = Path(os.path.abspath(os.fspath(path)))
    root = Path(os.path.abspath(os.fspath(staging_root)))
    if candidate.parent != root or candidate.suffix.lower() != ".msg":
        raise OutlookSentError("outlook_sent_staging_escape")
    try:
        info = os.lstat(candidate)
    except OSError as exc:
        raise OutlookSentError("outlook_sent_staged_msg_invalid") from exc
    if (
        not stat.S_ISREG(info.st_mode)
        or stat.S_ISLNK(info.st_mode)
        or int(getattr(info, "st_file_attributes", 0)) & _REPARSE_POINT_ATTRIBUTE
        or info.st_size <= 0
        or info.st_size > max_bytes
    ):
        raise OutlookSentError("outlook_sent_staged_msg_invalid")
    try:
        return candidate.read_bytes()
    except OSError as exc:
        raise OutlookSentError("outlook_sent_staged_msg_invalid") from exc


def _validate_export(
    value: Mapping[str, Any], config: OutlookSentConfig
) -> list[Mapping[str, Any]]:
    if not isinstance(value, Mapping):
        raise OutlookSentError("outlook_sent_export_invalid")
    if value.get("store_fingerprint") != config.default_store_fingerprint:
        raise OutlookSentError("outlook_sent_store_pin_mismatch")
    if value.get("folder_fingerprint") != config.default_folder_fingerprint:
        raise OutlookSentError("outlook_sent_folder_pin_mismatch")
    records = value.get("records")
    if not isinstance(records, list) or len(records) > config.max_items:
        raise OutlookSentError("outlook_sent_export_invalid")
    if not isinstance(value.get("truncated"), bool):
        raise OutlookSentError("outlook_sent_export_invalid")
    gaps = value.get("gap_codes")
    if (
        not isinstance(gaps, list)
        or any(not isinstance(code, str) or not re.fullmatch(r"[a-z0-9_.-]+", code) for code in gaps)
    ):
        raise OutlookSentError("outlook_sent_export_invalid")
    return records


def _participant_relations(value: Any) -> list[Dict[str, str]]:
    if not isinstance(value, list):
        raise OutlookSentError("outlook_sent_export_invalid")
    rows: list[Dict[str, str]] = []
    for row in value:
        if not isinstance(row, Mapping) or set(row) != {"role", "party_ref"}:
            raise OutlookSentError("outlook_sent_export_invalid")
        role = str(row.get("role") or "")
        party_ref = str(row.get("party_ref") or "")
        if role not in {"to", "cc", "bcc", "unknown"} or not re.fullmatch(
            r"party:[0-9a-f]{64}", party_ref
        ):
            raise OutlookSentError("outlook_sent_export_invalid")
        rows.append(
            {
                "party_ref": party_ref,
                "role": role,
                "evidence": "sender_copy" if role == "bcc" else "source_native",
            }
        )
    return rows


def _exact_message_id(value: Any) -> Optional[Dict[str, str]]:
    message_id = str(value or "").strip()
    if not message_id:
        return None
    if not message_id.isascii() or not _RFC_MESSAGE_ID_RE.fullmatch(message_id):
        return None
    exact_ref = {
        "kind": "rfc_message_id",
        "authority_ref": "rfc5322",
        "value": message_id,
    }
    try:
        return validate_exact_occurrence_ref(exact_ref)
    except MailOccurrenceShadowError:
        return None


def _record_observation(
    record: Mapping[str, Any],
    *,
    config: OutlookSentConfig,
    staging_root: Path,
    existing_observations_by_native: Mapping[str, Mapping[str, Any]],
    observed_at: str,
    window_start: datetime,
    window_end: datetime,
) -> tuple[Dict[str, Any], bool]:
    if not isinstance(record, Mapping) or set(record) != {
        "staged_msg",
        "rfc_message_id",
        "native_observation_fingerprint",
        "sent_at",
        "recipients",
    }:
        raise OutlookSentError("outlook_sent_export_invalid")
    native_fingerprint = str(record.get("native_observation_fingerprint") or "")
    if not _DIGEST_RE.fullmatch(native_fingerprint):
        raise OutlookSentError("outlook_sent_export_invalid")
    native_observation_ref = (
        f"outlook_native:{native_fingerprint.split(':', 1)[1]}"
    )
    sent_at = str(record.get("sent_at") or "")
    try:
        occurred = datetime.fromisoformat(sent_at.replace("Z", "+00:00"))
    except ValueError as exc:
        raise OutlookSentError("outlook_sent_export_invalid") from exc
    occurred = _utc_seconds(occurred)
    if occurred < window_start or occurred >= window_end:
        raise OutlookSentError("outlook_sent_record_outside_window")
    occurred_at = _iso(occurred)
    raw_bytes = _safe_staged_msg(
        Path(str(record.get("staged_msg") or "")),
        staging_root,
        config.max_msg_bytes,
    )
    existing = existing_observations_by_native.get(native_observation_ref)
    custody = (
        persist_outlook_msg(config.source_custody_root, raw_bytes)
        if existing is None
        else None
    )
    source_custody_ref = (
        f"outlook_msg:{custody.sha256}"
        if custody is not None
        else str(existing.get("source_custody_ref") or "")
    )
    if not source_custody_ref.startswith("outlook_msg:"):
        raise OutlookSentError("outlook_sent_existing_observation_invalid")
    if existing is not None:
        verify_outlook_msg(config.source_custody_root, source_custody_ref)
    observation = create_mailbox_observation(
        source_ref=config.source_ref,
        account_ref=config.account_ref,
        account_role=config.account_role,
        direction="sent",
        folder_ref=config.folder_ref,
        native_observation_ref=native_observation_ref,
        occurred_at=occurred_at,
        observed_at=(
            str(existing.get("observed_at") or "")
            if existing is not None
            else observed_at
        ),
        exact_occurrence_ref=_exact_message_id(record.get("rfc_message_id")),
        participant_relations=_participant_relations(record.get("recipients")),
        source_custody_ref=source_custody_ref,
    )
    if existing is not None and observation != existing:
        raise OutlookSentError("outlook_sent_observation_conflict")
    return observation, custody.written if custody is not None else False


def _batch_id(
    config: OutlookSentConfig,
    start: datetime,
    end: datetime,
    observations: list[Mapping[str, Any]],
    truncated: bool,
    gaps: list[str],
) -> str:
    basis = json.dumps(
        {
            "scope": config.source_scope_ref,
            "start": _iso(start),
            "end": _iso(end),
            "observations": sorted(row["observation_digest"] for row in observations),
            "truncated": truncated,
            "gaps": sorted(set(gaps)),
        },
        separators=(",", ":"),
        sort_keys=True,
    )
    return f"outlook_batch:{_sha256_text(basis)}"


def _safe_cleanup(staging_root: Path, expected_parent: Path) -> None:
    try:
        root = Path(os.path.abspath(os.fspath(staging_root)))
        parent = Path(os.path.abspath(os.fspath(expected_parent)))
        root.relative_to(parent)
        info = os.lstat(root)
        if (
            stat.S_ISDIR(info.st_mode)
            and not stat.S_ISLNK(info.st_mode)
            and not int(getattr(info, "st_file_attributes", 0))
            & _REPARSE_POINT_ATTRIBUTE
        ):
            shutil.rmtree(root)
    except (FileNotFoundError, OSError, ValueError):
        return


def run_outlook_sent(
    config: OutlookSentConfig,
    *,
    exporter: Optional[Exporter] = None,
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    if not config.enabled:
        return _result("feature_off")
    if config.dry_run:
        return _result("dry_run")
    if not config.capsule_bound:
        raise OutlookSentError("outlook_sent_capsule_required")

    observed_now = _utc_seconds(now or datetime.now(timezone.utc))
    schedule_slot = _schedule_slot(config, observed_now)
    if schedule_slot is None:
        return _result("outside_schedule")
    shadow = MailOccurrenceShadowStore(config.shadow_state_file)
    snapshot = shadow.snapshot()
    cursor_before = snapshot["cursors"].get(config.source_scope_ref)
    existing_observations_by_native = {
        row["native_observation_ref"]: row
        for row in snapshot["observations"].values()
        if row.get("source_ref") == config.source_ref
        and isinstance(row.get("native_observation_ref"), str)
    }
    prior_watermark = _cursor_time(cursor_before)
    if prior_watermark is not None and prior_watermark >= schedule_slot[0]:
        return _result("already_collected_in_slot")
    start, end = _window(config, cursor_before, observed_now)
    if prior_watermark is not None and end <= prior_watermark:
        return _result("up_to_date")
    staging_parent = ensure_source_custody_directory(
        config.source_custody_root, ".outlook_sent_staging"
    )
    staging_root = ensure_source_custody_directory(
        config.source_custody_root,
        f".outlook_sent_staging/{uuid4().hex}",
    )
    try:
        export_result = (
            exporter(config, staging_root, start, end)
            if exporter is not None
            else _export_with_active_outlook(config, staging_root, start, end)
        )
        records = _validate_export(export_result, config)
        observations: list[Dict[str, Any]] = []
        objects_written = 0
        for record in records:
            observation, written = _record_observation(
                record,
                config=config,
                staging_root=staging_root,
                existing_observations_by_native=existing_observations_by_native,
                observed_at=_iso(observed_now),
                window_start=start,
                window_end=end,
            )
            observations.append(observation)
            objects_written += int(written)

        gaps = sorted(set(export_result["gap_codes"]))
        truncated = bool(export_result["truncated"])
        batch_id = _batch_id(config, start, end, observations, truncated, gaps)
        next_watermark = (prior_watermark or start) if truncated or gaps else end
        cursor_after = _cursor(next_watermark, batch_id)
        batch = shadow.apply_batch(
            batch_id=batch_id,
            source_scope_ref=config.source_scope_ref,
            cursor_before=cursor_before,
            cursor_after=cursor_after,
            observations=observations,
        )
        return {
            "schema_version": OUTLOOK_SENT_RUN_SCHEMA_VERSION,
            "status": "partial" if truncated or gaps else "ok",
            "partial": bool(truncated or gaps),
            "total_events": len(records),
            "total_new_events": batch["added_observations"],
            "total_duplicates": batch["duplicate_observations"],
            "custody_objects_written": objects_written,
            "cursor_advanced": not (truncated or gaps),
            "truncated": truncated,
            "gap_count": len(gaps),
        }
    except SourceCustodyError as exc:
        raise OutlookSentError(exc.code, retryable=exc.retryable) from exc
    finally:
        _safe_cleanup(staging_root, staging_parent)


def _result(status: str) -> Dict[str, Any]:
    return {
        "schema_version": OUTLOOK_SENT_RUN_SCHEMA_VERSION,
        "status": status,
        "partial": False,
        "total_events": 0,
        "total_new_events": 0,
        "total_duplicates": 0,
        "custody_objects_written": 0,
        "cursor_advanced": False,
        "truncated": False,
        "gap_count": 0,
    }


def build_outlook_sent_powershell_script() -> str:
    return r"""
$ErrorActionPreference = 'Stop'
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

function Get-Sha256Text([string]$Value) {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($Value)
  $hash = [System.Security.Cryptography.SHA256]::Create()
  try {
    $hex = [BitConverter]::ToString($hash.ComputeHash($bytes)).Replace('-', '').ToLowerInvariant()
    return 'sha256:' + $hex
  }
  finally { $hash.Dispose() }
}

$start = [DateTimeOffset]::Parse($env:SOULFORGE_OUTLOOK_WINDOW_START).LocalDateTime
$end = [DateTimeOffset]::Parse($env:SOULFORGE_OUTLOOK_WINDOW_END).LocalDateTime
$maxItems = [int]$env:SOULFORGE_OUTLOOK_MAX_ITEMS
$staging = $env:SOULFORGE_OUTLOOK_STAGING
$manifest = $env:SOULFORGE_OUTLOOK_MANIFEST
$records = [System.Collections.Generic.List[object]]::new()
$gapCodes = [System.Collections.Generic.List[string]]::new()
$truncated = $false

$application = [Runtime.InteropServices.Marshal]::GetActiveObject('Outlook.Application')
$session = $application.Session
$folder = $session.GetDefaultFolder(5)
$storeId = [string]$folder.StoreID
$folderId = [string]$folder.EntryID
$storeFingerprint = Get-Sha256Text $storeId
$folderFingerprint = Get-Sha256Text ($storeId + [char]0 + $folderId)
if (
  $storeFingerprint -ne $env:SOULFORGE_OUTLOOK_EXPECTED_STORE -or
  $folderFingerprint -ne $env:SOULFORGE_OUTLOOK_EXPECTED_FOLDER
) {
  throw 'outlook_sent_default_folder_pin_mismatch'
}
$items = $folder.Items
$items.Sort('[SentOn]', $true)
$scanned = 0
$reachedStart = $false
$scanLimit = [Math]::Min($items.Count, $maxItems)

for ($index = 1; $index -le $scanLimit; $index++) {
  $scanned += 1
  $item = $null
  try { $item = $items.Item($index) } catch { $gapCodes.Add('item_read_failed'); continue }
  if ($null -eq $item) { continue }
  try {
    if ([int]$item.Class -ne 43) { continue }
    $sentOn = [datetime]$item.SentOn
    if ($sentOn -ge $end) { continue }
    if ($sentOn -lt $start) { $reachedStart = $true; break }

    $messageId = ''
    try {
      $messageId = [string]$item.PropertyAccessor.GetProperty(
        'http://schemas.microsoft.com/mapi/proptag/0x1035001F'
      )
    } catch {
      try {
        $messageId = [string]$item.PropertyAccessor.GetProperty(
          'http://schemas.microsoft.com/mapi/proptag/0x1035001E'
        )
      } catch { $messageId = '' }
    }
    $entryId = [string]$item.EntryID
    $nativeFingerprint = Get-Sha256Text ($storeId + [char]0 + $entryId)
    $recipients = [System.Collections.Generic.List[object]]::new()
    foreach ($recipient in $item.Recipients) {
      $role = switch ([int]$recipient.Type) { 1 { 'to' } 2 { 'cc' } 3 { 'bcc' } default { 'unknown' } }
      $address = ''
      try { $address = [string]$recipient.Address } catch { $address = '' }
      $resolved = $false
      try { $resolved = [bool]$recipient.Resolved } catch { $resolved = $false }
      if ((-not $resolved) -or [string]::IsNullOrWhiteSpace($address)) {
        $role = 'unknown'
        $address = [string]$recipient.Name
      }
      $recipients.Add([ordered]@{
        role = $role
        party_ref = 'party:' + (Get-Sha256Text ($address.Trim().ToLowerInvariant())).Substring(7)
      })
    }
    $temporaryPath = [IO.Path]::Combine($staging, ([guid]::NewGuid().ToString('N') + '.msg'))
    $item.SaveAs($temporaryPath, 9)
    $records.Add([ordered]@{
      staged_msg = $temporaryPath
      rfc_message_id = $messageId.Trim()
      native_observation_fingerprint = $nativeFingerprint
      sent_at = ([DateTimeOffset]$sentOn).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
      recipients = $recipients
    })
  } catch {
    $gapCodes.Add('item_export_failed')
  }
}
if (($items.Count -gt $scanLimit) -and (-not $reachedStart)) { $truncated = $true }

$payload = [ordered]@{
  store_fingerprint = $storeFingerprint
  folder_fingerprint = $folderFingerprint
  records = $records
  truncated = $truncated
  gap_codes = @($gapCodes | Sort-Object -Unique)
}
[IO.File]::WriteAllText(
  $manifest,
  ($payload | ConvertTo-Json -Depth 8 -Compress),
  [System.Text.UTF8Encoding]::new($false)
)
"""


def _export_with_active_outlook(
    config: OutlookSentConfig,
    staging_root: Path,
    start: datetime,
    end: datetime,
) -> Mapping[str, Any]:
    if os.name != "nt":
        raise OutlookSentError("outlook_sent_windows_required")
    system_root = Path(str(os.environ.get("SystemRoot") or "").strip())
    powershell = (
        system_root
        / "System32"
        / "WindowsPowerShell"
        / "v1.0"
        / "powershell.exe"
    )
    if not system_root.is_absolute() or not powershell.is_file():
        raise OutlookSentError("outlook_sent_powershell_unavailable")
    manifest = staging_root / "export.json"
    env = dict(os.environ)
    env.update(
        {
            "SOULFORGE_OUTLOOK_WINDOW_START": _iso(start),
            "SOULFORGE_OUTLOOK_WINDOW_END": _iso(end),
            "SOULFORGE_OUTLOOK_MAX_ITEMS": str(config.max_items),
            "SOULFORGE_OUTLOOK_STAGING": str(staging_root),
            "SOULFORGE_OUTLOOK_MANIFEST": str(manifest),
            "SOULFORGE_OUTLOOK_EXPECTED_STORE": config.default_store_fingerprint,
            "SOULFORGE_OUTLOOK_EXPECTED_FOLDER": config.default_folder_fingerprint,
        }
    )
    try:
        completed = subprocess.run(
            [
                str(powershell),
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                build_outlook_sent_powershell_script(),
            ],
            check=False,
            capture_output=True,
            text=True,
            timeout=300,
            env=env,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise OutlookSentError("outlook_sent_export_failed", retryable=True) from exc
    if completed.returncode != 0:
        raise OutlookSentError("outlook_sent_export_failed", retryable=True)
    try:
        return json.loads(manifest.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise OutlookSentError("outlook_sent_export_invalid") from exc
