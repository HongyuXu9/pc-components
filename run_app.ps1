$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$appUrl = "http://127.0.0.1:8766"
$dataUrl = "$appUrl/api/data"
$serverScript = Join-Path $root "server.py"
$serverProcess = $null
$ownsServer = $false
$stage = "initialization"
$logPath = Join-Path $root "partly.log"

function Write-PartlyLog($message) {
    $line = "{0} [launcher] {1}{2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $message, [Environment]::NewLine
    Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
}

function Test-PartlyServer {
    try {
        $response = Invoke-WebRequest -Uri $dataUrl -UseBasicParsing -TimeoutSec 2
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

function Show-PartlyError($message) {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($message, "Partly") | Out-Null
}

try {
    $stage = "checking local server"
    if (-not (Test-PartlyServer)) {
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
    }

    $stage = "finding a browser"
    $edgeCandidates = @(
        (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe"),
        (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe"),
        (Join-Path $env:LOCALAPPDATA "Microsoft\Edge\Application\msedge.exe")
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
    $edgeCommand = Get-Command msedge.exe -ErrorAction SilentlyContinue
    $stage = "opening Partly in the browser"
    if ($edgeCandidates.Count -gt 0) {
        $edgePath = $edgeCandidates[0]
        Start-Process -FilePath $edgePath -ArgumentList "--app=$appUrl"
    } elseif ($edgeCommand) {
        Start-Process -FilePath $edgeCommand.Source -ArgumentList "--app=$appUrl"
    } else {
        Start-Process $appUrl
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
    try { Write-PartlyLog "ERROR $detail" } catch { }
    Show-PartlyError ("Partly launcher failed while {0}.`r`n`r`nDetails were written to partly.log.`r`n`r`n{1}" -f $stage, $_.Exception.Message)
} finally {
    if ($ownsServer -and $serverProcess -and -not $serverProcess.HasExited) {
        Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
    }
}
