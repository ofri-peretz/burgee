/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * windows-lane-holds R3d — the `lookup` phase of `scripts/complete-pwsh.ps1` calls no cmdlet.
 *
 * R3a's phase lines named the slow phase on the full Windows cells: `lookup` took 52.3 s,
 * 60.4 s and 65.3 s of cases that took 54.7, 62.4 and 68.6 s (runs 40178182310, 40261602993,
 * 39441261818), while `dot-source` and every `complete:<n>` took milliseconds. On `main` the
 * phase called `Get-Command` for a name not on PATH, then `Join-Path`, `New-Item`, `Set-Content`
 * and `Select-Object`: each one a command PowerShell must find, and four of them in modules a
 * `-NoProfile` session loads on first use. The phase now calls .NET only, and this lock keeps a
 * cmdlet from coming back into it. `Where-Object` stays: it is in the engine's own snap-in,
 * which no search loads. The script's own functions are not cmdlets.
 *
 * Whether the search was the cost is measured, not assumed: the next full Windows cells print the
 * `lookup` line again, and the intent's criterion 2 reads them.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');

/**
 * One line with its strings blanked and its comment cut, read left to right: a `#` inside a
 * string is not a comment (`"#!/bin/sh"`), and a quote inside a comment opens no string.
 */
function codeOf(line: string): string {
  let out = '';
  let quote = '';
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i] as string;
    if (quote !== '') {
      if (quote === '"' && c === '`') i += 1;
      else if (c === quote) quote = '';
      continue;
    }
    if (c === '#') break;
    if (c === '"' || c === "'") {
      quote = c;
      out += "''";
      continue;
    }
    out += c;
  }
  return out;
}

/** Verb-Noun words outside comments and strings: what PowerShell resolves as a command. */
function commandWords(source: string): string[] {
  const code = source.split('\n').map(codeOf).join('\n');
  return [...new Set(code.match(/\b[A-Z][a-z]+-[A-Z][A-Za-z0-9]*\b/gu) ?? [])];
}

/** The script from the start of the PATH walk to the `lookup` phase line, and its `finally` block. */
function regions(script: string): { lookup: string; cleanup: string } {
  const start = script.indexOf('$dir = $null');
  const end = script.indexOf("Write-Phase 'lookup'");
  const cleanup = script.slice(script.lastIndexOf('} finally {'));
  if (start === -1 || end === -1 || end < start) throw new Error('complete-pwsh.ps1 no longer has a lookup phase this lock can find');
  return { lookup: script.slice(start, end), cleanup };
}

/** The engine's own commands and the script's functions: nothing PowerShell searches modules for. */
const ALLOWED = new Set(['Where-Object', 'ForEach-Object', 'Test-OnPath', 'Write-Phase']);

describe('windows-lane-holds R3d — the lookup phase calls .NET, not cmdlets', () => {
  const script = readFileSync(join(ROOT, 'scripts/complete-pwsh.ps1'), 'utf8');

  it('reads the command words of a line, and none inside a comment or a string', () => {
    expect(commandWords("if (Get-Command $p) { 'Set-Content' } # Remove-Item\n\"New-Item `\" x\" | Select-Object -Unique")).toEqual(['Get-Command', 'Select-Object']);
    // A `#` inside a string is not a comment: the command after it on the line still counts.
    expect(commandWords('[IO.File]::WriteAllText($stub, "#!/bin/sh") ; Set-Content x')).toEqual(['Set-Content']);
    expect(commandWords("# it's a comment, Get-Command\nNew-Item")).toEqual(['New-Item']);
    expect(() => regions('no phases here')).toThrow(/no longer has a lookup phase/u);
  });

  it('finds the program on PATH, and writes its stub, without a cmdlet', () => {
    expect(commandWords(regions(script).lookup).filter((w) => !ALLOWED.has(w))).toEqual([]);
  });

  it('removes the stub directory without a cmdlet: the case pays for the cleanup too', () => {
    expect(commandWords(regions(script).cleanup).filter((w) => !ALLOWED.has(w))).toEqual([]);
  });
});
