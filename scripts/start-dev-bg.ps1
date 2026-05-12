$ErrorActionPreference = "Stop"

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$OutLog = Join-Path $RootDir ".local-server.out.log"
$ErrLog = Join-Path $RootDir ".local-server.err.log"
$PidFile = Join-Path $RootDir ".local-server.pid"
$Port = if ($env:PORT) { [int]$env:PORT } else { 4173 }
$HostName = if ($env:HOST) { $env:HOST } else { "127.0.0.1" }

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

function Test-PortInUse {
  param(
    [string]$HostName,
    [int]$Port
  )

  $Client = [System.Net.Sockets.TcpClient]::new()
  try {
    $AsyncResult = $Client.BeginConnect($HostName, $Port, $null, $null)
    if (-not $AsyncResult.AsyncWaitHandle.WaitOne(800, $false)) {
      return $false
    }
    $Client.EndConnect($AsyncResult)
    return $Client.Connected
  } catch {
    return $false
  } finally {
    $Client.Close()
  }
}

if (Test-PortInUse -HostName $HostName -Port $Port) {
  $ExistingPid = Get-ListeningPid -Port $Port
  if ($ExistingPid) {
    Set-Content -LiteralPath $PidFile -Value ([string]$ExistingPid) -NoNewline
  }
  Write-Output "Local server already listening at http://${HostName}:${Port} - nothing to do."
  exit 0
}

if (Test-Path $PidFile) {
  Remove-Item -LiteralPath $PidFile -Force
}

$Node = (Get-Command node.exe -ErrorAction Stop).Source
$env:PORT = [string]$Port
$env:HOST = $HostName

$Process = Start-Process `
  -FilePath $Node `
  -ArgumentList @("scripts\local-server.mjs") `
  -WorkingDirectory $RootDir `
  -RedirectStandardOutput $OutLog `
  -RedirectStandardError $ErrLog `
  -WindowStyle Hidden `
  -PassThru

$ListeningPid = $null
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Milliseconds 100
  $ListeningPid = Get-ListeningPid -Port $Port
  if ($ListeningPid) { break }
}

$TrackedPid = if ($ListeningPid) { $ListeningPid } else { $Process.Id }
Set-Content -LiteralPath $PidFile -Value ([string]$TrackedPid) -NoNewline

Write-Output "Local server starting in background (pid $TrackedPid) -> http://${HostName}:${Port}"
Write-Output "  stdout: .local-server.out.log"
Write-Output "  stderr: .local-server.err.log"
Write-Output "  pid file: .local-server.pid  (use 'npm run stop:bg' to stop)"
