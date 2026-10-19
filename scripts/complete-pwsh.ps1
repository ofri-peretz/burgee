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
param([Parameter(Mandatory)][string]$Script, [Parameter(Mandatory, ValueFromRemainingArguments)][string[]]$Line, [switch]$Delimited)
$clock = [Diagnostics.Stopwatch]::StartNew()
$booted = [int]([DateTime]::Now - [Diagnostics.Process]::GetCurrentProcess().StartTime).TotalMilliseconds
[Console]::Error.WriteLine("pwsh-phase start $booted")
function Write-Phase([string]$name) {
  [Console]::Error.WriteLine("pwsh-phase $name $($clock.ElapsedMilliseconds)")
  $clock.Restart()
}
$dir = $null
foreach ($program in @($Line | ForEach-Object { ($_ -split ' ')[0] } | Select-Object -Unique)) {
  if (Get-Command $program -CommandType Application -TotalCount 1 -ErrorAction SilentlyContinue) { continue }
  if (-not $dir) {
    $dir = Join-Path ([System.IO.Path]::GetTempPath()) ("burgee-complete-" + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $dir | Out-Null
    $env:PATH = "$dir$([System.IO.Path]::PathSeparator)$env:PATH"
  }
  if ($IsWindows) {
    Set-Content -Path (Join-Path $dir "$program.cmd") -Value '@echo off'
  } else {
    $stub = Join-Path $dir $program
    Set-Content -Path $stub -Value "#!/bin/sh`nexit 0"
    chmod +x $stub
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
} finally {
  if ($dir) { Remove-Item -Recurse -Force $dir }
}
