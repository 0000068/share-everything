$ErrorActionPreference = "Stop"

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$PidFile = Join-Path $RootDir ".local-server.pid"
$Port = if ($env:PORT) { [int]$env:PORT } else { 4173 }

function Get-ListeningPid {
  param([int]$Port)

  $Lines = netstat -ano -p tcp | Select-String "LISTENING"
  foreach ($Line in $Lines) {
    $Text = [string]$Line
    if ($Text -match "^\s*TCP\s+\S+:$Port\s+\S+\s+LISTENING\s+(\d+)\s*$") {
      return [int]$Matches[1]
    }
  }
  return $null
}

$TrackedPid = $null
if (Test-Path $PidFile) {
  $RawPid = (Get-Content -LiteralPath $PidFile -Raw).Trim()
  if ($RawPid -match "^\d+$") {
    $TrackedPid = [int]$RawPid
  }
}

if (-not $TrackedPid) {
  $TrackedPid = Get-ListeningPid -Port $Port
}

if (-not $TrackedPid) {
  if (Test-Path $PidFile) {
    Remove-Item -LiteralPath $PidFile -Force
  }
  Write-Output "No tracked local server is running."
  exit 0
}

try {
  Stop-Process -Id $TrackedPid -Force -ErrorAction Stop
  Write-Output "Stopped local server (pid $TrackedPid)."
} catch {
  Write-Output "Process $TrackedPid was not running."
}

if (Test-Path $PidFile) {
  Remove-Item -LiteralPath $PidFile -Force
}
