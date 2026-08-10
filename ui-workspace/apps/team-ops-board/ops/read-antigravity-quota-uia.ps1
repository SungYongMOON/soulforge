$ErrorActionPreference = 'Stop'

try {
  Add-Type -AssemblyName UIAutomationClient
  Add-Type -AssemblyName UIAutomationTypes

  $root = [System.Windows.Automation.AutomationElement]::RootElement
  $windows = $root.FindAll(
    [System.Windows.Automation.TreeScope]::Children,
    [System.Windows.Automation.Condition]::TrueCondition
  )
  $matchCount = 0
  $matchedNames = $null
  foreach ($window in $windows) {
    $elements = $window.FindAll(
      [System.Windows.Automation.TreeScope]::Descendants,
      [System.Windows.Automation.Condition]::TrueCondition
    )
    if ($elements.Count -gt 5000) { continue }
    $names = [System.Collections.Generic.List[string]]::new()
    foreach ($element in $elements) {
      try {
        $name = [string]$element.Current.Name
        if ($name -eq 'Gemini Models' -or
            $name -eq 'Claude and GPT models' -or
            $name -eq 'Weekly Limit Remaining' -or
            $name -eq 'Five Hour Limit Remaining' -or
            $name -match '^(100|[1-9]?\d)%$' -or
            $name -match '^Resets? [^\x00-\x1f]{1,96}$') {
          $names.Add($name)
        }
      } catch { }
    }
    if ($names.Contains('Gemini Models') -and $names.Contains('Claude and GPT models')) {
      $candidate = @($names | ForEach-Object { [string]$_ })
      $matchCount += 1
      $matchedNames = $candidate
    }
  }
  if ($matchCount -ne 1) { [Console]::Out.Write('[]'); exit 0 }
  [Console]::Out.Write((ConvertTo-Json -Compress -InputObject $matchedNames))
} catch {
  [Console]::Out.Write('[]')
}
