from __future__ import annotations

import hashlib
import os
from pathlib import Path
import stat
import sys
from typing import Any, Dict, Optional


_IDENTITY_FIELDS = (
    "dev",
    "ino",
    "size",
    "mtime_ns",
    "birthtime_ns",
    "change_ns",
)


if os.name == "nt":
    import ctypes
    from ctypes import wintypes
    import msvcrt

    _GENERIC_READ = 0x80000000
    _FILE_SHARE_READ = 0x00000001
    _OPEN_EXISTING = 3
    _FILE_FLAG_OPEN_REPARSE_POINT = 0x00200000
    _FILE_ATTRIBUTE_REPARSE_POINT = 0x00000400
    _FILE_TYPE_DISK = 0x0001
    _FILE_BASIC_INFO_CLASS = 0
    _WINDOWS_EPOCH_OFFSET_100NS = 116_444_736_000_000_000

    class _FILE_BASIC_INFO(ctypes.Structure):
        _fields_ = (
            ("CreationTime", ctypes.c_longlong),
            ("LastAccessTime", ctypes.c_longlong),
            ("LastWriteTime", ctypes.c_longlong),
            ("ChangeTime", ctypes.c_longlong),
            ("FileAttributes", wintypes.DWORD),
        )

    _kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    _CreateFileW = _kernel32.CreateFileW
    _CreateFileW.argtypes = (
        wintypes.LPCWSTR,
        wintypes.DWORD,
        wintypes.DWORD,
        wintypes.LPVOID,
        wintypes.DWORD,
        wintypes.DWORD,
        wintypes.HANDLE,
    )
    _CreateFileW.restype = wintypes.HANDLE
    _CloseHandle = _kernel32.CloseHandle
    _CloseHandle.argtypes = (wintypes.HANDLE,)
    _CloseHandle.restype = wintypes.BOOL
    _GetFileInformationByHandleEx = _kernel32.GetFileInformationByHandleEx
    _GetFileInformationByHandleEx.argtypes = (
        wintypes.HANDLE,
        ctypes.c_int,
        wintypes.LPVOID,
        wintypes.DWORD,
    )
    _GetFileInformationByHandleEx.restype = wintypes.BOOL
    _GetFileType = _kernel32.GetFileType
    _GetFileType.argtypes = (wintypes.HANDLE,)
    _GetFileType.restype = wintypes.DWORD
    _INVALID_HANDLE_VALUE = ctypes.c_void_p(-1).value


class CredentialIdentityError(RuntimeError):
    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


def _identity_from_descriptor(descriptor: int, *, unsafe_code: str) -> Dict[str, str]:
    try:
        info = os.fstat(descriptor)
    except OSError as exc:
        raise CredentialIdentityError(unsafe_code) from exc
    if not stat.S_ISREG(info.st_mode):
        raise CredentialIdentityError(unsafe_code)

    if os.name == "nt":
        try:
            os_handle = msvcrt.get_osfhandle(descriptor)
        except OSError as exc:
            raise CredentialIdentityError(unsafe_code) from exc
        handle = wintypes.HANDLE(os_handle)
        basic = _FILE_BASIC_INFO()
        if _GetFileType(handle) != _FILE_TYPE_DISK or not _GetFileInformationByHandleEx(
            handle,
            _FILE_BASIC_INFO_CLASS,
            ctypes.byref(basic),
            ctypes.sizeof(basic),
        ):
            raise CredentialIdentityError(unsafe_code)
        if basic.FileAttributes & _FILE_ATTRIBUTE_REPARSE_POINT:
            raise CredentialIdentityError(unsafe_code)

        def windows_time_ns(value: int) -> int:
            return (int(value) - _WINDOWS_EPOCH_OFFSET_100NS) * 100

        dev = info.st_dev & 0xFFFFFFFF
        mtime_ns = windows_time_ns(basic.LastWriteTime)
        birthtime_ns = windows_time_ns(basic.CreationTime)
        change_ns = windows_time_ns(basic.ChangeTime)
    else:
        dev = info.st_dev
        mtime_ns = info.st_mtime_ns
        birthtime_ns = getattr(info, "st_birthtime_ns", 0)
        change_ns = info.st_ctime_ns

    return {
        "dev": str(dev),
        "ino": str(info.st_ino),
        "size": str(info.st_size),
        "mtime_ns": str(mtime_ns),
        "birthtime_ns": str(birthtime_ns),
        "change_ns": str(change_ns),
    }


def _open_readonly(path: Path, *, unsafe_code: str) -> int:
    if os.name != "nt":
        flags = (
            os.O_RDONLY
            | getattr(os, "O_BINARY", 0)
            | getattr(os, "O_CLOEXEC", 0)
            | getattr(os, "O_NOFOLLOW", 0)
        )
        try:
            return os.open(path, flags)
        except OSError as exc:
            raise CredentialIdentityError(unsafe_code) from exc

    handle = _CreateFileW(
        os.fspath(path),
        _GENERIC_READ,
        _FILE_SHARE_READ,
        None,
        _OPEN_EXISTING,
        _FILE_FLAG_OPEN_REPARSE_POINT,
        None,
    )
    if handle in (None, _INVALID_HANDLE_VALUE):
        raise CredentialIdentityError(unsafe_code)
    try:
        descriptor = msvcrt.open_osfhandle(
            int(handle),
            os.O_RDONLY | getattr(os, "O_BINARY", 0),
        )
    except (OSError, OverflowError) as exc:
        _CloseHandle(handle)
        raise CredentialIdentityError(unsafe_code) from exc
    try:
        _identity_from_descriptor(descriptor, unsafe_code=unsafe_code)
    except Exception:
        os.close(descriptor)
        raise
    return descriptor


