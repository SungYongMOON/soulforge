from __future__ import annotations

from dataclasses import dataclass
import hashlib
import os
from pathlib import Path, PurePosixPath
import stat
from typing import Optional
from uuid import uuid4


_REPARSE_POINT_ATTRIBUTE = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x00000400)


if os.name == "nt":
    import ctypes
    from ctypes import wintypes
    import msvcrt

    _GENERIC_READ = 0x80000000
    _DELETE = 0x00010000
    _FILE_READ_ATTRIBUTES = 0x00000080
    _FILE_SHARE_READ = 0x00000001
    _FILE_SHARE_WRITE = 0x00000002
    _OPEN_EXISTING = 3
    _FILE_ATTRIBUTE_DIRECTORY = 0x00000010
    _FILE_FLAG_BACKUP_SEMANTICS = 0x02000000
    _FILE_FLAG_OPEN_REPARSE_POINT = 0x00200000

    class _FILETIME(ctypes.Structure):
        _fields_ = (("low", wintypes.DWORD), ("high", wintypes.DWORD))

    class _BY_HANDLE_FILE_INFORMATION(ctypes.Structure):
        _fields_ = (
            ("file_attributes", wintypes.DWORD),
            ("creation_time", _FILETIME),
            ("last_access_time", _FILETIME),
            ("last_write_time", _FILETIME),
            ("volume_serial_number", wintypes.DWORD),
            ("file_size_high", wintypes.DWORD),
            ("file_size_low", wintypes.DWORD),
            ("number_of_links", wintypes.DWORD),
            ("file_index_high", wintypes.DWORD),
            ("file_index_low", wintypes.DWORD),
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
    _GetFileInformationByHandle = _kernel32.GetFileInformationByHandle
    _GetFileInformationByHandle.argtypes = (
        wintypes.HANDLE,
        ctypes.POINTER(_BY_HANDLE_FILE_INFORMATION),
    )
    _GetFileInformationByHandle.restype = wintypes.BOOL
    _INVALID_HANDLE_VALUE = ctypes.c_void_p(-1).value


class SourceCustodyError(RuntimeError):
    def __init__(self, code: str, *, retryable: bool = False) -> None:
        self.code = code
        self.retryable = retryable
        super().__init__(code)


@dataclass(frozen=True)
class SourceCustodyRecord:
    sha256: str
    size: int
    storage_ref: str
    written: bool

    def to_metadata(self) -> dict[str, object]:
        return {
            "sha256": self.sha256,
            "size": self.size,
            "storage_ref": self.storage_ref,
            "media_type": "message/rfc822",
        }


def _absolute_path(path: Path) -> Path:
    return Path(os.path.abspath(os.fspath(Path(path).expanduser())))


def _is_reparse_or_link(info: os.stat_result) -> bool:
    return stat.S_ISLNK(info.st_mode) or bool(
        int(getattr(info, "st_file_attributes", 0)) & _REPARSE_POINT_ATTRIBUTE
    )


def _lstat(path: Path, *, missing_ok: bool = False) -> Optional[os.stat_result]:
    try:
        return os.lstat(path)
    except FileNotFoundError:
        if missing_ok:
            return None
        raise SourceCustodyError("source_custody_path_missing") from None
    except OSError as exc:
        raise SourceCustodyError("source_custody_path_inspection_failed", retryable=True) from exc


def _assert_directory(path: Path) -> None:
    info = _lstat(path)
    if info is None:
        raise SourceCustodyError("source_custody_path_missing")
    if _is_reparse_or_link(info):
        raise SourceCustodyError("source_custody_reparse_forbidden")
    if not stat.S_ISDIR(info.st_mode):
        raise SourceCustodyError("source_custody_path_not_directory")


def _ensure_safe_directory_chain(path: Path) -> None:
    absolute = _absolute_path(path)
    anchor = Path(absolute.anchor)
    if not anchor:
        raise SourceCustodyError("source_custody_root_not_absolute")

    _assert_directory(anchor)
    current = anchor
    for part in absolute.parts[1:]:
        current = current / part
        info = _lstat(current, missing_ok=True)
        if info is None:
            try:
                current.mkdir()
            except FileExistsError:
                pass
            except OSError as exc:
                raise SourceCustodyError("source_custody_directory_create_failed", retryable=True) from exc
        _assert_directory(current)


def _assert_contained(root: Path, candidate: Path) -> None:
    root_key = os.path.normcase(os.fspath(_absolute_path(root)))
    candidate_key = os.path.normcase(os.fspath(_absolute_path(candidate)))
    try:
        common = os.path.normcase(os.path.commonpath((root_key, candidate_key)))
    except ValueError as exc:
        raise SourceCustodyError("source_custody_path_escape") from exc
    if common != root_key:
        raise SourceCustodyError("source_custody_path_escape")


def _identity(info: os.stat_result) -> tuple[int, int]:
    try:
        identity = (int(info.st_dev), int(info.st_ino))
    except (AttributeError, TypeError, ValueError) as exc:
        raise SourceCustodyError(
            "source_custody_parent_identity_unavailable", retryable=True
        ) from exc
    if identity == (0, 0):
        raise SourceCustodyError(
            "source_custody_parent_identity_unavailable", retryable=True
        )
    return identity


def _windows_handle_information(handle: int) -> "_BY_HANDLE_FILE_INFORMATION":
    information = _BY_HANDLE_FILE_INFORMATION()
    if not _GetFileInformationByHandle(
        wintypes.HANDLE(handle), ctypes.byref(information)
    ):
        raise SourceCustodyError(
            "source_custody_parent_identity_unavailable", retryable=True
        )
    return information


class _RetainedDirectoryChain:
    """Pin the target directory namespace for the complete publication window."""

    def __init__(self, path: Path) -> None:
        self.path = _absolute_path(path)
        self._windows_handles: list[tuple[int, tuple[int, int]]] = []
        self._posix_descriptors: list[tuple[int, Optional[str], tuple[int, int]]] = []

    def __enter__(self) -> "_RetainedDirectoryChain":
        try:
            if os.name == "nt":
                self._open_windows()
            else:
                self._open_posix()
            self.assert_stable()
        except Exception:
            self.close()
            raise
        return self

    def __exit__(self, _type: object, _value: object, _traceback: object) -> None:
        self.close()

    @property
    def descriptor(self) -> Optional[int]:
        if os.name == "nt":
            return None
        if not self._posix_descriptors:
            raise SourceCustodyError(
                "source_custody_parent_identity_unavailable", retryable=True
            )
        return self._posix_descriptors[-1][0]

    def _open_posix(self) -> None:
        anchor = Path(self.path.anchor)
        if not anchor:
            raise SourceCustodyError("source_custody_root_not_absolute")
        flags = (
            os.O_RDONLY
            | getattr(os, "O_CLOEXEC", 0)
            | getattr(os, "O_DIRECTORY", 0)
            | getattr(os, "O_NOFOLLOW", 0)
        )
        try:
            descriptor = os.open(anchor, flags)
            info = os.fstat(descriptor)
            if not stat.S_ISDIR(info.st_mode):
                raise OSError("directory handle required")
            self._posix_descriptors.append((descriptor, None, _identity(info)))
            for part in self.path.parts[1:]:
                descriptor = os.open(
                    part, flags, dir_fd=self._posix_descriptors[-1][0]
                )
                info = os.fstat(descriptor)
                if not stat.S_ISDIR(info.st_mode) or _is_reparse_or_link(info):
                    raise OSError("safe directory handle required")
                self._posix_descriptors.append((descriptor, part, _identity(info)))
        except (OSError, NotImplementedError) as exc:
            raise SourceCustodyError(
                "source_custody_parent_identity_unavailable", retryable=True
            ) from exc

    def _open_windows(self) -> None:
        anchor = Path(self.path.anchor)
        if not anchor:
            raise SourceCustodyError("source_custody_root_not_absolute")
        current = anchor
        paths = [anchor]
        for part in self.path.parts[1:]:
            current = current / part
            paths.append(current)
        for index, directory in enumerate(paths):
            desired_access = _FILE_READ_ATTRIBUTES
            if index == len(paths) - 1:
                # DELETE access plus omitted FILE_SHARE_DELETE turns the final
                # parent handle into a real rename/delete lock on Windows.
                desired_access |= _DELETE
            handle = _CreateFileW(
                os.fspath(directory),
                desired_access,
                _FILE_SHARE_READ | _FILE_SHARE_WRITE,
                None,
                _OPEN_EXISTING,
                _FILE_FLAG_BACKUP_SEMANTICS | _FILE_FLAG_OPEN_REPARSE_POINT,
                None,
            )
            if handle in (None, _INVALID_HANDLE_VALUE):
                raise SourceCustodyError(
                    "source_custody_parent_identity_unavailable", retryable=True
                )
            native_handle = int(handle)
            try:
                information = _windows_handle_information(native_handle)
                if not information.file_attributes & _FILE_ATTRIBUTE_DIRECTORY:
                    raise SourceCustodyError("source_custody_path_not_directory")
                if information.file_attributes & _REPARSE_POINT_ATTRIBUTE:
                    raise SourceCustodyError("source_custody_reparse_forbidden")
                identity = (
                    int(information.volume_serial_number),
                    (int(information.file_index_high) << 32)
                    | int(information.file_index_low),
                )
                if identity == (0, 0):
                    raise SourceCustodyError(
                        "source_custody_parent_identity_unavailable", retryable=True
                    )
            except Exception:
                _CloseHandle(wintypes.HANDLE(native_handle))
                raise
            self._windows_handles.append((native_handle, identity))

    def assert_stable(self) -> None:
        if os.name == "nt":
            if not self._windows_handles:
                raise SourceCustodyError(
                    "source_custody_parent_identity_unavailable", retryable=True
                )
            for handle, expected_identity in self._windows_handles:
                information = _windows_handle_information(handle)
                identity = (
                    int(information.volume_serial_number),
                    (int(information.file_index_high) << 32)
                    | int(information.file_index_low),
                )
                if (
                    identity != expected_identity
                    or not information.file_attributes & _FILE_ATTRIBUTE_DIRECTORY
                    or information.file_attributes & _REPARSE_POINT_ATTRIBUTE
                ):
                    raise SourceCustodyError(
                        "source_custody_parent_changed", retryable=True
                    )
            return

        if not self._posix_descriptors:
            raise SourceCustodyError(
                "source_custody_parent_identity_unavailable", retryable=True
            )
        for index, (descriptor, name, expected_identity) in enumerate(
            self._posix_descriptors
        ):
            try:
                opened = os.fstat(descriptor)
                if not stat.S_ISDIR(opened.st_mode) or _identity(opened) != expected_identity:
                    raise SourceCustodyError(
                        "source_custody_parent_changed", retryable=True
                    )
                if name is not None:
                    current = os.stat(
                        name,
                        dir_fd=self._posix_descriptors[index - 1][0],
                        follow_symlinks=False,
                    )
                    if (
                        not stat.S_ISDIR(current.st_mode)
                        or _is_reparse_or_link(current)
                        or _identity(current) != expected_identity
                    ):
                        raise SourceCustodyError(
                            "source_custody_parent_changed", retryable=True
                        )
            except SourceCustodyError:
                raise
            except (OSError, NotImplementedError) as exc:
                raise SourceCustodyError(
                    "source_custody_parent_changed", retryable=True
                ) from exc

    def close(self) -> None:
        while self._posix_descriptors:
            descriptor, _, _ = self._posix_descriptors.pop()
            try:
                os.close(descriptor)
            except OSError:
                pass
        while self._windows_handles:
            handle, _ = self._windows_handles.pop()
            _CloseHandle(wintypes.HANDLE(handle))

    def path_for(self, name: str) -> Path:
        return self.path / name


def _lstat_at(
    directory: _RetainedDirectoryChain, name: str, *, missing_ok: bool = False
) -> Optional[os.stat_result]:
    if os.name == "nt":
        return _lstat(directory.path_for(name), missing_ok=missing_ok)
    try:
        return os.stat(name, dir_fd=directory.descriptor, follow_symlinks=False)
    except FileNotFoundError:
        if missing_ok:
            return None
        raise SourceCustodyError("source_custody_path_missing") from None
    except (OSError, NotImplementedError) as exc:
        raise SourceCustodyError(
            "source_custody_path_inspection_failed", retryable=True
        ) from exc


def _open_readonly_at(directory: _RetainedDirectoryChain, name: str) -> int:
    if os.name != "nt":
        flags = (
            os.O_RDONLY
            | getattr(os, "O_BINARY", 0)
            | getattr(os, "O_CLOEXEC", 0)
            | getattr(os, "O_NOFOLLOW", 0)
        )
        try:
            return os.open(name, flags, dir_fd=directory.descriptor)
        except (OSError, NotImplementedError) as exc:
            raise SourceCustodyError("source_custody_file_open_failed") from exc

    handle = _CreateFileW(
        os.fspath(directory.path_for(name)),
        _GENERIC_READ,
        _FILE_SHARE_READ,
        None,
        _OPEN_EXISTING,
        _FILE_FLAG_OPEN_REPARSE_POINT,
        None,
    )
    if handle in (None, _INVALID_HANDLE_VALUE):
        raise SourceCustodyError("source_custody_file_open_failed")
    try:
        descriptor = msvcrt.open_osfhandle(
            int(handle), os.O_RDONLY | getattr(os, "O_BINARY", 0)
        )
    except (OSError, OverflowError) as exc:
        _CloseHandle(handle)
        raise SourceCustodyError("source_custody_file_open_failed") from exc
    return descriptor


def _file_stability(info: os.stat_result) -> tuple[int, int, int, int]:
    return (
        *_identity(info),
        int(info.st_size),
        int(info.st_mtime_ns),
    )


def _assert_exact_file_at(
    directory: _RetainedDirectoryChain,
    name: str,
    expected: bytes,
    *,
    mismatch_code: str,
) -> None:
    info = _lstat_at(directory, name)
    if info is None or _is_reparse_or_link(info) or not stat.S_ISREG(info.st_mode):
        raise SourceCustodyError(mismatch_code)
    if info.st_size != len(expected):
        raise SourceCustodyError(mismatch_code)

    try:
        descriptor = _open_readonly_at(directory, name)
    except SourceCustodyError as exc:
        raise SourceCustodyError(mismatch_code) from exc
    try:
        opened = os.fstat(descriptor)
        expected_stability = _file_stability(opened)
        if (
            not stat.S_ISREG(opened.st_mode)
            or _is_reparse_or_link(opened)
            or opened.st_size != len(expected)
            or _identity(info) != _identity(opened)
        ):
            raise SourceCustodyError(mismatch_code)
        offset = 0
        while offset < len(expected):
            chunk = os.read(descriptor, min(1024 * 1024, len(expected) - offset))
            if not chunk or chunk != expected[offset : offset + len(chunk)]:
                raise SourceCustodyError(mismatch_code)
            offset += len(chunk)
        if os.read(descriptor, 1):
            raise SourceCustodyError(mismatch_code)
        if _file_stability(os.fstat(descriptor)) != expected_stability:
            raise SourceCustodyError(mismatch_code)
    finally:
        os.close(descriptor)

    final = _lstat_at(directory, name)
    if (
        final is None
        or _is_reparse_or_link(final)
        or not stat.S_ISREG(final.st_mode)
        or _file_stability(final) != expected_stability
    ):
        raise SourceCustodyError(mismatch_code)


def _remove_if_safe(directory: _RetainedDirectoryChain, name: str) -> None:
    try:
        info = _lstat_at(directory, name, missing_ok=True)
        if info is not None and stat.S_ISREG(info.st_mode) and not _is_reparse_or_link(info):
            if os.name == "nt":
                os.unlink(directory.path_for(name))
            else:
                os.unlink(name, dir_fd=directory.descriptor)
    except (OSError, SourceCustodyError):
        pass


def _write_temporary_at(
    directory: _RetainedDirectoryChain, name: str, payload: bytes
) -> None:
    flags = (
        os.O_WRONLY
        | os.O_CREAT
        | os.O_EXCL
        | getattr(os, "O_BINARY", 0)
        | getattr(os, "O_NOFOLLOW", 0)
    )
    try:
        if os.name == "nt":
            descriptor = os.open(directory.path_for(name), flags, 0o600)
        else:
            descriptor = os.open(name, flags, 0o600, dir_fd=directory.descriptor)
    except (OSError, NotImplementedError) as exc:
        raise SourceCustodyError("source_custody_write_failed", retryable=True) from exc
    try:
        view = memoryview(payload)
        offset = 0
        while offset < len(view):
            written = os.write(descriptor, view[offset:])
            if written <= 0:
                raise SourceCustodyError("source_custody_write_failed", retryable=True)
            offset += written
        os.fsync(descriptor)
    except SourceCustodyError:
        raise
    except OSError as exc:
        raise SourceCustodyError("source_custody_write_failed", retryable=True) from exc
    finally:
        os.close(descriptor)


def _publish_at(directory: _RetainedDirectoryChain, temporary: str, target: str) -> None:
    try:
        if os.name == "nt":
            os.link(directory.path_for(temporary), directory.path_for(target))
        else:
            os.link(
                temporary,
                target,
                src_dir_fd=directory.descriptor,
                dst_dir_fd=directory.descriptor,
                follow_symlinks=False,
            )
    except FileExistsError:
        raise
    except (OSError, NotImplementedError) as exc:
        raise SourceCustodyError("source_custody_publish_failed", retryable=True) from exc


def persist_hiworks_rfc822(source_custody_root: Path, raw_bytes: bytes) -> SourceCustodyRecord:
    """Persist exact RFC822 bytes with atomic, immutable content addressing.

    ``storage_ref`` is relative to ``source_custody_root``. No provider-controlled
    field is used in the path.
    """

    if not isinstance(raw_bytes, bytes):
        raise SourceCustodyError("source_custody_bytes_required")
    root = _absolute_path(source_custody_root)
    digest = hashlib.sha256(raw_bytes).hexdigest()
    storage_ref = PurePosixPath("hiworks", "sha256", digest[:2], f"{digest}.eml").as_posix()
    target = root.joinpath(*storage_ref.split("/"))
    _assert_contained(root, target)

    parent = target.parent
    _ensure_safe_directory_chain(parent)
    _assert_contained(root, target)

    temporary_name = f".{digest}.{uuid4().hex}.partial"
    temporary = parent / temporary_name
    _assert_contained(root, temporary)
    with _RetainedDirectoryChain(parent) as retained_parent:
        retained_parent.assert_stable()
        existing = _lstat_at(retained_parent, target.name, missing_ok=True)
        if existing is not None:
            _assert_exact_file_at(
                retained_parent,
                target.name,
                raw_bytes,
                mismatch_code="source_custody_existing_mismatch",
            )
            retained_parent.assert_stable()
            return SourceCustodyRecord(digest, len(raw_bytes), storage_ref, written=False)

        written = False
        try:
            _write_temporary_at(retained_parent, temporary_name, raw_bytes)
            _assert_exact_file_at(
                retained_parent,
                temporary_name,
                raw_bytes,
                mismatch_code="source_custody_write_failed",
            )
            retained_parent.assert_stable()
            try:
                _publish_at(retained_parent, temporary_name, target.name)
                written = True
            except FileExistsError:
                _assert_exact_file_at(
                    retained_parent,
                    target.name,
                    raw_bytes,
                    mismatch_code="source_custody_existing_mismatch",
                )
            _assert_exact_file_at(
                retained_parent,
                target.name,
                raw_bytes,
                mismatch_code="source_custody_existing_mismatch",
            )
            retained_parent.assert_stable()
            return SourceCustodyRecord(
                digest, len(raw_bytes), storage_ref, written=written
            )
        except SourceCustodyError as exc:
            if written and exc.code == "source_custody_parent_changed":
                _remove_if_safe(retained_parent, target.name)
            raise
        finally:
            _remove_if_safe(retained_parent, temporary_name)
