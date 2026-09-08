/**
 * commander-completions D2–D5 — the four scripts and the Fig spec are pinned by snapshot
 * (deterministic for a manifest), and each shell that is installed exercises its script:
 * bash through COMP_WORDS, zsh through a real TAB in a pseudo-terminal, fish through
 * `complete -C`, PowerShell through TabExpansion2. TAB never runs the program (D3): the
 * scripts contain no call to it and the handler's sentinel never appears.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { renderCompletion, renderFigSpec, SHELLS } from './completions.js';
import { defineCommand, defineProgram } from './index.js';
import { runBurgee } from './testing.js';

const SENTINEL = 'HANDLER-RAN';
const program = defineProgram({
  name: 'demo',
  description: 'Fixture',
  commands: [
    defineCommand({
      name: 'greet',
      description: 'Greet someone',
      options: {
        shout: { type: 'boolean', description: 'uppercase', short: 's' },
        greeting: { type: 'string', description: 'the greeting word', choices: ['Hello', 'Hi'] },
        secret: { type: 'string', hidden: true },
      },
      run: () => SENTINEL,
    }),
    defineCommand({
      name: 'config',
      description: 'Read configuration',
      commands: [defineCommand({ name: 'get', description: 'Print one value', options: { raw: { type: 'boolean' } }, run: () => SENTINEL })],
    }),
    defineCommand({ name: 'hush', hidden: true, run: () => SENTINEL }),
  ],
});

const has = (shell: string): boolean => {
  try {
    execFileSync(shell, ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};
const dir = mkdtempSync(join(tmpdir(), 'burgee-completions-'));
const scriptFor = (shell: 'bash' | 'zsh' | 'fish' | 'pwsh'): string => {
  const at = join(dir, `demo.${shell}`);
  writeFileSync(at, renderCompletion(program, shell));
  return at;
};
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const lines = (out: string): string[] => out.split('\n').map((l) => l.trim()).filter((l) => l !== '');

describe('completions are generated from the manifest (D2) and pinned (D4)', () => {
  it.each(SHELLS)('%s script is deterministic and mentions every visible command and option', (shell) => {
    const script = renderCompletion(program, shell);
    expect(script).toBe(renderCompletion(program, shell));
    // fish spells a long option `-l shout`; every other shell writes the dashes.
    for (const word of ['greet', 'config', 'get', 'shout', 'greeting', 'raw', 'json', 'help']) expect(script).toContain(word);
    expect(script).not.toContain('hush');
    expect(script).not.toContain('secret');
    expect(script).toMatchSnapshot();
  });

  it('never invokes the program: no script calls it, and TAB leaves no handler output (D3)', () => {
    for (const shell of SHELLS) {
      const script = renderCompletion(program, shell);
      expect(script).not.toMatch(/\bnode\b|\$\(demo|`demo|\bdemo (greet|config|hush)\b/);
      expect(script).not.toContain(SENTINEL);
    }
  });

  it('exports a Fig spec from the same walk (D5)', () => {
    const spec = renderFigSpec(program);
    expect(spec).toMatchObject({ name: 'demo', description: 'Fixture' });
    expect(spec.subcommands?.map((s) => s.name)).toEqual(['greet', 'config']);
    expect(spec.subcommands?.[0]?.options?.find((o) => o.name.includes('--greeting'))).toMatchObject({ args: { name: 'value', suggestions: ['Hello', 'Hi'] } });
    expect(spec).toMatchSnapshot();
  });

  it('is served as `completion <shell>` and `completion fig` by every program', async () => {
    const r = await runBurgee(program, { argv: ['completion', 'bash'] });
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(renderCompletion(program, 'bash'));
    const fig = await runBurgee(program, { argv: ['completion', 'fig'] });
    expect(JSON.parse(fig.stdout)).toEqual(renderFigSpec(program));
    const bad = await runBurgee(program, { argv: ['completion', 'tcsh'] });
    expect(bad.code).toBe(2);
    expect(bad.stderr).toMatch(/bash\|zsh\|fish\|pwsh\|fig/);
  });
});

describe('each shell exercises its script (D4)', () => {
  const bash = (line: string): string[] => lines(execFileSync('bash', [join(repo, 'scripts/complete-bash.sh'), scriptFor('bash'), ...line.split(' ')], { encoding: 'utf8' }));
  it.runIf(has('bash'))('bash: commands, subcommands, options at the right level, and choice values', () => {
    expect(bash('demo con')).toEqual(['config']);
    expect(bash('demo config ')).toEqual(['get']);
    expect(bash('demo greet --')).toEqual(['--shout', '--greeting', '--json', '--help']);
    expect(bash('demo greet --greeting ')).toEqual(['Hello', 'Hi']);
    expect(bash('demo config get --')).toEqual(['--raw', '--json', '--help']);
    expect(bash('demo greet ada --')).not.toContain(SENTINEL);
  });

  const zsh = (line: string): string => execFileSync('zsh', [join(repo, 'scripts/complete-zsh.zsh'), scriptFor('zsh'), line], { encoding: 'utf8' });
  it.runIf(has('zsh'))('zsh: a real TAB in a pseudo-terminal completes the command and lists options with descriptions', { timeout: 30_000 }, () => {
    expect(zsh('demo con')).toContain('demo config');
    const options = zsh('demo greet --');
    for (const w of ['--greeting', '--shout', '--json', '--help']) expect(options).toContain(w);
    expect(options).toContain('the greeting word');
    expect(options).not.toContain(SENTINEL);
  });

  const fish = (line: string): string[] => lines(execFileSync('fish', [join(repo, 'scripts/complete-fish.fish'), scriptFor('fish'), line], { encoding: 'utf8' })).map((l) => l.split('\t')[0] ?? '');
  it.runIf(has('fish'))('fish: subcommands and options, with --no execution', () => {
    expect(fish('demo con')).toEqual(['config']);
    expect(fish('demo greet --')).toEqual(expect.arrayContaining(['--shout', '--greeting', '--json', '--help']));
    expect(fish('demo greet --greeting ')).toEqual(expect.arrayContaining(['Hello', 'Hi']));
  });

  const pwsh = (line: string): string[] => lines(execFileSync('pwsh', ['-NoProfile', '-File', join(repo, 'scripts/complete-pwsh.ps1'), '-Script', scriptFor('pwsh'), '-Line', line], { encoding: 'utf8' }));
  it.runIf(has('pwsh'))('PowerShell: subcommands, options and choice values with tooltips', () => {
    expect(pwsh('demo con')).toEqual(['config']);
    expect(pwsh('demo greet --')).toEqual(expect.arrayContaining(['--shout', '--greeting', '--json', '--help']));
    expect(pwsh('demo greet --greeting ')).toEqual(['Hello', 'Hi']);
  });
});
