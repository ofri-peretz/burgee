/**
 * commander-completions D4 — each shell that is installed exercises its script: bash through
 * COMP_WORDS, zsh through a real TAB in a pseudo-terminal, fish through `complete -C`, PowerShell
 * through TabExpansion2. TAB never runs the program (D3): the handler's sentinel never appears.
 *
 * windows-lane-holds R3c — these cases spawn a shell and wait for it, and on a saturated Windows
 * runner the same `pwsh` call took 13.7–59.7 s inside the parallel pool against 0.9–2.3 s on a
 * lighter cell. So this file runs after the package's pool, alone: the `shells` project in
 * `vitest.config.ts` (`sequence.groupOrder: 1`, `fileParallelism: false`). The manifest-only
 * cases stay in `completions.test.ts`. Every assertion below moved from there verbatim.
 */
import { execFileSync, spawnSync, type SpawnSyncOptionsWithStringEncoding } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { renderCompletion } from './completions.js';
import { defineCommand, defineProgram } from './index.js';
import { host } from './runtime.js';
import { runBurgee } from './testing.js';
import { shellWord } from './unknown-option.js';

const SENTINEL = 'HANDLER-RAN';
// The same program `completions.test.ts` pins by snapshot.
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

const bash = (line: string): string[] => lines(execFileSync('bash', [join(repo, 'scripts/complete-bash.sh'), scriptFor('bash'), ...line.split(' ')], { encoding: 'utf8' }));

// A pty zsh under a loaded pre-push battery: up to 40 s to start and 30 s to list, per call.
const zsh = (line: string): string => execFileSync('zsh', [join(repo, 'scripts/complete-zsh.zsh'), scriptFor('zsh'), line], { encoding: 'utf8' });

const fish = (line: string): string[] => lines(execFileSync('fish', [join(repo, 'scripts/complete-fish.fish'), scriptFor('fish'), line], { encoding: 'utf8' })).map((l) => l.split('\t')[0] ?? '');

/** The case's own ceiling is 120 s; the call's is below it, so a hang fails with pwsh's own stderr. */
const PWSH_TIMEOUT_MS = 100_000;
/** Above this, the phase lines are printed, so the next slow run names the phase that ate the time. */
const PWSH_REPORT_MS = 10_000;

/**
 * windows-lane-holds R3b — how `pwsh` is called. stdin is closed rather than a pipe and the
 * session is `-NonInteractive`, so nothing can wait on input; the first-run update and telemetry
 * checks are off; and the call carries its own timeout under the case's.
 */
const pwshCall = (script: string, args: readonly string[]): { file: string; args: string[]; options: SpawnSyncOptionsWithStringEncoding } => ({
  file: 'pwsh',
  args: ['-NoProfile', '-NonInteractive', '-File', join(repo, 'scripts/complete-pwsh.ps1'), '-Script', script, ...args],
  options: {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: PWSH_TIMEOUT_MS,
    env: { ...process.env, POWERSHELL_UPDATECHECK: 'Off', POWERSHELL_TELEMETRY_OPTOUT: '1' },
  },
});

/** The `pwsh-phase <name> <ms>` lines `complete-pwsh.ps1` writes to stderr (R3a). */
const phases = (stderr: string): string[] => stderr.split(/\r?\n/).filter((l) => l.startsWith('pwsh-phase '));

const runPwsh = (args: readonly string[]): { stdout: string; stderr: string } => {
  const call = pwshCall(scriptFor('pwsh'), args);
  const started = Date.now();
  const r = spawnSync(call.file, call.args, call.options);
  const took = Date.now() - started;
  if (r.error !== undefined || r.status !== 0) {
    throw new Error(`pwsh ${r.error === undefined ? `exited ${String(r.status)}` : r.error.message} after ${took} ms\n${r.stderr}`);
  }
  if (took > PWSH_REPORT_MS) process.stderr.write(`pwsh took ${took} ms:\n${phases(r.stderr).join('\n')}\n`);
  return { stdout: r.stdout, stderr: r.stderr };
};

/**
 * Every line completed by one pwsh, against one dot-source of the script: `-Delimited` heads each
 * line's candidates with `### <line>` and prints each candidate as `<text>\t<tooltip>`. A line
 * the session never reached has no block, and reads as `undefined` here rather than as `[]`.
 * `runs` are command lines the same session runs afterwards (fix-lines-every-shell R3), each
 * under `### run:<n>`: its output, then `exit:<code>`.
 */