def normalize_identity(value: Any, *, invalid_code: str) -> Dict[str, str]:
    if not isinstance(value, dict) or set(value) != set(_IDENTITY_FIELDS):
        raise CredentialIdentityError(invalid_code)
    normalized: Dict[str, str] = {}
    for field in _IDENTITY_FIELDS:
        raw = value.get(field)
        if not isinstance(raw, str) or not raw.isdigit() or str(int(raw)) != raw:
            raise CredentialIdentityError(invalid_code)
        normalized[field] = raw
    return normalized


def file_identity(path: Path, *, unsafe_code: str) -> Dict[str, str]:
    descriptor: Optional[int] = None
    try:
        descriptor = _open_readonly(Path(path), unsafe_code=unsafe_code)
        return _identity_from_descriptor(descriptor, unsafe_code=unsafe_code)
    except CredentialIdentityError:
        raise
    except OSError as exc:
        raise CredentialIdentityError(unsafe_code) from exc
    finally:
        if descriptor is not None:
            os.close(descriptor)


def read_pinned_bytes(
    path: Path,
    *,
    expected_identity: Optional[Dict[str, str]] = None,
    unsafe_code: str,
    mismatch_code: str,
) -> bytes:
    path = Path(path)
    expected = (
        normalize_identity(expected_identity, invalid_code=mismatch_code)
        if expected_identity is not None
        else file_identity(path, unsafe_code=unsafe_code)
    )
    before = file_identity(path, unsafe_code=unsafe_code)
    if before != expected:
        raise CredentialIdentityError(mismatch_code)

    descriptor: Optional[int] = None
    try:
        descriptor = _open_readonly(path, unsafe_code=unsafe_code)
        opened = _identity_from_descriptor(descriptor, unsafe_code=unsafe_code)
        if opened != expected:
            raise CredentialIdentityError(mismatch_code)
        chunks = []
        while True:
            chunk = os.read(descriptor, 1024 * 1024)
            if not chunk:
                break
            chunks.append(chunk)
        if _identity_from_descriptor(descriptor, unsafe_code=unsafe_code) != expected:
            raise CredentialIdentityError(mismatch_code)
    finally:
        if descriptor is not None:
            os.close(descriptor)

    if file_identity(path, unsafe_code=unsafe_code) != expected:
        raise CredentialIdentityError(mismatch_code)
    return b"".join(chunks)


def read_pinned_text(
    path: Path,
    *,
    expected_identity: Optional[Dict[str, str]] = None,
    unsafe_code: str = "mail_credential_file_unsafe",
    mismatch_code: str = "mail_credential_identity_mismatch",
) -> str:
    try:
        return read_pinned_bytes(
            path,
            expected_identity=expected_identity,
            unsafe_code=unsafe_code,
            mismatch_code=mismatch_code,
        ).decode("utf-8")
    except UnicodeDecodeError as exc:
        raise CredentialIdentityError(unsafe_code) from exc


def assert_runtime_identity(expected_identity: Dict[str, str], expected_sha256: str) -> None:
    if not isinstance(expected_sha256, str) or len(expected_sha256) != 64:
        raise CredentialIdentityError("mail_runtime_identity_manifest_invalid")
    try:
        int(expected_sha256, 16)
    except ValueError as exc:
        raise CredentialIdentityError("mail_runtime_identity_manifest_invalid") from exc

    expected = normalize_identity(
        expected_identity,
        invalid_code="mail_runtime_identity_manifest_invalid",
    )
    proc_exe = Path("/proc/self/exe")
    if proc_exe.exists():
        descriptor: Optional[int] = None
        try:
            descriptor = os.open(proc_exe, os.O_RDONLY)
        except OSError as exc:
            raise CredentialIdentityError("mail_runtime_identity_unsafe") from exc
        try:
            opened = _identity_from_descriptor(
                descriptor,
                unsafe_code="mail_runtime_identity_unsafe",
            )
            if opened != expected:
                raise CredentialIdentityError("mail_runtime_identity_mismatch")
            chunks = []
            while True:
                chunk = os.read(descriptor, 1024 * 1024)
                if not chunk:
                    break
                chunks.append(chunk)
            if _identity_from_descriptor(
                descriptor,
                unsafe_code="mail_runtime_identity_unsafe",
            ) != expected:
                raise CredentialIdentityError("mail_runtime_identity_mismatch")
        finally:
            os.close(descriptor)
        payload = b"".join(chunks)
    else:
        payload = read_pinned_bytes(
            Path(sys.executable),
            expected_identity=expected,
            unsafe_code="mail_runtime_identity_unsafe",
            mismatch_code="mail_runtime_identity_mismatch",
        )
    if hashlib.sha256(payload).hexdigest() != expected_sha256:
        raise CredentialIdentityError("mail_runtime_identity_mismatch")
