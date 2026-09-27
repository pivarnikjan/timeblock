<#
.SYNOPSIS
  Registers (or removes) the Windows logon task that opens TimeBlock each morning.

.DESCRIPTION
  Creates a Scheduled Task named "TimeBlock" that runs start-timeblock.ps1 at
  logon for the current user only. No elevation is required and nothing is
  written outside your own user account.

.EXAMPLE
  .\install-autostart.ps1
  .\install-autostart.ps1 -Remove
#>
[CmdletBinding()]
param(
    [string]$TaskName = 'TimeBlock',
    [int]$Port = 4321,
    [switch]$Remove
)

$ErrorActionPreference = 'Stop'

if ($Remove) {
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "Removed the '$TaskName' logon task."
    } else {
        Write-Host "No '$TaskName' task registered."
    }
    return
}

$startScript = Join-Path $PSScriptRoot 'start-timeblock.ps1'
if (-not (Test-Path $startScript)) {
    Write-Error "Cannot find $startScript"
    exit 1
}

$action = New-ScheduledTaskAction `
    -Execute 'powershell.exe' `
    -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$startScript`" -Port $Port"

$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
# The network stack and user profile are not always ready the instant logon fires.
$trigger.Delay = 'PT30S'

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description 'Opens TimeBlock daily planning at logon.' `
    -Force | Out-Null

Write-Host "Registered '$TaskName' to run at logon."
Write-Host "Test it now with:  schtasks /run /tn $TaskName"