const pwsh = (queries: readonly string[], runs: readonly string[] = []): Map<string, { text: string; tip: string }[]> => {
  const out = runPwsh(['-Run', runs.join('\n'), '-Delimited', ...queries]).stdout;
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

/**
 * fix-lines-every-shell R3 — the `fix` a refusal prints on Windows, run in PowerShell as printed.
 * The program word is swapped for `& node <echo>`, which prints the argv it received, so the
 * check is that PowerShell parsed every word back to what the caller meant: `'`, `~`, `@` and `,`
 * among them. The fix comes from a real refusal with the platform read as `win32`, so the same
 * case runs under Linux's pwsh in completions.yml and on the Windows cells of compat.yml. The
 * second line is `shellWord`'s PowerShell form over the words its rule singles out, `--%`
 * included, which no refusal can carry as an argument.
 */
const ECHO = join(dir, 'echo.mjs');
// A line of its own: a native command's output reaches stdout as written, so without the newline
// the `exit:<code>` line after it would join it.
writeFileSync(ECHO, 'console.log(JSON.stringify(process.argv.slice(2)))\n');
const TYPED = ['echo', '--nmae', "it's", '~/x', '@a', 'a,b', '--json'];
const MEANT = ['echo', '--name', "it's", '~/x', '@a', 'a,b', '--json'];
const WORDS = ["it's", '@a', 'a,b', '--%', '~', '$HOME', '`x', 'C:\\Users\\RUNNER~1\\x', 'a b', 'plain'];
const node = `& node ${shellWord(ECHO, 'win32')}`;
async function windowsFix(): Promise<string> {
  const tool = defineProgram({ name: 'tool', commands: [defineCommand({ name: 'echo', effects: 'read_only', options: { name: { type: 'string' } }, run: () => undefined })] });
  const platform = vi.spyOn(host, 'platform', 'get').mockReturnValue('win32');
  try {
    return (JSON.parse((await runBurgee(tool, { argv: TYPED })).stdout) as { error: { fix: string } }).error.fix;
  } finally {
    platform.mockRestore();
  }
}

type Session = Map<string, { text: string; tip: string }[]>;
/**
 * One pwsh answers the completion case and R3's alike: a cold start costs 14–60 s on a busy
 * Windows cell (windows-lane-holds), so the fix lines ride the session that already starts.
 */
let session: Promise<Session> | undefined;
const pwshSession = async (): Promise<Session> => {
  session ??= windowsFix().then((fix) => pwsh(['demo con', 'demo greet --', 'demo greet --greeting '], [`${node}${fix.slice(fix.indexOf(' '))}`, `${node} ${WORDS.map((w) => shellWord(w, 'win32')).join(' ')}`]));
  return session;
};

describe('fix-lines-every-shell R1 — the refusal R3 runs', () => {
  it('a refusal on Windows prints its fix in PowerShell quoting: the line R3 hands to pwsh', async () => {
    expect(await windowsFix()).toBe("tool echo --name 'it''s' '~/x' '@a' 'a,b' --json");
  });
});

describe('windows-lane-holds R3 — pwsh cannot hang the case', () => {
  it('R3 — pwsh runs non-interactive, without first-run checks, under an inner timeout', () => {
    const call = pwshCall('demo.ps1', ['-Line', 'demo ']);
    expect(call.file).toBe('pwsh');
    expect(call.args.slice(0, 3)).toEqual(['-NoProfile', '-NonInteractive', '-File']);
    expect(call.options.stdio).toEqual(['ignore', 'pipe', 'pipe']);
    expect(call.options.env).toMatchObject({ POWERSHELL_UPDATECHECK: 'Off', POWERSHELL_TELEMETRY_OPTOUT: '1' });
    // Below the case's 120 s, and above the slowest passing run measured on `main` (59.7 s).
    expect(call.options.timeout).toBe(100_000);
  });

  it.runIf(has('pwsh'))('R3 — the PowerShell script reports its phases on stderr', { timeout: 120_000 }, () => {
    // Lines go positionally, as `pwsh()` passes them: naming `-Line` binds only its first value,
    // and PowerShell then refuses the second as a stray positional.
    const got = phases(runPwsh(['demo con', 'demo greet --']).stderr).map((l) => l.split(' ')[1]);
    expect(got).toEqual(['start', 'lookup', 'dot-source', 'complete:1', 'complete:2']);
    for (const line of phases(runPwsh(['demo con']).stderr)) expect(line).toMatch(/^pwsh-phase \S+ \d+$/);
  });
});

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
  it.runIf(has('pwsh'))('PowerShell: subcommands, options and choice values with tooltips', { timeout: 120_000 }, async () => {
    const got = await pwshSession();
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
    for (const [line, candidates] of got) if (!line.startsWith('run:')) for (const c of candidates) expect(c.tip, c.text).not.toBe('');
  });

  // fix-lines-every-shell R3, in the same pwsh session as the case above: no second cold start.
  it.runIf(has('pwsh'))('fix-lines-every-shell R3 — a fix line printed for Windows runs in PowerShell as printed', { timeout: 120_000 }, async () => {
    const got = await pwshSession();
    const ran = (n: number): string[] | undefined => got.get(`run:${String(n)}`)?.map((c) => c.text);
    expect(ran(0)).toEqual([JSON.stringify(MEANT), 'exit:0']);
    expect(ran(1)).toEqual([JSON.stringify(WORDS), 'exit:0']);
  });
});
