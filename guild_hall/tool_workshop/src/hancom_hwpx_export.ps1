param(
    [ValidateSet('Preflight', 'Dispatch', 'Worker')][string]$Mode = 'Preflight',
    [string]$RequestPath,
    [string]$RequestSha256
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Set-StrictMode -Version Latest

# Sources: developer.hancom.com/hwpautomation (RegisterModule); Hancom staff
# forum.developer.hancom.com/t/topic/3206 (32-bit module / REG_SZ);
# forum.developer.hancom.com/t/pdf/1438 (SaveAs PDF is file export, not printing).
# Preflight deliberately does not load native code, COM, registry or scheduler.
if ($Mode -eq 'Preflight') {
    [Console]::Out.Write('{"native_checks":"not_run","enabled":false}')
    exit 0
}

$officialDllHash = '9ac5b97c47ac8aed1e8bca27a3eef39411361d8f68c262509f0c40a8f9d21bb6'
$moduleKey = 'Software\HNC\HwpAutomation\Modules'
$rendererRef = 'renderer.hancom_hwpx_pdf:v1'
$hwp = $null; $windows = $null; $window = $null; $registry = $null
$taskFolder = $null; $task = $null; $taskXml = $null; $scheduler = $null
$sourceLock = $null; $copyLock = $null; $aliasOwned = $false; $taskOwned = $false
$mutex = $null; $mutexOwned = $false; $ok = $false; $cleanup = $true; $r = $null
$workerValidated = $false
$taskStoppedVerified = $false

function Assert-True($Condition) { if (-not $Condition) { throw 'native_check_failed' } }
function Get-Hash([string]$File) { return (Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant() }
function Assert-Local([string]$Value, [bool]$Directory = $false, [bool]$CheckLinks = $true) {
    Assert-True ($Value -match '^[A-Za-z]:\\' -and $Value.Substring(2) -notmatch '[:"<>|?*\x00-\x1f]' -and $Value -notmatch '(^|\\)\.\.(\\|$)' -and $Value -notmatch '[. ](\\|$)')
    $full = [IO.Path]::GetFullPath($Value)
    Assert-True ($full -ceq $Value)
    Assert-True (([IO.DriveInfo]::new([IO.Path]::GetPathRoot($full))).DriveType -eq [IO.DriveType]::Fixed)
    $cursor = $full
    while ($cursor) {
        $item = Get-Item -LiteralPath $cursor -Force
        Assert-True (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0)
        $cursor = [IO.Path]::GetDirectoryName($cursor)
    }
    $entry = Get-Item -LiteralPath $full -Force
    Assert-True ($entry.PSIsContainer -eq $Directory)
    if (-not $Directory -and $CheckLinks) { Assert-True ([SoulforgeHwpxNative]::SingleLink($full)) }
    return $full
}
function Assert-Inside([string]$Root, [string]$File) {
    Assert-True ($File.StartsWith($Root.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase))
}
function Assert-SystemPowerShell([string]$File, [string]$Hash) {
    # Only the OS Known Folder's exact 32-bit PowerShell may have servicing
    # hardlinks. Every other pin and all data still require SingleLink below.
    $expected = Join-Path ([Environment]::GetFolderPath([Environment+SpecialFolder]::Windows)) 'SysWOW64\WindowsPowerShell\v1.0\powershell.exe'
    Assert-True ($File -ieq $expected -and $Hash -cmatch '^[a-f0-9]{64}$')
    [void](Assert-Local $File $false $false)
    Assert-True ((Get-Hash $File) -ceq $Hash)
}
function Assert-HwpLocalServer([string]$Server, [string]$ExpectedExecutable) {
    # The caller has already pinned this exact local executable and its hash.
    # Match the complete approved spelling, not a guessed command-line split.
    Assert-True ($ExpectedExecutable -match '^[A-Za-z]:\\' -and $ExpectedExecutable -notmatch '["\x00-\x1f\x7f]' -and [IO.Path]::GetFullPath($ExpectedExecutable) -ceq $ExpectedExecutable -and [IO.Path]::GetExtension($ExpectedExecutable) -ieq '.exe')
    Assert-True ($Server.Length -le 4096 -and $Server -notmatch '[\x00-\x1f\x7f]')
    $escaped = [regex]::Escape($ExpectedExecutable)
    Assert-True ($Server -imatch ('^(?:"' + $escaped + '"|' + $escaped + ')(?: +[-/]Automation)? *$'))
    if (-not $Server.StartsWith('"')) {
        # An unquoted path with spaces can resolve to an earlier .exe prefix.
        # Refuse an observed competing file. This bounded metadata check retains
        # the trusted-host assumption: it cannot prevent a later external race.
        foreach ($space in [regex]::Matches($ExpectedExecutable, ' ')) {
            $prefix = $ExpectedExecutable.Substring(0, $space.Index)
            if (-not $prefix.EndsWith('.exe', [StringComparison]::OrdinalIgnoreCase)) { $prefix += '.exe' }
            Assert-True (-not (Test-Path -LiteralPath $prefix -PathType Leaf))
        }
    }
}
function Assert-Live {
    Assert-True ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() -lt [long]$r.expires_at)
    Assert-True (-not [IO.File]::Exists((Join-Path $r.run_root 'cancel')))
}
function Get-HwpProcesses { return ,@(Get-Process -Name Hwp -ErrorAction SilentlyContinue) }
function Assert-NoHwp { Assert-True ((Get-HwpProcesses).Count -eq 0) }
function Release-Com($Object) { if ($null -ne $Object) { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($Object) } }
function Write-New([string]$File, [string]$Text) {
    $bytes = [Text.UTF8Encoding]::new($false).GetBytes($Text)
    $stream = [IO.File]::Open($File, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
}

try {
    # Parse only bounded metadata before the enable gate. In particular Add-Type
    # may use compiler temporary files and belongs strictly after this gate.
    if ($Mode -eq 'Worker') {
        Assert-True ($RequestPath -match '^[A-Za-z]:\\' -and (Get-Item -LiteralPath $RequestPath).Length -le 32768)
        Assert-True ($RequestSha256 -match '^[a-f0-9]{64}$' -and (Get-Hash $RequestPath) -eq $RequestSha256)
        $r = [IO.File]::ReadAllText($RequestPath) | ConvertFrom-Json
    } else {
        [Console]::InputEncoding = [Text.UTF8Encoding]::new($false, $true)
        $json = [Console]::In.ReadToEnd()
        Assert-True ($json.Length -le 32768)
        $r = $json | ConvertFrom-Json
    }
    $b = $r.binding
    $bindingKeys = @('enabled','renderer_ref','input_root','output_root','work_root','powershell_executable','powershell_sha256','hwp_executable','hwp_sha256','security_module_dll','security_module_sha256','script_path','script_sha256','user_sid')
    Assert-True (@($b.PSObject.Properties.Name).Count -eq $bindingKeys.Count)
    foreach ($key in $b.PSObject.Properties.Name) { Assert-True ($bindingKeys -ccontains $key) }
    Assert-True ($b.enabled -is [bool] -and $b.enabled -eq $true -and $b.renderer_ref -ceq $rendererRef -and $r.renderer_ref -ceq $rendererRef)
    Assert-True ($b.security_module_sha256 -ceq $officialDllHash)
    Assert-True ($r.run_id -cmatch '^[a-z0-9][a-z0-9-]{7,63}$' -and $r.input_sha256 -cmatch '^[a-f0-9]{64}$')
    Assert-True ($r.task_name -ceq "Soulforge-Hwpx-$($r.run_id)" -and $r.module_name -ceq "SoulforgeHwpx_$($r.run_id)")
    Assert-True ($r.expires_at -is [long] -or $r.expires_at -is [int] -or $r.expires_at -is [double])
    Assert-True ([long]$r.expires_at -le [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()+120000)
    Assert-True (-not [Environment]::Is64BitProcess)
    Assert-True ([Security.Principal.WindowsIdentity]::GetCurrent().User.Value -ceq $b.user_sid)
    Assert-True (-not ([Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator))
    Assert-True ($PSCommandPath -ceq $b.script_path -and (Get-Process -Id $PID).Path -ieq $b.powershell_executable)
    $codeRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSCommandPath)))
    foreach ($root in @($b.input_root,$b.output_root,$b.work_root)) {
        [void](Assert-Local $root $true $false)
        Assert-True ($root -notmatch '(?i)(^|\\)(_workmeta|_workspaces)(\\|$)')
        foreach ($other in @($b.input_root,$b.output_root,$b.work_root,$codeRoot)) {
            if ($root -cne $other) { Assert-True (-not $root.StartsWith($other.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase) -and -not $other.StartsWith($root.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)) }
        }
        Assert-True ($root -ine $codeRoot)
    }
    Assert-True (@(@($b.input_root,$b.output_root,$b.work_root) | Select-Object -Unique).Count -eq 3)
    [void](Assert-Local $r.input_path $false $false)
    Assert-Inside $b.input_root $r.input_path
    Assert-True ([IO.Path]::GetExtension($r.input_path) -ieq '.hwpx' -and (Get-Item -LiteralPath $r.input_path).Length -le 67108864 -and (Get-Hash $r.input_path) -ceq $r.input_sha256)
    [void](Assert-Local $r.run_root $true $false)
    Assert-True ($r.output_root -ceq $b.output_root -and $r.run_root -ceq (Join-Path $b.work_root $r.run_id) -and $r.pdf_path -ceq (Join-Path $b.output_root "$($r.run_id).pdf"))
    Assert-Live
    # Validate every executable pin before even loading the native helper.
    Assert-SystemPowerShell $b.powershell_executable $b.powershell_sha256
    foreach ($pin in @(@($b.hwp_executable,$b.hwp_sha256), @($b.security_module_dll,$b.security_module_sha256), @($b.script_path,$b.script_sha256))) {
        [void](Assert-Local $pin[0] $false $false)
        Assert-True ($pin[1] -cmatch '^[a-f0-9]{64}$' -and (Get-Hash $pin[0]) -ceq $pin[1])
    }
    # Even manually invoked Worker cannot start Hancom inside an MSIX process.
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.IO;
using Microsoft.Win32.SafeHandles;
public static class SoulforgeHwpxNative {
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] static extern int GetCurrentPackageFullName(ref uint n, System.Text.StringBuilder name);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetFileInformationByHandle(SafeFileHandle h, out Info i);
  [StructLayout(LayoutKind.Sequential)] struct Info { public uint attr; public System.Runtime.InteropServices.ComTypes.FILETIME c,a,w; public uint volume,high,low,links,indexHigh,indexLow; }
  public static bool Unpackaged() { uint n=0; return GetCurrentPackageFullName(ref n,null)==15700; }
  public static bool SingleLink(string p) { using(var f=File.Open(p,FileMode.Open,FileAccess.Read,FileShare.Read)) { Info i; return GetFileInformationByHandle(f.SafeFileHandle,out i) && i.links==1; } }
}
'@
    Assert-True (-not [Environment]::Is64BitProcess)
    if ($Mode -eq 'Worker') {
        Assert-True ([SoulforgeHwpxNative]::Unpackaged())
        [void](Assert-Local $RequestPath)
    }
    Assert-True ($b.enabled -is [bool] -and $b.enabled -eq $true -and $b.renderer_ref -ceq $rendererRef -and $r.renderer_ref -ceq $rendererRef)
    Assert-True ($r.run_id -cmatch '^[a-z0-9][a-z0-9-]{7,63}$' -and $r.input_sha256 -cmatch '^[a-f0-9]{64}$')
    Assert-True ($r.task_name -ceq "Soulforge-Hwpx-$($r.run_id)" -and $r.module_name -ceq "SoulforgeHwpx_$($r.run_id)")
    Assert-True ($b.security_module_sha256 -ceq $officialDllHash)
    Assert-True ([Security.Principal.WindowsIdentity]::GetCurrent().User.Value -ceq $b.user_sid)
    Assert-True (-not ([Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator))
    Assert-SystemPowerShell $b.powershell_executable $b.powershell_sha256
    foreach ($pin in @(@($b.hwp_executable,$b.hwp_sha256), @($b.security_module_dll,$b.security_module_sha256), @($b.script_path,$b.script_sha256))) {
        [void](Assert-Local $pin[0]); Assert-True ((Get-Hash $pin[0]) -ceq $pin[1])
    }
    Assert-True ($PSCommandPath -ceq $b.script_path -and (Get-Process -Id $PID).Path -ieq $b.powershell_executable)
    $roots = @($b.input_root,$b.output_root,$b.work_root)
    foreach ($root in $roots) {
        [void](Assert-Local $root $true)
        Assert-True ($root -notmatch '(?i)(^|\\)(_workmeta|_workspaces)(\\|$)')
        foreach ($other in $roots) { if ($root -cne $other) { Assert-True (-not $root.StartsWith($other.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)) } }
    }
    Assert-True (($roots | Select-Object -Unique).Count -eq 3)
    [void](Assert-Local $r.run_root $true); [void](Assert-Local $r.input_path)
    Assert-Inside $b.input_root $r.input_path
    Assert-True ([IO.Path]::GetExtension($r.input_path) -ieq '.hwpx')
    Assert-True ($r.output_root -ceq $b.output_root -and $r.run_root -ceq (Join-Path $b.work_root $r.run_id) -and $r.pdf_path -ceq (Join-Path $b.output_root "$($r.run_id).pdf"))
    Assert-True (-not (Test-Path -LiteralPath $r.pdf_path))
    Assert-Live
    Assert-NoHwp
    $registryBase = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser,[Microsoft.Win32.RegistryView]::Registry32)
    try { $registry = $registryBase.OpenSubKey($moduleKey,$true) } finally { $registryBase.Dispose() }
    # Never create or delete the shared Modules key.
    Assert-True ($null -ne $registry -and $registry.GetValueNames() -notcontains $r.module_name)
    $scheduler = New-Object -ComObject 'Schedule.Service'
    $scheduler.Connect()
    $taskFolder = $scheduler.GetFolder('\')
    $requestFile = Join-Path $r.run_root 'request.json'
    $workerReceipt = Join-Path $r.run_root 'worker-result.json'
    $copyPath = Join-Path $r.run_root 'source.hwpx'
    $pendingPdf = Join-Path $r.run_root 'export.pending.pdf'

    if ($Mode -eq 'Dispatch') {
        Assert-True (@(Get-ChildItem -LiteralPath $r.run_root -Force).Count -eq 0)
        $mutex = [Threading.Mutex]::new($false,"Local\SoulforgeHwpx-$($b.user_sid)")
        $mutexOwned = $mutex.WaitOne(0)
        Assert-True $mutexOwned
        Assert-True (@($taskFolder.GetTasks(1) | Where-Object { $_.Name -ieq $r.task_name }).Count -eq 0)
        $sourceLock = [IO.File]::Open($r.input_path,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
        Assert-True ($sourceLock.Length -gt 0 -and $sourceLock.Length -le 67108864 -and (Get-Hash $r.input_path) -ceq $r.input_sha256)
        $copyWriter = [IO.File]::Open($copyPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
        try { $sourceLock.CopyTo($copyWriter); $copyWriter.Flush($true) } finally { $copyWriter.Dispose() }
        [IO.File]::SetAttributes($copyPath,[IO.FileAttributes]::ReadOnly)
        $copyLock = [IO.File]::Open($copyPath,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
        Write-New $requestFile ($r | ConvertTo-Json -Depth 6 -Compress)
        $requestDigest = Get-Hash $requestFile
        $definition = $scheduler.NewTask(0)
        $definition.RegistrationInfo.Description = "Bounded HWPX PDF export $($r.run_id)"
        $definition.Principal.UserId = $b.user_sid
        $definition.Principal.LogonType = 3 # TASK_LOGON_INTERACTIVE_TOKEN, same user only
        $definition.Principal.RunLevel = 0 # TASK_RUNLEVEL_LUA
        $definition.Settings.Enabled = $true
        $definition.Settings.Hidden = $true
        $definition.Settings.AllowDemandStart = $true
        $definition.Settings.DisallowStartIfOnBatteries = $false
        $definition.Settings.StopIfGoingOnBatteries = $false
        $definition.Settings.ExecutionTimeLimit = 'PT3M'
        $definition.Settings.MultipleInstances = 2 # IgnoreNew, never parallel workers
        $action = $definition.Actions.Create(0)
        $action.Path = $b.powershell_executable
        $action.WorkingDirectory = $r.run_root
        $action.Arguments = '-NoProfile -NonInteractive -WindowStyle Hidden -File "' + $b.script_path + '" -Mode Worker -RequestPath "' + $requestFile + '" -RequestSha256 ' + $requestDigest
        # TASK_CREATE=2: fail if the name already exists. No force/update flags.
        $task = $taskFolder.RegisterTaskDefinition($r.task_name,$definition,2,$b.user_sid,$null,3,$null)
        $taskOwned = $true; $taskXml = $task.Xml
        [void]$task.Run($null)
        do {
            Assert-Live
            Start-Sleep -Milliseconds 100
            $current = $taskFolder.GetTask($r.task_name)
            Assert-True ($current.Xml -ceq $taskXml)
            $finished = [IO.File]::Exists($workerReceipt) -and $current.State -ne 4
            Release-Com $current
        } while (-not $finished)
        [void](Assert-Local $workerReceipt)
        Assert-True ((Get-Item -LiteralPath $workerReceipt).Length -le 256)
        $result = [IO.File]::ReadAllText($workerReceipt) | ConvertFrom-Json
        Assert-True ($result.ok -eq $true -and $result.cleanup_verified -eq $true)
        Assert-NoHwp
        Assert-True ($registry.GetValueNames() -notcontains $r.module_name)
        Assert-True ((Get-Hash $r.input_path) -ceq $r.input_sha256 -and (Get-Hash $copyPath) -ceq $r.input_sha256)
        [void](Assert-Local $pendingPdf)
        Assert-True ((Get-Item -LiteralPath $pendingPdf).Length -ge 8 -and (Get-Item -LiteralPath $pendingPdf).Length -le 67108864)
        Assert-Live
        $ok = $true
    } else {
        Assert-True ($RequestPath -ceq $requestFile)
        $current = $taskFolder.GetTask($r.task_name)
        try {
            Assert-True ($current.State -eq 4 -and $current.Definition.Principal.UserId -ieq $b.user_sid -and $current.Definition.Principal.RunLevel -eq 0 -and $current.Definition.Actions.Count -eq 1)
            $action = $current.Definition.Actions.Item(1)
            $expectedArguments = '-NoProfile -NonInteractive -WindowStyle Hidden -File "' + $b.script_path + '" -Mode Worker -RequestPath "' + $requestFile + '" -RequestSha256 ' + $RequestSha256
            Assert-True ($action.Path -ieq $b.powershell_executable -and $action.Arguments -ceq $expectedArguments -and $action.WorkingDirectory -ceq $r.run_root)
        } finally { Release-Com $current }
        $workerValidated = $true
        [void](Assert-Local $copyPath)
        Assert-True ((Get-Hash $copyPath) -ceq $r.input_sha256 -and -not (Test-Path -LiteralPath $pendingPdf))
        # Resolve the 32-bit COM registration and require the exact pinned Hwp.
        $classes = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::ClassesRoot,[Microsoft.Win32.RegistryView]::Registry32)
        try {
            $clsidKey = $classes.OpenSubKey('HWPFrame.HwpObject\CLSID')
            try { $clsid = $clsidKey.GetValue('') } finally { if ($clsidKey) { $clsidKey.Dispose() } }
            $serverKey = $classes.OpenSubKey("CLSID\$clsid\LocalServer32")
            try { $server = [string]$serverKey.GetValue('') } finally { if ($serverKey) { $serverKey.Dispose() } }
            Assert-HwpLocalServer $server $b.hwp_executable
        } finally { $classes.Dispose() }
        Assert-Live; Assert-NoHwp
        Assert-True ($registry.GetValueNames() -notcontains $r.module_name)
        $registry.SetValue($r.module_name,$b.security_module_dll,[Microsoft.Win32.RegistryValueKind]::String)
        $aliasOwned = $true
        Write-New (Join-Path $r.run_root 'alias-owned') ($r.module_name + ':' + $officialDllHash)
        Assert-True ($registry.GetValue($r.module_name) -ceq $b.security_module_dll -and $registry.GetValueKind($r.module_name) -eq [Microsoft.Win32.RegistryValueKind]::String)
        $hwp = New-Object -ComObject 'HWPFrame.HwpObject'
        $windows = $hwp.XHwpWindows; $window = $windows.Item(0); $window.Visible = $false
        Assert-True ($hwp.RegisterModule('FilePathCheckDLL',$r.module_name) -eq $true)
        Assert-Live
        Assert-True ($hwp.Open($copyPath,'HWPX','suspendpassword:true;forceopen:true;versionwarning:false') -eq $true)
        $processes = Get-HwpProcesses
        Assert-True ($processes.Count -eq 1 -and $processes[0].Path -ieq $b.hwp_executable -and $processes[0].MainWindowHandle -eq [IntPtr]::Zero)
        Assert-Live
        Assert-True (-not (Test-Path -LiteralPath $pendingPdf))
        Assert-True ($hwp.SaveAs($pendingPdf,'PDF','') -eq $true)
        Assert-Live
        Assert-True ((Get-Hash $copyPath) -ceq $r.input_sha256)
        $ok = $true
    }
} catch {
    # Do not serialize exceptions: COM and filesystem errors can contain text,
    # paths, document content or account metadata.
    $ok = $false
} finally {
    if ($Mode -eq 'Worker') {
        if ($null -ne $hwp) {
            try { [void]$hwp.Clear(1) } catch { $cleanup = $false }
            try { [void]$hwp.Quit() } catch { $cleanup = $false }
        }
        foreach ($object in @($window,$windows,$hwp)) { try { Release-Com $object } catch { $cleanup = $false } }
    }
    if ($taskOwned) {
        try {
            $current = $taskFolder.GetTask($r.task_name)
            Assert-True ($current.Xml -ceq $taskXml)
            if ($current.State -eq 4) { $current.Stop(0); Start-Sleep -Milliseconds 250 }
            Assert-True ($current.State -ne 4)
            $taskStoppedVerified = $true
            $taskFolder.DeleteTask($r.task_name,0)
            Assert-True (@($taskFolder.GetTasks(1) | Where-Object { $_.Name -ieq $r.task_name }).Count -eq 0)
            Release-Com $current
        } catch { $cleanup = $false }
    }
    # Dispatch may remove its worker's exact alias after stopping its exact task.
    # No process name or guessed PID is killed, including on timeout. Unknown
    # residual Hancom processes force cleanup failure and require recovery.
    if ($null -ne $registry -and $null -ne $r) {
        try {
            if ($registry.GetValueNames() -contains $r.module_name) {
                $ownedMarker = $false
                if ($Mode -eq 'Dispatch' -and $taskStoppedVerified) {
                    $marker = Join-Path $r.run_root 'alias-owned'
                    if ([IO.File]::Exists($marker)) {
                        [void](Assert-Local $marker)
                        Assert-True ((Get-Item -LiteralPath $marker).Length -le 256)
                        $ownedMarker = [IO.File]::ReadAllText($marker) -ceq ($r.module_name + ':' + $officialDllHash)
                    }
                }
                Assert-True (($aliasOwned -or $ownedMarker) -and $registry.GetValue($r.module_name) -ceq $r.binding.security_module_dll)
                $registry.DeleteValue($r.module_name,$true)
            }
            Assert-True ($registry.GetValueNames() -notcontains $r.module_name)
        } catch { $cleanup = $false }
        $registry.Dispose()
    }
    if ($null -ne $r) {
        try { Assert-NoHwp } catch { $cleanup = $false }
    }
    foreach ($stream in @($copyLock,$sourceLock)) { if ($null -ne $stream) { $stream.Dispose() } }
    if ($mutexOwned) { $mutex.ReleaseMutex() }
    if ($null -ne $mutex) { $mutex.Dispose() }
    foreach ($object in @($task,$taskFolder,$scheduler)) { try { Release-Com $object } catch { $cleanup = $false } }
}
# The dispatcher never publishes a final PDF. Node validates the pending bytes,
# source hash and cancellation/deadline after this native cleanup receipt, then
# owns the sole create-only publication. Every native failure stays quarantined.
$receipt = @{ok=($ok -and $cleanup);cleanup_verified=$cleanup} | ConvertTo-Json -Compress
if ($Mode -eq 'Worker' -and $workerValidated) {
    try { Write-New (Join-Path $r.run_root 'worker-result.json') $receipt } catch { exit 1 }
} else { [Console]::Out.Write($receipt) }
if ($ok -and $cleanup) { exit 0 } else { exit 1 }
