param([Parameter(Mandatory=$true)][string]$JobDirectory,[Parameter(Mandatory=$true)][string]$ProgramRoot)
$ErrorActionPreference='Stop'
$lease=Join-Path $ProgramRoot 'pc-gpu-lock'
$job=Get-Content (Join-Path $JobDirectory 'config.json') -Raw | ConvertFrom-Json
$exitCode=19
$started=(Get-Date).ToUniversalTime().ToString('o')
try {
  New-Item -ItemType Directory -Path $lease -ErrorAction Stop | Out-Null
  @{id=$job.id;started_at=$started;wrapper_pid=$PID} | ConvertTo-Json | Set-Content (Join-Path $lease 'owner.json')
  $env:BLENDER_USER_RESOURCES=Join-Path $ProgramRoot 'blender-user'
  $exe=Join-Path $ProgramRoot 'tools\blender-5.2.1-windows-x64\blender.exe'
  $arguments='--background --factory-startup --threads 4 --python-exit-code 17 --python "'+(Join-Path $JobDirectory 'blender_job.py')+'" -- "'+(Join-Path $JobDirectory 'config.json')+'"'
  $process=Start-Process $exe -ArgumentList $arguments -PassThru -RedirectStandardOutput (Join-Path $JobDirectory 'stdout.log') -RedirectStandardError (Join-Path $JobDirectory 'stderr.log')
  $null=$process.Handle
  @{id=$job.id;pid=$process.Id;started_at=$started} | ConvertTo-Json | Set-Content (Join-Path $JobDirectory 'process.json')
  $samples=@()
  while(!$process.WaitForExit(2000)) {
    $process.Refresh()
    $samples+=@{utc=(Get-Date).ToUniversalTime().ToString('o');rss_bytes=$process.WorkingSet64;gpu=(& nvidia-smi --query-gpu=utilization.gpu,memory.used,power.draw --format=csv,noheader)}
  }
  $process.WaitForExit()
  $exitCode=$process.ExitCode
  $samples | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $JobDirectory 'resources.json')
} catch {
  $_.ToString() | Set-Content (Join-Path $JobDirectory 'wrapper-error.txt')
} finally {
  @{id=$job.id;started_at=$started;ended_at=(Get-Date).ToUniversalTime().ToString('o');exit_code=$exitCode;blender_pid=$process.Id} | ConvertTo-Json | Set-Content (Join-Path $JobDirectory 'terminal.json')
  # Controller releases this lease only after terminal/task/process reconciliation.
}
exit $exitCode
