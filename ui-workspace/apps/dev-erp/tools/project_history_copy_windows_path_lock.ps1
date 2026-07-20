param(
  [Parameter(Mandatory = $true)][string]$SpecPath,
  [Parameter(Mandatory = $true)][string]$ReadyPath,
  [Parameter(Mandatory = $true)][string]$ReleasePath,
  [Parameter(Mandatory = $true)][string]$ResultPath,
  [Parameter(Mandatory = $true)][string]$AddCommandPath,
  [Parameter(Mandatory = $true)][string]$AddAckPath,
  [Parameter(Mandatory = $true)][string]$RenameCommandPath,
  [Parameter(Mandatory = $true)][string]$RenameAckPath,
  [Parameter(Mandatory = $true)][int]$ParentProcessId
)

$ErrorActionPreference = "Stop"

Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Win32.SafeHandles;

public static class SoulforgeProjectHistoryPathLock {
    private const uint DELETE = 0x00010000;
    private const uint GENERIC_READ = 0x80000000;
    private const uint FILE_LIST_DIRECTORY = 0x00000001;
    private const uint FILE_ADD_FILE = 0x00000002;
    private const uint FILE_ADD_SUBDIRECTORY = 0x00000004;
    private const uint FILE_SHARE_READ = 0x00000001;
    private const uint FILE_SHARE_WRITE = 0x00000002;
    private const uint OPEN_EXISTING = 3;
    private const uint FILE_ATTRIBUTE_DIRECTORY = 0x00000010;
    private const uint FILE_ATTRIBUTE_REPARSE_POINT = 0x00000400;
    private const uint FILE_FLAG_BACKUP_SEMANTICS = 0x02000000;
    private const uint FILE_FLAG_OPEN_REPARSE_POINT = 0x00200000;

