[CmdletBinding()]
param(
  [switch]$NoBrowser,
  [switch]$SmokeTest
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$url = "http://127.0.0.1:3000"
$process = $null

function Stop-ProcessTree([System.Diagnostics.Process]$Process) {
  if (-not $Process) { return }
  try {
    if (-not $Process.HasExited) {
      & taskkill.exe /PID $Process.Id /T /F 2>$null | Out-Null
      $Process.WaitForExit(5000) | Out-Null
    }
  } catch {
    Write-Warning "Child process cleanup failed: $($_.Exception.Message)"
  }
}

try {
  $process = Start-Process -FilePath "npm.cmd" -ArgumentList @("run", "start") -WorkingDirectory $root -PassThru -NoNewWindow
  $ready = $false
  for ($attempt = 0; $attempt -lt 120; $attempt++) {
    if ($process.HasExited) {
      throw "npm run start exited before the web application became ready (exit code $($process.ExitCode))."
    }
    try {
      $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 -Uri $url
      if ($response.StatusCode -ge 200) {
        $ready = $true
        break
      }
    } catch {
      # The development servers are still starting.
    }
    Start-Sleep -Milliseconds 500
  }

  if (-not $ready) {
    throw "Frontend was not ready within 60 seconds. Run doctor.ps1 and review the console output."
  }

  Write-Host "[AgentBench] Ready: $url" -ForegroundColor Green
  if (-not $NoBrowser -and -not $SmokeTest) {
    Start-Process $url
  }

  if ($SmokeTest) {
    Write-Host "[AgentBench] Launcher smoke test passed." -ForegroundColor Green
    exit 0
  }

  $process.WaitForExit()
  exit $process.ExitCode
} catch {
  Write-Error "AgentBench startup failed: $($_.Exception.Message)"
  exit 1
} finally {
  Stop-ProcessTree $process
}
