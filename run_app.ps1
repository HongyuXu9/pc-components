$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$appUrl = "http://127.0.0.1:8766"
$dataUrl = "$appUrl/api/data"
$versionUrl = "$appUrl/api/version"
$requiredVersion = "2026.11.05.collections-2"
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

function Get-PartlyServerVersion {
    try {
        $response = Invoke-WebRequest -Uri $versionUrl -UseBasicParsing -TimeoutSec 2
        return ($response.Content | ConvertFrom-Json).version
    } catch {
        return $null
    }
}

function Stop-StalePartlyServer {
    $connections = Get-NetTCPConnection -LocalPort 8766 -State Listen -ErrorAction SilentlyContinue
    foreach ($connection in $connections) {
        $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($connection.OwningProcess)" -ErrorAction SilentlyContinue
        if (-not $process -or -not $process.CommandLine) { continue }
        if ($process.CommandLine.IndexOf($serverScript, [StringComparison]::OrdinalIgnoreCase) -lt 0) { continue }
        Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
        Start-Sleep -Milliseconds 500
        return $true
    }
    return $false
}

function Show-PartlyError($message) {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($message, "Partly") | Out-Null
}

try {
    $stage = "checking local server"
    $existingServer = Test-PartlyServer
    if ($existingServer -and (Get-PartlyServerVersion) -ne $requiredVersion) {
        $stage = "updating the existing Partly server"
        if (-not (Stop-StalePartlyServer)) {
            throw "An older Partly server is running, but its process could not be safely identified. Close it and reopen Partly."
        }
        $existingServer = $false
        Write-PartlyLog "INFO Replaced an older local server with $requiredVersion"
    }
    if (-not $existingServer) {
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
    try { Write-PartlyLog "ERROR $detail" } catch { }
    Show-PartlyError ("Partly launcher failed while {0}.`r`n`r`nDetails were written to partly.log.`r`n`r`n{1}" -f $stage, $_.Exception.Message)
} finally {
    if ($ownsServer -and $serverProcess -and -not $serverProcess.HasExited) {
        Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
    }
}
