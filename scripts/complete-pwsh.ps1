#!/usr/bin/env pwsh
# Prints what PowerShell offers for -Line with -Script loaded (D4), one candidate per line.
param([Parameter(Mandatory)][string]$Script, [Parameter(Mandatory)][string]$Line)
. $Script
(TabExpansion2 -inputScript $Line -cursorColumn $Line.Length).CompletionMatches | ForEach-Object CompletionText
