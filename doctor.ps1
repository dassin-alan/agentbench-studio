[CmdletBinding()]
param()

$ErrorActionPreference = "SilentlyContinue"
Set-Location -LiteralPath $PSScriptRoot
$results = [System.Collections.Generic.List[object]]::new()
function Text([string]$Base64) {
  return [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Base64))
}
function Add-Result([string]$Status, [string]$Check, [string]$Detail) {
  $results.Add([PSCustomObject]@{ Status = $Status; Check = $Check; Detail = $Detail })
}

$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
  $version = (& node -p "process.versions.node").Trim()
  $major = [int]($version.Split('.')[0])
  Add-Result $(if ($major -ge 20) { "PASS" } else { "FAIL" }) "Node.js 20+" $version
} else { Add-Result "FAIL" "Node.js 20+" (Text '5pyq5a6J6KOF5oiW5LiN5ZyoIFBBVEg=') }

$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
Add-Result $(if ($npm) { "PASS" } else { "FAIL" }) "npm" $(if ($npm) { (& npm.cmd --version).Trim() } else { Text '5pyq5om+5Yiw' })

$playwrightPath = & node -e "try{process.stdout.write(require('playwright').chromium.executablePath())}catch{}" 2>$null
$playwrightOk = $playwrightPath -and (Test-Path -LiteralPath $playwrightPath -PathType Leaf)
Add-Result $(if ($playwrightOk) { "PASS" } else { "WARN" }) "Playwright Chromium" $(if ($playwrightOk) { $playwrightPath } else { Text '5pyq5a6J6KOF77yb6L+Q6KGMIG5weCBwbGF5d3JpZ2h0IGluc3RhbGwgY2hyb21pdW0=' })

$envBrowser = $env:PLAYWRIGHT_EXECUTABLE_PATH
if ($envBrowser) {
  Add-Result $(if (Test-Path -LiteralPath $envBrowser -PathType Leaf) { "PASS" } else { "WARN" }) "PLAYWRIGHT_EXECUTABLE_PATH" $envBrowser
} else { Add-Result "WARN" "PLAYWRIGHT_EXECUTABLE_PATH" (Text '5pyq6K6+572u77yM5bCG6Ieq5Yqo5p+l5om+5rWP6KeI5Zmo') }

$chrome = @("C:\Program Files\Google\Chrome\Application\chrome.exe", "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe") | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
$edge = @("C:\Program Files\Microsoft\Edge\Application\msedge.exe", "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
Add-Result $(if ($chrome) { "PASS" } else { "WARN" }) "Chrome" $(if ($chrome) { $chrome } else { Text '5pyq5om+5Yiw' })
Add-Result $(if ($edge) { "PASS" } else { "WARN" }) "Edge" $(if ($edge) { $edge } else { Text '5pyq5om+5Yiw' })

foreach ($port in 3000, 3001, 4173, 4174) {
  $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  $check = (Text '56uv5Y+jIHswfQ==') -f $port
  $detail = if ($listener) { (Text '5bey5Y2g55So77yMUElEIHswfQ==') -f $listener[0].OwningProcess } else { Text '5Y+v55So' }
  Add-Result $(if ($listener) { "WARN" } else { "PASS" }) $check $detail
}

$dataRoot = Join-Path $PSScriptRoot "data"
try {
  if (-not (Test-Path -LiteralPath $dataRoot)) { New-Item -ItemType Directory -Path $dataRoot -Force | Out-Null }
  $probe = Join-Path $dataRoot ".doctor-write-test.tmp"
  [IO.File]::WriteAllText($probe, "ok", [Text.Encoding]::UTF8)
  Remove-Item -LiteralPath $probe -Force
  Add-Result "PASS" (Text 'ZGF0YSDlhpnlhaXmnYPpmZA=') $dataRoot
} catch { Add-Result "FAIL" (Text 'ZGF0YSDlhpnlhaXmnYPpmZA=') $_.Exception.Message }

Write-Host "AgentBench Studio v1.2 environment diagnostics" -ForegroundColor White
$results | Format-Table -AutoSize
$pass = @($results | Where-Object Status -eq "PASS").Count
$warn = @($results | Where-Object Status -eq "WARN").Count
$fail = @($results | Where-Object Status -eq "FAIL").Count
Write-Host ((Text '5rGH5oC777ya6YCa6L+HIHswfe+8jOitpuWRiiB7MX3vvIzlpLHotKUgezJ9') -f $pass, $warn, $fail)
if ($fail -gt 0) { exit 1 }
