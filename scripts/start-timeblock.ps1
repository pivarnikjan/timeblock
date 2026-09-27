<#
.SYNOPSIS
  Starts, stops or restarts the TimeBlock server.

.DESCRIPTION
  With no switches: starts TimeBlock (building once if there is no production
  build) and opens the daily planning screen. Intended for a Windows logon
  trigger, but safe to run by hand: if TimeBlock is already listening on the
  port it is reused rather than started twice.

  -Stop     Stops the TimeBlock server listening on the port.
  -Restart  Deploys the current code: builds, stops the running server, starts
            it again. Use this after pulling or editing code - a running
            `next start` keeps serving whatever it loaded at start-up.

  Only a TimeBlock server (a Next.js process from this project folder) is ever
  stopped. If something else holds the port, the script refuses and says what.

.PARAMETER Port
  Port to serve on. Default 4321 - must match the Google OAuth redirect URI.

.PARAMETER NoBrowser
  Do not open a browser window after starting.

.EXAMPLE
  .\start-timeblock.ps1              # start (or reuse) and open the Calendar
  .\start-timeblock.ps1 -Restart     # build, stop, start: deploy new code
  .\start-timeblock.ps1 -Stop        # stop the server
#>
[CmdletBinding()]
param(
    [int]$Port = 4321,
    [switch]$NoBrowser,
    [switch]$Stop,
    [switch]$Restart
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$nextBin = Join-Path $projectRoot 'node_modules\.bin\next.cmd'
$url = "http://localhost:$Port/calendar"
# Same folder the app keeps its database in (see lib/db/paths.ts).
$dataDir = if ($env:TIMEBLOCK_DATA_DIR) { $env:TIMEBLOCK_DATA_DIR } else { Join-Path $env:LOCALAPPDATA 'timeblock' }
$logDir = Join-Path $dataDir 'logs'

if ($Stop -and $Restart) {
    Write-Error 'Use either -Stop or -Restart, not both.'
    exit 2
}

function Get-ListenerProcess {
    # Fast and exact, unlike Test-NetConnection, and tells us who owns the port.
    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if (-not $listener) { return $null }
    return Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)"
}

function Test-TimeBlockProcess {
    param($Process)
    # The Next.js server started from this project: its command line runs
    # node_modules\next from the project folder (next start, or next dev's worker).
    return $Process -and $Process.CommandLine -and
        $Process.CommandLine.IndexOf($projectRoot, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and
        $Process.CommandLine -match '\\next\\'
}

function Test-LauncherProcess {
    param($Process)
    # Wrappers that only exist to run the server: `cmd /c next start`, `npm run start`,
    # `next.cmd`. Never matches the shell the user typed the command into.
    return $Process -and $Process.CommandLine -and (
        $Process.CommandLine -match '\bnext(\.cmd)?"?\s+(start|dev)\b' -or
        $Process.CommandLine -match 'npm-cli\.js"?\s+run\s+(start|dev)\b' -or
        $Process.CommandLine -match '\bnpm(\.cmd)?"?\s+run\s+(start|dev)\b'
    )
}

function Wait-Port {
    param([bool]$Listening, [int]$Seconds)
    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        if ([bool](Get-ListenerProcess) -eq $Listening) { return $true }
        Start-Sleep -Milliseconds 300
    }
    return $false
}

function Stop-TimeBlock {
    $listener = Get-ListenerProcess
    if (-not $listener) {
        Write-Host "TimeBlock is not running on port $Port."
        return
    }
    if (-not (Test-TimeBlockProcess $listener)) {
        Write-Error ("Port $Port is used by another program, not TimeBlock - leaving it alone.`n" +
            "  PID $($listener.ProcessId): $($listener.CommandLine)")
        exit 1
    }

    # Climb to the outermost launcher (npm -> cmd -> node) so the whole tree
    # goes, not just the node process - otherwise npm is left behind.
    $top = $listener
    $parent = Get-CimInstance Win32_Process -Filter "ProcessId = $($top.ParentProcessId)" -ErrorAction SilentlyContinue
    while ($parent -and (Test-LauncherProcess $parent)) {
        $top = $parent
        $parent = Get-CimInstance Win32_Process -Filter "ProcessId = $($top.ParentProcessId)" -ErrorAction SilentlyContinue
    }

    Write-Host "Stopping TimeBlock (PID $($listener.ProcessId)) on port $Port..."
    & taskkill.exe /PID $top.ProcessId /T /F | Out-Null

    if (-not (Wait-Port -Listening $false -Seconds 15)) {
        Write-Error "Port $Port is still in use 15 seconds after stopping TimeBlock."
        exit 1
    }
    Write-Host 'TimeBlock stopped.'
}

function Invoke-Build {
    Write-Host 'Building TimeBlock (this takes a minute)...'
    Push-Location $projectRoot
    try {
        & npm run build
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Build failed (exit $LASTEXITCODE). The running server, if any, was left as it was."
            exit 1
        }
    } finally {
        Pop-Location
    }
}

function Start-TimeBlock {
    $listener = Get-ListenerProcess
    if ($listener) {
        if (-not (Test-TimeBlockProcess $listener)) {
            Write-Error ("Port $Port is used by another program, not TimeBlock.`n" +
                "  PID $($listener.ProcessId): $($listener.CommandLine)")
            exit 1
        }
        Write-Host "TimeBlock is already running on port $Port."
    } else {
        # BUILD_ID only exists after a successful production build; `next dev`
        # also creates .next, so the folder alone proves nothing.
        if (-not (Test-Path (Join-Path $projectRoot '.next\BUILD_ID'))) {
            Invoke-Build
        }

        # The server runs hidden, so its output goes to log files - otherwise an
        # error (e.g. a failed Google sign-in) leaves no trace at all. The
        # previous run's logs are kept alongside as *.previous.log.
        New-Item -ItemType Directory -Force -Path $logDir | Out-Null
        $outLog = Join-Path $logDir 'server.out.log'
        $errLog = Join-Path $logDir 'server.err.log'
        foreach ($log in $outLog, $errLog) {
            if (Test-Path $log) { Move-Item -Force $log ($log -replace '\.log$', '.previous.log') }
        }

        Write-Host "Starting TimeBlock on port $Port..."
        # cmd does the redirecting. Start-Process's own -Redirect* switches make
        # the server inherit this script's output handles, so anything piping
        # the script's output would hang until the server exits.
        $command = "/d /s /c `"`"$nextBin`" start --port $Port 1>`"$outLog`" 2>`"$errLog`"`""
        Start-Process -FilePath 'cmd.exe' `
            -ArgumentList $command `
            -WorkingDirectory $projectRoot `
            -WindowStyle Hidden

        if (-not (Wait-Port -Listening $true -Seconds 45)) {
            Write-Error "TimeBlock did not start listening on port $Port within 45 seconds."
            exit 1
        }
    }

    if (-not $NoBrowser) {
        Start-Process $url
    }
    Write-Host "TimeBlock is running at $url"
    Write-Host "Server logs: $logDir"
}

if ($Stop) {
    Stop-TimeBlock
} elseif ($Restart) {
    # Build first, while the old server keeps serving: if the build fails, the
    # script stops here and nothing is taken down on purpose.
    Invoke-Build
    Stop-TimeBlock
    Start-TimeBlock
} else {
    Start-TimeBlock
}
