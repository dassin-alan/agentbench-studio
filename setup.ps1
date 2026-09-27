[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

# Requirements: Node.js 20+, npm install, and playwright install chromium.
# Keep the source ASCII-only so Windows PowerShell 5.1 decodes it reliably.
function Text([string]$Base64) {
  return [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Base64))
}
function Write-Step([string]$Message) { Write-Host "[AgentBench] $Message" -ForegroundColor Cyan }
function Stop-WithError([string]$Message) {
  Write-Host "[$(Text '5aSx6LSl')] $Message" -ForegroundColor Red
  exit 1
}

Write-Host (Text 'QWdlbnRCZW5jaCBTdHVkaW8gdjEuMiBXaW5kb3dzIOWuieijheeoi+W6jw==') -ForegroundColor White
Write-Step (Text '5qOA5p+lIE5vZGUuanMgMjAr')
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Stop-WithError (Text '5pyq5om+5YiwIE5vZGUuanPvvIzor7flhYjlronoo4UgTm9kZS5qcyAyMCDmiJbmm7Tpq5jniYjmnKzjgII=')
}
$nodeVersion = (& node -p "process.versions.node").Trim()
if ($LASTEXITCODE -ne 0) { Stop-WithError (Text '5peg5rOV6K+75Y+WIE5vZGUuanMg54mI5pys44CC') }
$nodeMajor = [int]($nodeVersion.Split('.')[0])
if ($nodeMajor -lt 20) {
  Stop-WithError ((Text '5b2T5YmNIE5vZGUuanMg5Li6IHswfe+8jOmcgOimgSBOb2RlLmpzIDIwK+OAgg==') -f $nodeVersion)
}
Write-Host "[$(Text '6YCa6L+H')] Node.js $nodeVersion" -ForegroundColor Green

Write-Step (Text '5qOA5p+lIG5wbQ==')
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { Stop-WithError (Text '5pyq5om+5YiwIG5wbeOAgg==') }
$npmVersion = (& npm.cmd --version).Trim()
if ($LASTEXITCODE -ne 0) { Stop-WithError (Text 'bnBtIOaXoOazlei/kOihjOOAgg==') }
$npmMajor = [int]($npmVersion.Split('.')[0])
if ($npmMajor -lt 10) { Stop-WithError "npm 10+ is required. Current version: $npmVersion" }
Write-Host "[$(Text '6YCa6L+H')] npm $npmVersion" -ForegroundColor Green

if (Test-Path -LiteralPath (Join-Path $PSScriptRoot "package-lock.json") -PathType Leaf) {
  Write-Step "package-lock.json found; running npm ci"
  & npm.cmd ci
} else {
  Write-Step "package-lock.json not found; running npm install"
  & npm.cmd install
}
if ($LASTEXITCODE -ne 0) {
  Stop-WithError "Dependency installation failed. Check network, proxy and npm registry settings."
}

Write-Step (Text '5qOA5p+lIFBsYXl3cmlnaHQgQ2hyb21pdW0=')
& node -e "const fs=require('node:fs');const {chromium}=require('playwright');process.exit(fs.existsSync(chromium.executablePath())?0:1)"
if ($LASTEXITCODE -ne 0) {
  Write-Host "[$(Text '5o+Q56S6')] $(Text 'Q2hyb21pdW0g57y65aSx77yM5byA5aeL5omn6KGMIG5weCBwbGF5d3JpZ2h0IGluc3RhbGwgY2hyb21pdW0=')" -ForegroundColor Yellow
  & npx.cmd playwright install chromium
  if ($LASTEXITCODE -ne 0) {
    Stop-WithError (Text 'UGxheXdyaWdodCBDaHJvbWl1bSDlronoo4XlpLHotKXjgILlj6/nqI3lkI7miYvliqjmiafooYwgbnB4IHBsYXl3cmlnaHQgaW5zdGFsbCBjaHJvbWl1beOAgg==')
  }
}
Write-Host "[$(Text '6YCa6L+H')] $(Text 'UGxheXdyaWdodCBDaHJvbWl1bSDlj6/nlKg=')" -ForegroundColor Green
Write-Host (Text '5a6J6KOF5a6M5oiQ44CC6K+35Y+M5Ye7IHN0YXJ0LWFnZW50YmVuY2guYmF077yM5oiW5omn6KGMIG5wbSBydW4gc3RhcnTjgII=') -ForegroundColor Green
