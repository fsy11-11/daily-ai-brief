# Setup Windows Task Scheduler for Daily AI Brief
# Run this script as Administrator

$taskName = "DailyAIBrief"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = Resolve-Path "$scriptDir\.."
$nodeExe = (Get-Command node).Source

$action = New-ScheduledTaskAction -Execute $nodeExe -Argument "dist/index.js" -WorkingDirectory $projectDir

$trigger = New-ScheduledTaskTrigger -Daily -At 8:00AM

$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Principal $principal `
  -Settings $settings `
  -Description "Generate daily AI briefing and send via email"

Write-Host "Task '$taskName' registered. Runs daily at 8:00 AM."
Write-Host ""
Write-Host "To test now, run:"
Write-Host "  Start-ScheduledTask -TaskName '$taskName'"
Write-Host ""
Write-Host "To remove:"
Write-Host "  Unregister-ScheduledTask -TaskName '$taskName' -Confirm:`$false"
