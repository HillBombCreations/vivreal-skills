<#
.SYNOPSIS
  Find leftover agent processes and the ones actually burning processor, then
  kill what you choose. Reports by default, kills only with -Kill.

.DESCRIPTION
  Long agent runs leave things behind: dev servers on the fixed ports, browser
  processes whose driver has exited, test runners whose parent is gone, and
  recursive directory walks that outlived the question they were answering. On a
  machine carrying many worktrees a recursive walk costs out of all proportion,
  because it crosses every checkout and every node_modules inside each one.

  THE THING THAT MAKES THIS SAFE. "Its parent has exited" is NOT a signal on
  Windows by itself. csrss, wininit, winlogon, the service host processes and
  most vendor background agents all have exited parents BY DESIGN, and an early
  version of this script duly listed csrss.exe as a kill candidate. Killing that
  bluescreens the machine. So orphanhood is only ever considered for processes in
  the candidate set below, which are the things an agent run actually spawns, and
  a denylist refuses the rest whatever the signals say.

  Three signals, none of them sufficient alone:

    1. ORPHANED, within the candidate set only. Its parent is gone.
    2. BUSY. Processor time accumulated over a measured INTERVAL. A single
       instantaneous sample is spiky and has read 100 percent on a machine that
       was four percent busy, so this is always a delta, never a spot value.
    3. WALKING. Its command line recursively searches or walks a path.

  Age is not a signal. An editor open for three days is fine.

.PARAMETER Kill
  Actually terminate. Without it nothing is killed.

.PARAMETER Seconds
  Interval over which processor time is measured. Default 5.

.PARAMETER MinCpuSeconds
  Processor seconds over the interval before a process counts as busy. Default
  1.0, roughly 20 percent of one core across 5 seconds.

.PARAMETER Protect
  Extra command-line substrings that must never be killed. Repeatable. Use it to
  name the worktree of a run that is legitimately in flight.
#>
[CmdletBinding()]
param(
    [switch]$Kill,
    [int]$Seconds = 5,
    [double]$MinCpuSeconds = 1.0,
    [string[]]$Protect = @()
)

# Only these are ever considered. Anything an agent run does not spawn is out of
# scope, which is what stops a system process reaching the kill list at all.
$CANDIDATE = '^(node|rg|grep|findstr|python|py|tsx|vitest|jest|playwright|next|npm|npx|pwsh|powershell|chrome|msedge|firefox|git)\.exe$'

# A second, independent refusal. Even if something above matched by name, or a
# future edit widens the candidate set, these never die here.
$NEVER = '(?i)(csrss|wininit|winlogon|services|lsass|smss|svchost|System|Registry|dwm|explorer|fontdrvhost|SearchHost|ctfmon|RuntimeBroker|sihost|taskhostw|conhost|OneDrive|Code|Cursor|claude)'

# Browsers are only candidates when something is driving them. A person's own
# browser has none of these switches.
$AUTOMATED_BROWSER = '(?i)(--remote-debugging-port|--enable-automation|--headless|playwright|puppeteer|--user-data-dir=.*(Temp|playwright|ms-playwright))'

$WALK = '(?i)(\brg\.exe|ripgrep|\bgrep\b|\bfindstr\b|Get-ChildItem\s+-Recurse|\bfind\b\s+\S+\s+-name|-Recurse\b)'

function Get-CpuSnapshot {
    $byId = @{}
    foreach ($p in Get-Process -ErrorAction SilentlyContinue) {
        try { $byId[$p.Id] = $p.TotalProcessorTime.TotalSeconds } catch { }
    }
    return $byId
}

Write-Output "Measuring processor time over $Seconds seconds, because a spot reading lies."
$before = Get-CpuSnapshot
Start-Sleep -Seconds $Seconds
$after = Get-CpuSnapshot

$procs = Get-CimInstance Win32_Process |
    Select-Object ProcessId, ParentProcessId, Name, CommandLine, CreationDate
$livePids = @{}
foreach ($p in $procs) { $livePids[[int]$p.ProcessId] = $true }

