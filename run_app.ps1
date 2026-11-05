$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$appUrl = "http://127.0.0.1:8766"
$dataUrl = "$appUrl/api/data"
$serverScript = Join-Path $root "server.py"
$serverProcess = $null
$ownsServer = $false
$stage = "initialization"
$logPath = Join-Path $root "partly.log"
$script:pendingPartlyLogs = @()

function Send-PartlyLogEntry($entry) {
    $payload = @{
        level = $entry.level
        message = $entry.message
        context = "Partly launcher"
    } | ConvertTo-Json -Compress
    Invoke-RestMethod -Uri "$appUrl/api/log" -Method Post -ContentType "application/json" -Body $payload -TimeoutSec 2 | Out-Null
}

function Write-PartlyLog($message, $level = "INFO") {
    $entry = @{ level = $level; message = $message }
    try {
        if (Test-PartlyServer) {
            Send-PartlyLogEntry $entry
            return
        }
    } catch { }
    $script:pendingPartlyLogs += $entry
}

function Flush-PartlyLogQueue($writeFallbackFile = $false) {
    $remaining = @()
    foreach ($entry in $script:pendingPartlyLogs) {
        try { Send-PartlyLogEntry $entry } catch { $remaining += $entry }
    }
    $script:pendingPartlyLogs = $remaining
    if ($writeFallbackFile -and $script:pendingPartlyLogs.Count -gt 0) {
        foreach ($entry in $script:pendingPartlyLogs) {
            $line = "{0} {1} [launcher] {2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $entry.level, $entry.message
            try {
                Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8 -ErrorAction Stop
            } catch {
                Add-Content -LiteralPath (Join-Path $root "partly-launcher.log") -Value $line -Encoding UTF8
            }
        }
        $script:pendingPartlyLogs = @()
    }
}

function Test-PartlyServer {
    try {
        $response = Invoke-WebRequest -Uri $dataUrl -UseBasicParsing -TimeoutSec 2
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

function Get-PartlyListenerProcessId {
    $netstat = Join-Path $env:SystemRoot "System32\netstat.exe"
    $lines = & $netstat -ano -p tcp 2>$null
    foreach ($line in $lines) {
        if ($line -match '^\s*TCP\s+\S+:8766\s+\S+\s+LISTENING\s+(\d+)\s*$') {
            return [int]$Matches[1]
        }
    }
    return $null
}

function Show-PartlyError($message) {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($message, "Partly") | Out-Null
}

try {
    $stage = "checking for an existing Partly server"
    $existingPid = Get-PartlyListenerProcessId
    if ($existingPid) {
        Write-PartlyLog "INFO Existing Partly server detected on port 8766 (PID $existingPid); stopping it before restart"
        if ($existingPid -eq $PID) { throw "The Partly launcher itself is unexpectedly bound to port 8766." }
        Stop-Process -Id $existingPid -Force -ErrorAction Stop
        $serverStopped = $false
        for ($attempt = 0; $attempt -lt 20; $attempt++) {
            if (-not (Get-PartlyListenerProcessId)) {
                $serverStopped = $true
                break
            }
            Start-Sleep -Milliseconds 250
        }
        if (-not $serverStopped) { throw "The existing Partly server did not release port 8766." }
        Write-PartlyLog "INFO Existing Partly server stopped; starting a fresh server"
    } elseif (Test-PartlyServer) {
        Write-PartlyLog "ERROR Partly responds on port 8766, but netstat did not return its listener PID"
        throw "Partly responds on port 8766, but its listener process could not be found."
    } else {
        Write-PartlyLog "INFO No existing Partly server found; starting a fresh server"
    }

    $stage = "finding Python 3"
    $launcher = Get-Command py.exe -ErrorAction SilentlyContinue
    if ($launcher) {
        $pythonPath = (& $launcher.Source -3 -c "import sys; print(sys.executable)" | Select-Object -Last 1).Trim()
    } else {
        $pythonPath = (Get-Command python.exe -ErrorAction Stop).Source
    }
    if (-not $pythonPath) { throw "Python 3 was not found." }

    $stage = "starting local server"
    $serverProcess = Start-Process `
        -FilePath $pythonPath `
        -ArgumentList ('"{0}"' -f $serverScript) `
        -WorkingDirectory $root `
        -WindowStyle Hidden `
        -PassThru
    $ownsServer = $true
    Write-PartlyLog "INFO Fresh Partly server started (PID $($serverProcess.Id))"

    $serverReady = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        if (Test-PartlyServer) {
            $serverReady = $true
            break
        }
        if ($serverProcess.HasExited) { break }
        Start-Sleep -Seconds 1
    }
    if (-not $serverReady) { throw "Partly could not start its local server." }
    Flush-PartlyLogQueue

    $stage = "opening Partly in the browser"
    $browserCandidates = @(
        (Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"),
        (Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe"),
        (Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe"),
        (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe"),
        (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe"),
        (Join-Path $env:LOCALAPPDATA "Microsoft\Edge\Application\msedge.exe")
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
    if ($browserCandidates.Count -gt 0) {
        Start-Process -FilePath $browserCandidates[0] -ArgumentList "--app=$appUrl"
    } else {
        Start-Process -FilePath $appUrl
    }

    $windowSeen = $false
    $stage = "waiting for the Partly window to close"
    $windowDeadline = (Get-Date).AddSeconds(45)
    while ($true) {
        $partlyWindow = Get-Process -ErrorAction SilentlyContinue | Where-Object {
            $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -match "Partly"
        }
        if ($partlyWindow) {
            $windowSeen = $true
        } elseif ($windowSeen) {
            break
        } elseif ((Get-Date) -gt $windowDeadline) {
            throw "The Partly app window did not open."
        }

        if ($ownsServer -and $serverProcess.HasExited) { break }
        Start-Sleep -Milliseconds 500
    }
} catch {
    $detail = "{0}: {1}" -f $stage, $_.Exception.ToString()
    try { Write-PartlyLog $detail "ERROR" } catch { }
    Show-PartlyError ("Partly launcher failed while {0}.`r`n`r`nDetails were written to partly.log or partly-launcher.log.`r`n`r`n{1}" -f $stage, $_.Exception.Message)
} finally {
    if ($ownsServer -and $serverProcess -and -not $serverProcess.HasExited) {
        Write-PartlyLog "INFO Partly window closed; stopping local server (PID $($serverProcess.Id))"
        Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
        Wait-Process -Id $serverProcess.Id -Timeout 5 -ErrorAction SilentlyContinue
    }
    Flush-PartlyLogQueue -writeFallbackFile $true
}
