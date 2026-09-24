/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * D3 / D-119 — an option that declares `complete` is completed by calling the program back;
 * every other option still never runs it. Proven with a real program on `PATH` and each
 * shell's own completion machinery, because a script that only *looks* right is the failure
 * yargs #1965 and #1684 are about.
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { renderCompletion, SHELLS } from './completions.js';
import { defineCommand, defineProgram } from './index.js';
import { runBurgee } from './testing.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const dist = resolve(here, '../dist/index.js');

const PROGRAM = `
import { defineCommand, defineProgram, execute } from ${JSON.stringify(dist)};
await execute(defineProgram({
  name: 'dyn',
  commands: [defineCommand({
    name: 'deploy',
    options: {
      region: { type: 'string', complete: (p) => ['eu-west', 'eu-north', 'us-east'].filter((r) => r.startsWith(p)) },
      tier: { type: 'string', choices: ['free', 'pro'] },
    },
    effects: 'withheld',
    run: () => 'deployed',
  })],
}));
`;

const program = defineProgram({
  name: 'dyn',
  commands: [
    defineCommand({
      name: 'deploy',
      options: {
        region: { type: 'string', complete: (p: string) => ['eu-west', 'eu-north', 'us-east'].filter((r) => r.startsWith(p)) },
        tier: { type: 'string', choices: ['free', 'pro'] },
        flaky: {
          type: 'string',
          complete: () => {
            throw new Error('the API is down');
          },
        },
      },
      effects: 'withheld',
      run: () => 'deployed',
    }),
  ],
});

const dir = mkdtempSync(join(tmpdir(), 'burgee-dynamic-'));
writeFileSync(join(dir, 'prog.mjs'), PROGRAM);
writeFileSync(join(dir, 'dyn'), `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(join(dir, 'prog.mjs'))} "$@"\n`);
chmodSync(join(dir, 'dyn'), 0o755);
const env = { ...process.env, PATH: `${dir}:${process.env['PATH'] ?? ''}` };
const EXT = { bash: 'bash', zsh: 'zsh', fish: 'fish', pwsh: 'ps1' } as const;
const scriptFor = (shell: (typeof SHELLS)[number]): string => {
  const at = join(dir, `dyn.${EXT[shell]}`);
  writeFileSync(at, renderCompletion(program, shell));
  return at;
};
const has = (shell: string): boolean => {
  try {
    execFileSync(shell, ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};
/**
 * The program on PATH is a POSIX shell wrapper, and PATH is `:`-separated: Windows runners can
 * have bash (Git's) without either, so the real-shell cases run where the wrapper does.
 */
const POSIX = process.platform !== 'win32';
const lines = (out: string): string[] => out.split('\n').map((l) => l.trim()).filter((l) => l !== '');

describe('the program side: `__complete` (D3)', () => {
  it('prints the completer’s candidates for the partial, one per line', async () => {
    const r = await runBurgee(program, { argv: ['__complete', 'deploy', '--region', 'eu'] });
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('eu-west\neu-north\n');
  });

  it('prints nothing, and exits 0, for an option with no completer, an unknown command, or a completer that throws', async () => {
    const cases = [['deploy', '--tier', ''], ['nope', '--region', ''], ['deploy', '--flaky', '']];
    const results = await Promise.all(cases.map(async (argv) => runBurgee(program, { argv: ['__complete', ...argv] })));
    results.forEach((r, i) => expect([r.code, r.stdout, r.stderr], cases[i]?.join(' ')).toEqual([0, '', '']));
  });
});

describe('the script side: only a declared completer calls back (D3)', () => {
  it.each(SHELLS)('%s: says so in its header, and calls back for --region alone', (shell) => {
    const script = renderCompletion(program, shell);
    expect(script).toContain('runs dyn on TAB only for options that declare a completer');
    // PowerShell builds the command path at run time from the words typed; the rest spell it out.
    const region = shell === 'pwsh' ? "Dynamic = @{ '--region' = $true" : '__complete deploy --region';
    const tier = shell === 'pwsh' ? "'--tier' = $true" : '__complete deploy --tier';
    expect(script).toContain(region);
    expect(script).not.toContain(tier);
  });

  const bash = (line: string): string[] => lines(execFileSync('bash', [join(repo, 'scripts/complete-bash.sh'), scriptFor('bash'), ...line.split(' ')], { encoding: 'utf8', env }));
  it.runIf(POSIX && has('bash'))('bash: TAB after --region asks the program', { timeout: 30_000 }, () => {
    expect(bash('dyn deploy --region ')).toEqual(['eu-west', 'eu-north', 'us-east']);
    expect(bash('dyn deploy --region eu')).toEqual(['eu-west', 'eu-north']);
    expect(bash('dyn deploy --tier ')).toEqual(['free', 'pro']);
  });

  const zsh = (line: string): string => execFileSync('zsh', [join(repo, 'scripts/complete-zsh.zsh'), scriptFor('zsh'), line], { encoding: 'utf8', env });
  it.runIf(POSIX && has('zsh'))('zsh: TAB after --region lists what the program returned', { timeout: 30_000 }, () => {
    const out = zsh('dyn deploy --region ');
    for (const r of ['eu-west', 'eu-north', 'us-east']) expect(out).toContain(r);
  });

  const fish = (line: string): string[] => lines(execFileSync('fish', [join(repo, 'scripts/complete-fish.fish'), scriptFor('fish'), line], { encoding: 'utf8', env })).map((l) => l.split('\t')[0] ?? '');
  it.runIf(POSIX && has('fish'))('fish: TAB after --region lists what the program returned', { timeout: 30_000 }, () => {
    expect(fish('dyn deploy --region ')).toEqual(expect.arrayContaining(['eu-west', 'eu-north', 'us-east']));
  });

  const pwsh = (line: string): string[] => lines(execFileSync('pwsh', ['-NoProfile', '-File', join(repo, 'scripts/complete-pwsh.ps1'), '-Script', scriptFor('pwsh'), '-Line', line], { encoding: 'utf8', env }));
  it.runIf(POSIX && has('pwsh'))('PowerShell: TAB after --region lists what the program returned', { timeout: 30_000 }, () => {
    expect(pwsh('dyn deploy --region ')).toEqual(['eu-west', 'eu-north', 'us-east']);
  });
});