$rows = @()
foreach ($p in $procs) {
    $procId = [int]$p.ProcessId
    $name = $p.Name
    $cmd = if ($p.CommandLine) { $p.CommandLine } else { '' }

    if ($name -notmatch $CANDIDATE) { continue }
    if ($name -match '^(chrome|msedge|firefox)\.exe$' -and $cmd -notmatch $AUTOMATED_BROWSER) { continue }

    $cpu = 0.0
    if ($before.ContainsKey($procId) -and $after.ContainsKey($procId)) {
        $cpu = [math]::Round($after[$procId] - $before[$procId], 2)
    }

    $isOrphan = -not $livePids.ContainsKey([int]$p.ParentProcessId)
    $isBusy = $cpu -ge $MinCpuSeconds
    $isWalking = $cmd -match $WALK
    if (-not ($isOrphan -or $isBusy -or $isWalking)) { continue }

    $blocked = ($name -match $NEVER) -or ($cmd -match $NEVER)
    foreach ($needle in $Protect) {
        if ($needle -and $cmd -like "*$needle*") { $blocked = $true }
    }

    $signals = @()
    if ($isOrphan) { $signals += 'ORPHAN' }
    if ($isBusy) { $signals += 'BUSY' }
    if ($isWalking) { $signals += 'WALKING' }

    $ageMin = 0
    try { $ageMin = [math]::Round(((Get-Date) - $p.CreationDate).TotalMinutes, 1) } catch { }

    $rows += [pscustomobject]@{
        Pid     = $procId
        Ppid    = [int]$p.ParentProcessId
        Name    = $name
        CpuSec  = $cpu
        AgeMin  = $ageMin
        Signals = ($signals -join '+')
        Blocked = $blocked
        Cmd     = if ($cmd.Length -gt 90) { $cmd.Substring(0, 90) } else { $cmd }
    }
}

$rows = $rows | Sort-Object -Property CpuSec -Descending
Write-Output ""
Write-Output "Candidate processes with at least one signal: $($rows.Count)"
Write-Output ""
if ($rows.Count -gt 0) {
    $rows | Format-Table Pid, Ppid, Name, CpuSec, AgeMin, Signals, Blocked -AutoSize | Out-String -Width 200
    foreach ($r in $rows) { Write-Output ("  {0,-7} {1}" -f $r.Pid, $r.Cmd) }
}

# Controls, both directions. A sweep that finds nothing is indistinguishable from
# a sweep that is broken.
$totalCpu = 0.0
foreach ($k in $after.Keys) { if ($before.ContainsKey($k)) { $totalCpu += ($after[$k] - $before[$k]) } }
Write-Output ""
Write-Output ("CONTROL processor seconds machine wide over the interval: {0:N1}" -f $totalCpu)
Write-Output ("CONTROL processes sampled at both ends: {0} (must be > 0)" -f $before.Keys.Count)
Write-Output ("CONTROL walk pattern fires on a planted example: {0} (must be True)" -f `
    ('rg.exe --files C:\repos' -match $WALK))
Write-Output ("CONTROL a system process is refused even if named: {0} (must be True)" -f `
    ('csrss.exe' -match $NEVER))
Write-Output ("CONTROL a person's own browser is not a candidate: {0} (must be True)" -f `
    (-not ('"C:\Program Files\Google\Chrome\Application\chrome.exe" ' -match $AUTOMATED_BROWSER)))

$targets = $rows | Where-Object { -not $_.Blocked }
Write-Output ""
Write-Output "Killable: $($targets.Count)"

if (-not $Kill) {
    Write-Output "Report only. Pass -Kill to terminate them."
    exit 0
}

foreach ($t in $targets) {
    try {
        Stop-Process -Id $t.Pid -Force -ErrorAction Stop
        Write-Output "  killed $($t.Pid) $($t.Name)"
    } catch {
        Write-Output "  could not kill $($t.Pid) $($t.Name): $($_.Exception.Message)"
    }
}

# Verify rather than assume. A kill that silently failed reads as a clean sweep.
Start-Sleep -Seconds 2
$still = @()
foreach ($t in $targets) {
    if (Get-Process -Id $t.Pid -ErrorAction SilentlyContinue) { $still += $t.Pid }
}
Write-Output ""
Write-Output "Still alive after the sweep: $($still.Count) $($still -join ', ') (must be 0)"
exit $(if ($still.Count -gt 0) { 1 } else { 0 })