    [StructLayout(LayoutKind.Sequential)]
    private struct FILETIME {
        public uint Low;
        public uint High;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct BY_HANDLE_FILE_INFORMATION {
        public uint FileAttributes;
        public FILETIME CreationTime;
        public FILETIME LastAccessTime;
        public FILETIME LastWriteTime;
        public uint VolumeSerialNumber;
        public uint FileSizeHigh;
        public uint FileSizeLow;
        public uint NumberOfLinks;
        public uint FileIndexHigh;
        public uint FileIndexLow;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeFileHandle CreateFileW(
        string fileName,
        uint desiredAccess,
        uint shareMode,
        IntPtr securityAttributes,
        uint creationDisposition,
        uint flagsAndAttributes,
        IntPtr templateFile
    );

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetFileInformationByHandle(
        SafeFileHandle file,
        out BY_HANDLE_FILE_INFORMATION information
    );

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool ReadFile(
        SafeFileHandle file,
        IntPtr buffer,
        uint bytesToRead,
        out uint bytesRead,
        IntPtr overlapped
    );

    [StructLayout(LayoutKind.Sequential)]
    private struct IO_STATUS_BLOCK {
        public IntPtr Status;
        public UIntPtr Information;
    }

    [DllImport("ntdll.dll")]
    private static extern int NtSetInformationFile(
        SafeFileHandle file,
        out IO_STATUS_BLOCK ioStatusBlock,
        IntPtr information,
        uint bufferSize,
        int informationClass
    );

    [DllImport("ntdll.dll")]
    private static extern uint RtlNtStatusToDosError(int status);

    public static SafeFileHandle OpenAndVerify(
        string path,
        string expectedVolume,
        string expectedFileIndex,
        bool directory,
        bool renameCapable
    ) {
        // A retained database identity handle must coexist with SQLite's
        // already-open read/write handle. GENERIC_READ plus no
        // FILE_SHARE_DELETE still denies a later rename/delete without
        // requesting DELETE access that SQLite does not share. Directory and
        // rename-capable handles retain DELETE access for handle-relative
        // publication operations.
        uint access = (!directory && !renameCapable) ? GENERIC_READ : DELETE;
        if (directory) {
            access |= FILE_LIST_DIRECTORY | FILE_ADD_FILE | FILE_ADD_SUBDIRECTORY;
        }
        uint flags = FILE_FLAG_OPEN_REPARSE_POINT;
        if (directory) flags |= FILE_FLAG_BACKUP_SEMANTICS;
        SafeFileHandle handle = CreateFileW(
            path,
            access,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            IntPtr.Zero,
            OPEN_EXISTING,
            flags,
            IntPtr.Zero
        );
        if (handle.IsInvalid) {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "CreateFileW path lock failed");
        }
        BY_HANDLE_FILE_INFORMATION information;
        if (!GetFileInformationByHandle(handle, out information)) {
            int error = Marshal.GetLastWin32Error();
            handle.Dispose();
            throw new Win32Exception(error, "GetFileInformationByHandle failed");
        }
        bool actualDirectory = (information.FileAttributes & FILE_ATTRIBUTE_DIRECTORY) != 0;
        if ((information.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0
            || actualDirectory != directory) {
            handle.Dispose();
            throw new InvalidOperationException("locked path is a reparse point or has the wrong kind");
        }
        ulong fileIndex = ((ulong)information.FileIndexHigh << 32) | information.FileIndexLow;
        if (information.VolumeSerialNumber.ToString() != expectedVolume
            || fileIndex.ToString() != expectedFileIndex) {
            handle.Dispose();
            throw new InvalidOperationException("locked path identity differs from the expected file id");
        }
        return handle;
    }

    public static SafeFileHandle OpenAndVerifyAuthority(
        string path,
        string expectedVolume,
        string expectedFileIndex,
        uint expectedLinks,
        long expectedSize,
        string expectedSha256
    ) {
        SafeFileHandle handle = CreateFileW(
            path,
            GENERIC_READ,
            FILE_SHARE_READ,
            IntPtr.Zero,
            OPEN_EXISTING,
            FILE_FLAG_OPEN_REPARSE_POINT,
            IntPtr.Zero
        );
        if (handle.IsInvalid) {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "CreateFileW authority lock failed");
        }
        try {
            BY_HANDLE_FILE_INFORMATION information;
            if (!GetFileInformationByHandle(handle, out information)) {
                throw new Win32Exception(Marshal.GetLastWin32Error(), "Authority identity read failed");
            }
            bool isDirectory = (information.FileAttributes & FILE_ATTRIBUTE_DIRECTORY) != 0;
            ulong fileIndex = ((ulong)information.FileIndexHigh << 32) | information.FileIndexLow;
            long fileSize = ((long)information.FileSizeHigh << 32) | information.FileSizeLow;
            if (isDirectory || (information.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0
                || information.VolumeSerialNumber.ToString() != expectedVolume
                || fileIndex.ToString() != expectedFileIndex
                || information.NumberOfLinks != expectedLinks
                || fileSize != expectedSize || fileSize < 1 || fileSize > 65536) {
                throw new InvalidOperationException("Authority lock identity or bounded size differs");
            }
            IntPtr buffer = Marshal.AllocHGlobal((int)fileSize);
            try {
                uint total = 0;
                while (total < fileSize) {
                    uint read;
                    if (!ReadFile(
                        handle,
                        IntPtr.Add(buffer, (int)total),
                        (uint)(fileSize - total),
                        out read,
                        IntPtr.Zero
                    )) {
                        throw new Win32Exception(Marshal.GetLastWin32Error(), "Authority bytes read failed");
                    }
                    if (read == 0) throw new InvalidOperationException("Authority bytes ended early");
                    total += read;
                }
                byte[] bytes = new byte[fileSize];
                Marshal.Copy(buffer, bytes, 0, bytes.Length);
                string digest;
                using (SHA256 sha256 = SHA256.Create()) {
                    digest = "sha256:" + BitConverter.ToString(sha256.ComputeHash(bytes))
                        .Replace("-", "").ToLowerInvariant();
                }
                if (!String.Equals(digest, expectedSha256, StringComparison.Ordinal)) {
                    throw new InvalidOperationException("Authority bytes differ from the pinned digest");
                }
            } finally {
                Marshal.FreeHGlobal(buffer);
            }
            return handle;
        } catch {
            handle.Dispose();
            throw;
        }
    }

    public static void AssertAuthorityWindow(long notBeforeUnixMs, long expiresAtUnixMs) {
        long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        if (now < notBeforeUnixMs || now >= expiresAtUnixMs) {
            throw new InvalidOperationException("Trusted current time is outside the retained authority window");
        }
    }

    public static void RenameByHandle(
        SafeFileHandle handle,
        SafeFileHandle rootDirectory,
        string relativeName,
        bool replace
    ) {
        string[] segments = relativeName.Split(new char[] { '\\', '/' });
        if (Path.IsPathRooted(relativeName) || segments.Length == 0) {
            throw new InvalidOperationException("rename target must stay below the retained root handle");
        }
        foreach (string segment in segments) {
            if (segment.Length == 0 || segment == "." || segment == ".." || segment.Contains(":")) {
                throw new InvalidOperationException("rename target contains an unsafe relative segment");
            }
        }
        byte[] name = Encoding.Unicode.GetBytes(relativeName);
        const int fileNameOffset = 20;
        IntPtr buffer = Marshal.AllocHGlobal(fileNameOffset + name.Length);
        try {
            for (int index = 0; index < fileNameOffset; index++) Marshal.WriteByte(buffer, index, 0);
            Marshal.WriteByte(buffer, 0, replace ? (byte)1 : (byte)0);
            Marshal.WriteIntPtr(buffer, 8, rootDirectory.DangerousGetHandle());
            Marshal.WriteInt32(buffer, 16, name.Length);
            Marshal.Copy(name, 0, IntPtr.Add(buffer, fileNameOffset), name.Length);
            IO_STATUS_BLOCK ioStatusBlock;
            int status = NtSetInformationFile(
                handle,
                out ioStatusBlock,
                buffer,
                (uint)(fileNameOffset + name.Length),
                10
            );
            if (status != 0) {
                throw new Win32Exception((int)RtlNtStatusToDosError(status), "handle-relative rename failed");
            }
        } finally {
            Marshal.FreeHGlobal(buffer);
        }
    }
}
'@

$handles = New-Object System.Collections.Generic.List[Microsoft.Win32.SafeHandles.SafeFileHandle]
$renameHandle = $null
$renameRootHandle = $null
$authorityNotBeforeUnixMs = $null
$authorityExpiresAtUnixMs = $null
try {
  $spec = Get-Content -Raw -LiteralPath $SpecPath | ConvertFrom-Json
  foreach ($entry in $spec.locks) {
    $handle = [SoulforgeProjectHistoryPathLock]::OpenAndVerify(
      [string]$entry.path,
      [string]$entry.dev,
      [string]$entry.ino,
      [bool]$entry.directory,
      [bool]$entry.rename_capable
    )
    $handles.Add($handle)
    if ([bool]$entry.rename_capable) {
      if ($null -ne $renameHandle) { throw "Only one rename-capable handle is allowed" }
      $renameHandle = $handle
    }
  }
  if ($null -ne $spec.authority) {
    $authorityHandle = [SoulforgeProjectHistoryPathLock]::OpenAndVerifyAuthority(
      [string]$spec.authority.path,
      [string]$spec.authority.dev,
      [string]$spec.authority.ino,
      [uint32]$spec.authority.nlink,
      [int64]$spec.authority.size,
      [string]$spec.authority.sha256
    )
    $handles.Add($authorityHandle)
    $authorityNotBeforeUnixMs = [int64]$spec.authority.not_before_unix_ms
    $authorityExpiresAtUnixMs = [int64]$spec.authority.expires_at_unix_ms
    [SoulforgeProjectHistoryPathLock]::AssertAuthorityWindow(
      $authorityNotBeforeUnixMs,
      $authorityExpiresAtUnixMs
    )
  }
  if ($null -ne $renameHandle) { $renameRootHandle = $handles[0] }
  [System.IO.File]::WriteAllText($ReadyPath, "ready")
  $added = $false
  $renamed = $false
  while (-not (Test-Path -LiteralPath $ReleasePath)) {
    if (-not $added -and (Test-Path -LiteralPath $AddCommandPath)) {
      if ($null -ne $renameHandle) { throw "A rename-capable handle already exists" }
      $entry = Get-Content -Raw -LiteralPath $AddCommandPath | ConvertFrom-Json
      $renameHandle = [SoulforgeProjectHistoryPathLock]::OpenAndVerify(
        [string]$entry.path,
        [string]$entry.dev,
        [string]$entry.ino,
        [bool]$entry.directory,
        $true
      )
      $handles.Add($renameHandle)
      $renameRootHandle = $handles[0]
      $added = $true
      [System.IO.File]::WriteAllText($AddAckPath, "added")
    }
    if (-not $renamed -and (Test-Path -LiteralPath $RenameCommandPath)) {
      if ($null -eq $renameHandle -or $null -eq $renameRootHandle) {
        throw "No rename-capable handle/root pair was opened"
      }
      $command = Get-Content -Raw -LiteralPath $RenameCommandPath | ConvertFrom-Json
      if ($null -ne $authorityNotBeforeUnixMs) {
        [SoulforgeProjectHistoryPathLock]::AssertAuthorityWindow(
          $authorityNotBeforeUnixMs,
          $authorityExpiresAtUnixMs
        )
      }
      [SoulforgeProjectHistoryPathLock]::RenameByHandle(
        $renameHandle,
        $renameRootHandle,
        [string]$command.relative_name,
        [bool]$command.replace
      )
      $renamed = $true
      [System.IO.File]::WriteAllText($RenameAckPath, "renamed")
    }
    if ($null -eq (Get-Process -Id $ParentProcessId -ErrorAction SilentlyContinue)) { break }
    Start-Sleep -Milliseconds 10
  }
  foreach ($handle in $handles) { $handle.Dispose() }
  $handles.Clear()
  [System.IO.File]::WriteAllText($ResultPath, "ok")
} catch {
  foreach ($handle in $handles) { $handle.Dispose() }
  $handles.Clear()
  $failure = $_.Exception
  while ($null -ne $failure.InnerException) { $failure = $failure.InnerException }
  $nativeCode = if ($failure -is [System.ComponentModel.Win32Exception]) {
    [string]$failure.NativeErrorCode
  } else {
    "none"
  }
  [System.IO.File]::WriteAllText(
    $ResultPath,
    "error: native=$nativeCode message=$($failure.Message)"
  )
  exit 1
}
