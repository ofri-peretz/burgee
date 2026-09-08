#!/usr/bin/env pwsh
# Prints what PowerShell offers for -Line with -Script loaded (D4), one candidate per line.
#   scripts/complete-pwsh.ps1 -Script <completion-script> -Line '<line>'
# A native argument completer fires only for a command PowerShell can resolve, so the
# program named by the line gets a stub executable on PATH for the duration of the call.
param([Parameter(Mandatory)][string]$Script, [Parameter(Mandatory)][string]$Line)
$program = ($Line -split ' ')[0]
$dir = Join-Path ([System.IO.Path]::GetTempPath()) ("burgee-complete-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $dir | Out-Null
if ($IsWindows) {
  Set-Content -Path (Join-Path $dir "$program.cmd") -Value '@echo off'
} else {
  $stub = Join-Path $dir $program
  Set-Content -Path $stub -Value "#!/bin/sh`nexit 0"
  chmod +x $stub
}
$env:PATH = "$dir$([System.IO.Path]::PathSeparator)$env:PATH"
. $Script
(TabExpansion2 -inputScript $Line -cursorColumn $Line.Length).CompletionMatches | ForEach-Object CompletionText
Remove-Item -Recurse -Force $dir
