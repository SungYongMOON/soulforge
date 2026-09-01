# Shared runtime path contract for dev-ERP launch, service, and watchdog scripts.

function Join-DevErpRootSegments {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string[]]$Segments
  )
  if ($Segments.Count -eq 0) { return [IO.Path]::GetFullPath($Root) }
  return [IO.Path]::GetFullPath((Join-Path $Root ($Segments -join [IO.Path]::DirectorySeparatorChar)))
}

function Get-DevErpInstalledLayout {
  param([Parameter(Mandatory = $true)][string]$PathValue)

  $FullPath = [IO.Path]::GetFullPath($PathValue)
  $PathRoot = [IO.Path]::GetPathRoot($FullPath)
  if ([string]::IsNullOrWhiteSpace($PathRoot)) {
    throw "runtime_path_root_missing"
  }
  $Relative = $FullPath.Substring($PathRoot.Length).TrimStart([char[]]@('\', '/'))
  [string[]]$Parts = @($Relative -split '[\\/]+' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  for ($Index = 0; $Index -le ($Parts.Count - 4); $Index++) {
    $Version = $Parts[$Index + 2]
    $VersionLike = $Version -eq "current" -or $Version -match '^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$'
    if ($Parts[$Index] -ieq "install" -and $Parts[$Index + 1] -ieq "server-pack" -and $VersionLike -and $Parts[$Index + 3] -ieq "payload") {
      [string[]]$SuiteSegments = if ($Index -eq 0) { @() } else { @($Parts[0..($Index - 1)]) }
      [string[]]$PayloadSegments = @($Parts[0..($Index + 3)])
      $SuiteRoot = Join-DevErpRootSegments -Root $PathRoot -Segments $SuiteSegments
      $PayloadRoot = Join-DevErpRootSegments -Root $PathRoot -Segments $PayloadSegments
      return [pscustomobject]@{
        installed = $true
        suite_root = $SuiteRoot
        control_root = Join-Path $SuiteRoot "control"
        payload_root = $PayloadRoot
        release_version = $Version
      }
    }
  }
  return [pscustomobject]@{
    installed = $false
    suite_root = $null
    control_root = $null
    payload_root = $null
    release_version = $null
  }
}

function Test-DevErpPathInside {
  param(
    [Parameter(Mandatory = $true)][string]$Candidate,
    [Parameter(Mandatory = $true)][string]$Boundary
  )
  $CandidatePath = [IO.Path]::GetFullPath($Candidate).TrimEnd([char[]]@('\', '/'))
  $BoundaryPath = [IO.Path]::GetFullPath($Boundary).TrimEnd([char[]]@('\', '/'))
  if ([string]::Equals($CandidatePath, $BoundaryPath, [StringComparison]::OrdinalIgnoreCase)) { return $true }
  return $CandidatePath.StartsWith($BoundaryPath + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)
}

function Assert-DevErpExternalRuntimePath {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$PathValue,
    [Parameter(Mandatory = $true)]$InstalledLayout
  )
  $FullPath = [IO.Path]::GetFullPath($PathValue)
  if ($InstalledLayout.installed -and (Test-DevErpPathInside -Candidate $FullPath -Boundary $InstalledLayout.payload_root)) {
    throw "$Name must resolve outside the installed server-pack payload."
  }
  return $FullPath
}
