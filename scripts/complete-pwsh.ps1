#!/usr/bin/env pwsh
# Prints what PowerShell offers for each -Line with -Script loaded (D4), one candidate per line.
#   scripts/complete-pwsh.ps1 -Script <completion-script> -Line '<line>'
#   scripts/complete-pwsh.ps1 -Script <completion-script> -Delimited '<line>' '<line>' ...
# Every line is completed in this one session, against one dot-source of the script: pwsh starts
# cold in seconds on a loaded runner, so a process per line is what a test pays for, not the
# completion. -Delimited heads each line's candidates with `### <line>` and prints each as
# `<text><TAB><tooltip>`, so one call can answer several questions, tooltips included.
# A native argument completer fires only for a command PowerShell can resolve, so a program
# named by a line that is not already on PATH gets a stub executable for the duration of the
# call. Only then: a stub ahead of the real program shadows it, and a dynamic completer (D3)
# that calls the program back would get the stub's silence and fall back to file names.
# Each phase writes `pwsh-phase <start|lookup|dot-source|complete:<n>> <ms>` to stderr
# (windows-lane-holds R3a): `start` is process start to the first line of this script, and each
# later one is the time since the phase before it. stdout carries only the candidates.
#   scripts/complete-pwsh.ps1 -Script <completion-script> -Run "<command line>`n<command line>" -Delimited '<line>' ...
# also runs each line of -Run in the same session, after the completions (fix-lines-every-shell R3):
# a `fix:` line is parsed by PowerShell as typed, its output printed under `### run:<n>` and its
# exit code as `exit:<code>`, or the parse error as `error:<message>`. One cold start answers both.
# Binding is by name only: -Run must never take a positional line, which -Line collects.
[CmdletBinding(PositionalBinding = $false)]
param([Parameter(Mandatory)][string]$Script, [string]$Run = '', [Parameter(Mandatory, ValueFromRemainingArguments)][string[]]$Line, [switch]$Delimited)
$clock = [Diagnostics.Stopwatch]::StartNew()
$booted = [int]([DateTime]::Now - [Diagnostics.Process]::GetCurrentProcess().StartTime).TotalMilliseconds
[Console]::Error.WriteLine("pwsh-phase start $booted")
function Write-Phase([string]$name) {
  [Console]::Error.WriteLine("pwsh-phase $name $($clock.ElapsedMilliseconds)")
  $clock.Restart()
}
$dir = $null
# windows-lane-holds R3d: the phase lines named `lookup` as the slow one on the full Windows cells
# (52.3 s, 60.4 s and 65.3 s of 54.7, 62.4 and 68.6, runs 40178182310, 40261602993, 39441261818)
# while every later phase took milliseconds. Everything this phase called was a cmdlet PowerShell
# had to find first: Get-Command for a name not on PATH, then Join-Path, New-Item, Set-Content
# and Select-Object, which live in modules a -NoProfile session loads on first use, by searching
# PSModulePath. That search is the likely cost, not a measured one; so the phase now calls .NET
# only, and its next `lookup` line says whether it was. The PATH walk is a file check per
# directory and PATHEXT entry, which is what `Get-Command -CommandType Application` answered.
$exts = if ($IsWindows) { @($env:PATHEXT -split ';' | Where-Object { $_ }) } else { @('') }
function Test-OnPath([string]$name) {
  foreach ($d in ($env:PATH -split [System.IO.Path]::PathSeparator)) {
    if (-not $d) { continue }
    foreach ($e in $exts) {
      $p = [System.IO.Path]::Combine($d, $name + $e)
      if (-not [System.IO.File]::Exists($p)) { continue }
      if ($IsWindows) { return $true }
      # An Application on Unix is an executable file: any of the three execute bits (0o111).
      if (([int][System.IO.File]::GetUnixFileMode($p)) -band 73) { return $true }
    }
  }
  return $false
}
$seen = @{}
foreach ($l in $Line) {
  $program = ($l -split ' ')[0]
  if ($seen.ContainsKey($program)) { continue }
  $seen[$program] = $true
  if (Test-OnPath $program) { continue }
  if (-not $dir) {
    $dir = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), 'burgee-complete-' + [guid]::NewGuid().ToString('N'))
    [void][System.IO.Directory]::CreateDirectory($dir)
    $env:PATH = "$dir$([System.IO.Path]::PathSeparator)$env:PATH"
  }
  if ($IsWindows) {
    [System.IO.File]::WriteAllText([System.IO.Path]::Combine($dir, "$program.cmd"), "@echo off`r`n")
  } else {
    $stub = [System.IO.Path]::Combine($dir, $program)
    [System.IO.File]::WriteAllText($stub, "#!/bin/sh`nexit 0`n")
    [System.IO.File]::SetUnixFileMode($stub, [System.IO.UnixFileMode]'UserRead, UserWrite, UserExecute')
  }
}
Write-Phase 'lookup'
try {
  . $Script
  Write-Phase 'dot-source'
  $n = 0
  foreach ($l in $Line) {
    $found = (TabExpansion2 -inputScript $l -cursorColumn $l.Length).CompletionMatches
    $n += 1
    if ($Delimited) {
      "### $l"
      $found | ForEach-Object { "$($_.CompletionText)`t$($_.ToolTip)" }
    } else {
      $found | ForEach-Object CompletionText
    }
    Write-Phase "complete:$n"
  }
  $runs = @($Run -split "`n" | Where-Object { $_ -ne '' })
  for ($i = 0; $i -lt $runs.Count; $i++) {
    "### run:$i"
    try {
      $global:LASTEXITCODE = 0
      Invoke-Expression $runs[$i]
      "exit:$LASTEXITCODE"
    } catch {
      "error:$($_.Exception.Message)"
    }
    Write-Phase "run:$i"
  }
} finally {
  if ($dir) { [System.IO.Directory]::Delete($dir, $true) }
}
