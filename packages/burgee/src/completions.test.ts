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
      effects: 'withheld',
      run: () => SENTINEL,
    }),
    defineCommand({
      name: 'config',
      description: 'Read configuration',
      commands: [defineCommand({ name: 'get', description: 'Print one value', options: { raw: { type: 'boolean' } }, effects: 'withheld', run: () => SENTINEL })],
    }),
    defineCommand({ name: 'hush', hidden: true, effects: 'withheld', run: () => SENTINEL }),
  ],
});

/**
 * A job that installs the shells sets `REQUIRE_SHELLS=1` (completions.yml, and both coverage
 * jobs). There a missing shell fails this file instead of skipping its case: a skip is how the
 * code only these cases reach went uncovered on CI, unnoticed, until 2026-09-30.
 */
const REQUIRE_SHELLS = process.env['REQUIRE_SHELLS'] === '1';
const has = (shell: string): boolean => {
  try {
    execFileSync(shell, ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    if (REQUIRE_SHELLS) throw new Error(`${shell} is not installed, and REQUIRE_SHELLS=1 says this job installs it`);
    return false;
  }
};
const dir = mkdtempSync(join(tmpdir(), 'burgee-completions-'));
// PowerShell dot-sources only a `.ps1` file; any other extension is a file to open.
const EXT = { bash: 'bash', zsh: 'zsh', fish: 'fish', pwsh: 'ps1' } as const;
const scriptFor = (shell: 'bash' | 'zsh' | 'fish' | 'pwsh'): string => {
  const at = join(dir, `demo.${EXT[shell]}`);
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

const bash = (line: string): string[] => lines(execFileSync('bash', [join(repo, 'scripts/complete-bash.sh'), scriptFor('bash'), ...line.split(' ')], { encoding: 'utf8' }));

// A pty zsh under a loaded pre-push battery: up to 40 s to start and 30 s to list, per call.
const zsh = (line: string): string => execFileSync('zsh', [join(repo, 'scripts/complete-zsh.zsh'), scriptFor('zsh'), line], { encoding: 'utf8' });

const fish = (line: string): string[] => lines(execFileSync('fish', [join(repo, 'scripts/complete-fish.fish'), scriptFor('fish'), line], { encoding: 'utf8' })).map((l) => l.split('\t')[0] ?? '');

/**
 * Every line completed by one pwsh, against one dot-source of the script: `-Delimited` heads each
 * line's candidates with `### <line>` and prints each candidate as `<text>\t<tooltip>`. A line
 * the session never reached has no block, and reads as `undefined` here rather than as `[]`.
 */
const pwsh = (...queries: string[]): Map<string, { text: string; tip: string }[]> => {
  const out = execFileSync('pwsh', ['-NoProfile', '-File', join(repo, 'scripts/complete-pwsh.ps1'), '-Script', scriptFor('pwsh'), '-Delimited', ...queries], { encoding: 'utf8' });
  const blocks = new Map<string, { text: string; tip: string }[]>();
  let current: { text: string; tip: string }[] = [];
  for (const raw of out.split(/\r?\n/)) {
    if (raw.startsWith('### ')) blocks.set(raw.slice(4), (current = []));
    else if (raw.trim() !== '') {
      const [text = '', tip = ''] = raw.split('\t');
      current.push({ text: text.trim(), tip: tip.trim() });
    }
  }
  return blocks;
};

describe('each shell exercises its script (D4)', () => {
  // The three shells below carry a 30 s allowance and this one did not, which
  // is the whole difference: it spawns bash six times, and a process spawn on
  // a Windows runner costs an order of magnitude more than on Linux. It timed
  // out at 5 s on windows-latest while passing everywhere else. Nothing about
  // the assertions changed — the allowance is for the runner, not the test.
  it.runIf(has('bash'))('bash: commands, subcommands, options at the right level, and choice values', { timeout: 30_000 }, () => {
    expect(bash('demo con')).toEqual(['config']);
    expect(bash('demo config ')).toEqual(['get']);
    // `--no-shout` and `--no-raw` and no others: every declared boolean is negatable, and
    // the reserved surfaces are not — `toParseConfig` registers `no-<name>` for a command's
    // own options only, so completing `--no-json` would offer a flag the parser refuses.
    // A real bash TAB is the strongest place that boundary is asserted.
    expect(bash('demo greet --')).toEqual(['--shout', '--no-shout', '--greeting', '--json', '--help']);
    expect(bash('demo greet --greeting ')).toEqual(['Hello', 'Hi']);
    expect(bash('demo config get --')).toEqual(['--raw', '--no-raw', '--json', '--help']);
    expect(bash('demo greet ada --')).not.toContain(SENTINEL);
  });

  it.runIf(has('zsh'))('zsh: a real TAB in a pseudo-terminal completes the command and lists options with descriptions', { timeout: 120_000 }, () => {
    expect(zsh('demo con')).toContain('demo config');
    const options = zsh('demo greet --');
    for (const w of ['--greeting', '--shout', '--json', '--help']) expect(options).toContain(w);
    expect(options).toContain('the greeting word');
    expect(options).not.toContain(SENTINEL);
  });

  it.runIf(has('fish'))('fish: subcommands and options, with --no execution', { timeout: 30_000 }, () => {
    expect(fish('demo con')).toEqual(['config']);
    expect(fish('demo greet --')).toEqual(expect.arrayContaining(['--shout', '--greeting', '--json', '--help']));
    expect(fish('demo greet --greeting ')).toEqual(expect.arrayContaining(['Hello', 'Hi']));
  });

  // pwsh starts cold in about two seconds on a runner, and a saturated Windows runner pays that
  // many times over: one process per line took 33.6 s for three (#484, #433), and timed out at
  // 120 s on the release PR #1077. So every line is asked of one pwsh — one cold start, however
  // many lines — and the ceiling is for that one start, not for a count of them.
  it.runIf(has('pwsh'))('PowerShell: subcommands, options and choice values with tooltips', { timeout: 120_000 }, () => {
    const got = pwsh('demo con', 'demo greet --', 'demo greet --greeting ');
    const texts = (line: string): string[] | undefined => got.get(line)?.map((c) => c.text);
    const tip = (line: string, text: string): string | undefined => got.get(line)?.find((c) => c.text === text)?.tip;
    expect(texts('demo con')).toEqual(['config']);
    expect(tip('demo con', 'config')).toBe('Read configuration');
    expect(texts('demo greet --')).toEqual(expect.arrayContaining(['--shout', '--greeting', '--json', '--help']));
    expect(tip('demo greet --', '--greeting')).toBe('the greeting word');
    expect(tip('demo greet --', '--shout')).toBe('uppercase');
    expect(tip('demo greet --', '--json')).toBe('machine-readable output');
    expect(texts('demo greet --greeting ')).toEqual(['Hello', 'Hi']);
    // A choice value carries itself as its tooltip; an option or command, its description.
    expect(got.get('demo greet --greeting ')).toEqual([{ text: 'Hello', tip: 'Hello' }, { text: 'Hi', tip: 'Hi' }]);
    for (const candidates of got.values()) for (const c of candidates) expect(c.tip, c.text).not.toBe('');
  });
});
