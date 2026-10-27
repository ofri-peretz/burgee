/**
 * A handler that fails under `--json` is **one** `{ ok: false, error }` envelope on stdout, the
 * E1 code its error names, and nothing else on stdout — on every front end (O1, E1, E3, E6;
 * D-140).
 *
 * Reported by the I-26 tutorial run against burgee@0.11.1, and reproduced from a clean
 * `npm i burgee@0.11.1 commander` before a line here was written:
 *
 * - **`burgee/commander`, run the way commander programs are run** — `program.parseAsync(process.argv)`
 *   with nothing injected. `_runBurgee` decided *"no seam, commander's own contract"* before
 *   argv was parsed, and `--json` is only recognised during the parse, so a handler that threw
 *   escaped `parseAsync` and Node printed the stack: exit 1, stdout empty, a stack trace on
 *   stderr, for a sync throw, an async rejection, a thrown string and an `AuthError` alike. The
 *   injected path (`--mcp`, the harness) had always caught it, which is why no test saw it.
 * - **the engine** reported the failure envelope on **stderr** with stdout empty, while both
 *   façades and the O1 contract put it on stdout — so a caller reading stdout for the envelope,
 *   which is what `--json` promises, read nothing on exactly the runs that needed it.
 * - **`burgee/yargs`** let a synchronous throw and a thrown non-Error escape `parseAsync()` as
 *   an uncaught exception, filed a thrown string as a `usage` error (exit 2: *rewrite the
 *   command*), and under `--mcp` wrote an async rejection's envelope **twice**.
 * - **both façades** filed an `AuthError` as `runtime`, exit 1, where E6 promises exit 5.
 *
 * Each case below was run red against the unfixed tree first.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { Command } from './commander.js';
import { AuthError, defineCommand, defineProgram, ExitCode } from './index.js';
import { runBurgee } from './testing.js';
import yargs from './yargs.js';

/** One way a handler fails, and what it must settle to: the E1 code, the message, and the façades' word for it. */
interface Case {
  name: string;
  run: () => unknown;
  exit: number;
  message: string;
  facade: 'runtime' | 'auth';
}

function throwsSync(): never {
  throw new Error('sync boom');
}

async function rejects(): Promise<never> {
  await Promise.resolve();
  throw new Error('async boom');
}

function throwsNonError(): never {
  // The case under test: a handler that throws something that is not an Error.
  throw 'a string';
}

function throwsAuth(): never {
  throw new AuthError('token expired', 'the session ended', 'app login');
}

const CASES: readonly Case[] = [
  { name: 'sync', run: throwsSync, exit: ExitCode.RUNTIME, message: 'sync boom', facade: 'runtime' },
  { name: 'async', run: rejects, exit: ExitCode.RUNTIME, message: 'async boom', facade: 'runtime' },
  { name: 'nonerror', run: throwsNonError, exit: ExitCode.RUNTIME, message: 'a string', facade: 'runtime' },
  { name: 'auth', run: throwsAuth, exit: ExitCode.AUTH, message: 'token expired', facade: 'auth' },
];

/** Exactly one line on stdout, and it is the envelope. */
function onlyEnvelope(stdout: string): Record<string, unknown> {
  const lines = stdout.split('\n').filter((l) => l !== '');
  expect(lines, `stdout must carry exactly one envelope, got: ${JSON.stringify(stdout)}`).toHaveLength(1);
  const body = JSON.parse(lines[0] ?? '') as Record<string, unknown>;
  expect(body['ok']).toBe(false);
  return body;
}

const nativeProgram = defineProgram({ name: 'app', commands: CASES.map(({ name, run }) => defineCommand({ name, effects: 'read_only', run })) });

/**
 * clispec-conformance R6 — the one line stderr carries on a failure, `{"error":{"kind","code","message"}}`:
 * what clispec's "Structured errors" and cli-agent-lint's SD-1 read off stderr.
 */
function errorLine(stderr: string): Record<string, unknown> {
  const last = stderr.split('\n').findLast((l) => l.trim() !== '') ?? '';
  return JSON.parse(last) as Record<string, unknown>;
}

describe('the engine: a failing handler under --json', () => {
  it.each(CASES)('$name: the envelope is on stdout, alone, and stderr is the one structured line (R6)', async ({ name, exit, message, facade }) => {
    const r = await runBurgee(nativeProgram, { argv: [name, '--json'] });
    expect(r.code).toBe(exit);
    const { error } = onlyEnvelope(r.stdout) as { error: Record<string, unknown> };
    expect(error).toMatchObject({ kind: facade, code: exit, message });
    // Exactly one line, and it parses whole: `JSON.parse(stderr)`.
    expect(r.stderr.split('\n').filter((l) => l !== '')).toHaveLength(1);
    expect(JSON.parse(r.stderr)).toEqual({ error: { kind: facade, code: exit, message } });
    expect(r.stdout).not.toContain('    at ');
  });

  it('carries hint and fix from a classified error (E3, E6), and the kind beside the code (R2)', async () => {
    const r = await runBurgee(nativeProgram, { argv: ['auth', '--json'] });
    expect(r.json).toEqual({ ok: false, error: { kind: 'auth', code: ExitCode.AUTH, message: 'token expired', hint: 'the session ended', fix: 'app login' } });
  });

  it.each(CASES)('$name: plain mode keeps its prose on stderr, nothing on stdout, and the structured line last when stderr is piped (R6)', async ({ name, exit, message, facade }) => {
    const r = await runBurgee(nativeProgram, { argv: [name] });
    expect(r.code).toBe(exit);
    expect(r.stdout).toBe('');
    expect(r.stderr.startsWith(`error: ${message}\n`)).toBe(true);
    expect(errorLine(r.stderr)).toEqual({ error: { kind: facade, code: exit, message } });
  });

  it.each(CASES)('$name: at a terminal, stderr is the prose alone — no JSON (R6)', async ({ name, message }) => {
    const r = await runBurgee(nativeProgram, { argv: [name], tty: { stderr: true } });
    expect(r.stderr.startsWith(`error: ${message}\n`)).toBe(true);
    expect(r.stderr).not.toContain('{"error"');
  });

  /**
   * caller-matrix, `errors` × `accessible`: a screen reader at a terminal that could take colour.
   * What it hears is the labelled prose, each line once — `error:`, then `hint:` and `fix:` when
   * the error carries them, or the command's `usage:` when it does not — with no escape to read out, no carriage return to re-announce, and
   * no JSON line, because stderr is a terminal. Run red twice in a scratch edit of `failure.ts`:
   * writing the structured line at a terminal too, and dropping the `fix:` line.
   */
  it.each(CASES)('$name: under CLI_ACCESSIBLE at a colour terminal, stderr is the labelled prose once, with no escape and no JSON', async ({ name, run, message }) => {
    const r = await runBurgee(nativeProgram, { argv: [name], env: { TERM: 'xterm-256color', COLORTERM: 'truecolor', CLI_ACCESSIBLE: '1' }, tty: { stdout: true, stderr: true } });
    expect(r.stdout).toBe('');
    expect(r.stderr).not.toMatch(/[\r\u001B]/);
    expect(r.stderr).not.toContain('{"error"');
    const lines = r.stderr.split('\n').filter((l) => l !== '');
    const auth = run === throwsAuth;
    expect(lines).toEqual(auth ? [`error: ${message}`, 'hint: the session ended', 'fix: app login'] : [`error: ${message}`, `usage: app ${name}`]);
  });

  it('puts a usage failure on stdout too, so one rule covers every --json failure', async () => {
    const r = await runBurgee(nativeProgram, { argv: ['sync', '--json', '--nope'] });
    expect(r.code).toBe(ExitCode.USAGE);
    expect(onlyEnvelope(r.stdout)).toMatchObject({ error: { kind: 'usage', code: ExitCode.USAGE } });
    expect(JSON.parse(r.stderr)).toMatchObject({ error: { kind: 'usage', code: ExitCode.USAGE } });
  });

  it('an unknown command is structured on stderr too: what both checkers probe (R6)', async () => {
    const r = await runBurgee(nativeProgram, { argv: ['__nonexistent_command__'] });
    expect(r.code).toBe(ExitCode.USAGE);
    expect(errorLine(r.stderr)).toMatchObject({ error: { kind: 'usage', code: ExitCode.USAGE } });
  });

  it('an exit signal stays silent: nothing failed, so nothing is structured', async () => {
    const quiet = defineProgram({ name: 'app', commands: [defineCommand({ name: 'leave', effects: 'read_only', run: ({ exit }) => exit(ExitCode.CONFIG) })] });
    const r = await runBurgee(quiet, { argv: ['leave'] });
    expect(r.code).toBe(ExitCode.CONFIG);
    expect(r.stderr).toBe('');
  });
});

/** A commander program declared the way the tutorial declares it, on a fresh `Command` each time. */
function commanderProgram(): Command {
  const program = new Command('app');
  for (const { name, run } of CASES) program.command(name).action(run);
  return program;
}

/** What the process's own stdout and stderr receive, until `vi.restoreAllMocks()`. */
function captureProcess(): { out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((s: string | Uint8Array) => out.push(String(s)) > 0);
  vi.spyOn(process.stderr, 'write').mockImplementation((s: string | Uint8Array) => err.push(String(s)) > 0);
  return { out, err };
}

function resetProcess(): void {
  vi.restoreAllMocks();
  process.exitCode = undefined;
}

describe('burgee/commander run the commander way — nothing injected', () => {
  afterEach(resetProcess);

  it.each(CASES)('$name: parseAsync settles to the envelope and the E1 code instead of rejecting', async ({ name, exit, message, facade }) => {
    const { out, err } = captureProcess();
    await expect(commanderProgram().parseAsync([name, '--json'], { from: 'user' })).resolves.toBeDefined();
    vi.restoreAllMocks();
    expect(process.exitCode).toBe(exit);
    expect(onlyEnvelope(out.join(''))).toMatchObject({ error: { code: facade, message } });
    expect(err.join('')).toBe('');
  });

  it('a synchronous parse() does not throw either', () => {
    const { out } = captureProcess();
    expect(() => commanderProgram().parse(['sync', '--json'], { from: 'user' })).not.toThrow();
    vi.restoreAllMocks();
    expect(process.exitCode).toBe(ExitCode.RUNTIME);
    expect(onlyEnvelope(out.join(''))).toMatchObject({ error: { code: 'runtime', message: 'sync boom' } });
  });

  it('carries the classified code, hint and fix of an AuthError', async () => {
    const { out } = captureProcess();
    await commanderProgram().parseAsync(['auth', '--json'], { from: 'user' });
    vi.restoreAllMocks();
    expect(JSON.parse(out.join(''))).toEqual({ ok: false, error: { code: 'auth', message: 'token expired', hint: 'the session ended', fix: 'app login' } });
  });

  it('without --json the rejection is commander’s own, untouched', async () => {
    await expect(commanderProgram().parseAsync(['async'], { from: 'user' })).rejects.toThrow('async boom');
    expect(process.exitCode).toBeUndefined();
  });

  it('does not leave --json switched on for the next parse of the same program', async () => {
    const program = new Command('app');
    program.command('ok').action(() => ({ fine: true }));
    const { out } = captureProcess();
    await program.parseAsync(['ok', '--json'], { from: 'user' });
    await program.parseAsync(['ok'], { from: 'user' });
    vi.restoreAllMocks();
    expect(out.join('')).toBe(`${JSON.stringify({ ok: true, data: { fine: true }, meta: { provenance: {} } })}\n`);
  });
});

describe('burgee/commander with the seam injected (--mcp, the harness)', () => {
  it.each(CASES)('$name: one envelope, and the code the error names', async ({ name, exit, message, facade }) => {
    const out: string[] = [];
    const err: string[] = [];
    let code = -1;
    await commanderProgram().parseAsync([name, '--json'], { from: 'user', stdout: { write: (s) => out.push(s) }, stderr: { write: (s) => err.push(s) }, exit: (c) => void (code = c) });
    expect(code).toBe(exit);
    expect(onlyEnvelope(out.join(''))).toMatchObject({ error: { code: facade, message } });
    expect(err.join('')).toBe('');
  });
});

/** A yargs program declared the way the tutorial declares it, with the seam optional. */
function yargsProgram(argv: string[]): ReturnType<typeof yargs> {
  let y = yargs(argv).scriptName('app');
  for (const { name, run } of CASES) y = y.command(name, name, () => undefined, run);
  return y;
}

/** `process.exit` that records its code rather than leaving, so a test can read it. */
function recordExit(code?: string | number | null): never {
  process.exitCode = code;
  return undefined as never;
}

describe('burgee/yargs: a failing handler under --json', () => {
  afterEach(resetProcess);

  it.each(CASES)('$name: nothing injected, parseAsync settles to one envelope and the E1 code', async ({ name, exit, message, facade }) => {
    const out: string[] = [];
    const err: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((s: unknown) => void out.push(`${String(s)}\n`));
    vi.spyOn(console, 'error').mockImplementation((s: unknown) => void err.push(`${String(s)}\n`));
    vi.spyOn(process, 'exit').mockImplementation(recordExit);
    await yargsProgram([name, '--json']).parseAsync();
    vi.restoreAllMocks();
    expect(process.exitCode).toBe(exit);
    expect(onlyEnvelope(out.join(''))).toMatchObject({ error: { code: facade, message } });
    expect(err.join('')).toBe('');
  });

  it.each(CASES)('$name: with the seam, one envelope and the code the error names', async ({ name, exit, message, facade }) => {
    const out: string[] = [];
    let code = -1;
    await yargsProgram([name, '--json'])
      .burgee({ stdout: { write: (s: string) => void out.push(s) }, stderr: { write: () => undefined }, exit: (c: number) => void (code = c) })
      .parseAsync();
    expect(code).toBe(exit);
    expect(onlyEnvelope(out.join(''))).toMatchObject({ error: { code: facade, message } });
  });
});

function toolCall(id: number, name: string): string {
  return JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: {} } });
}

describe('--mcp: a failing tool call is an MCP error result, and the server keeps serving', () => {
  it.each(CASES)('$name: isError with the envelope as the text, then answers the next call', async ({ name, exit, message }) => {
    const r = await runBurgee(nativeProgram, { argv: ['--mcp'], stdin: Readable.from([`${toolCall(1, name)}\n${toolCall(2, 'sync')}\n`]) });
    const replies = r.stdout.split('\n').filter((l) => l !== '').map((l) => JSON.parse(l) as { id: number; result: { isError: boolean; content: { text: string }[] } });
    // Calls are dispatched together (mcp-current R4), so each reply goes out when its call settles.
    expect(replies.map((x) => x.id).sort()).toEqual([1, 2]);
    const first = replies.find((x) => x.id === 1);
    expect(first?.result.isError).toBe(true);
    expect(JSON.parse(first?.result.content[0]?.text ?? '')).toMatchObject({ ok: false, error: { code: exit, message } });
  });
});

/** An import specifier for a built module, as the program file will write it. */
function dist(file: string): string {
  return JSON.stringify(new URL(`../dist/${file}`, import.meta.url).href);
}

/** stdout, stderr and the exit code of one run, whatever the code. */
function spawnRun(file: string, argv: string[]): { stdout: string; stderr: string; code: number } {
  try {
    const stdout = execFileSync(process.execPath, [file, ...argv], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } });
    return { stdout, stderr: '', code: 0 };
  } catch (e) {
    const { stdout, stderr, status } = e as { stdout: string; stderr: string; status: number };
    return { stdout, stderr, code: status };
  }
}

const HANDLERS = `
    sync: () => { throw new Error('sync boom'); },
    async: async () => { throw new Error('async boom'); },
    nonerror: () => { throw 'a string'; },
    auth: () => { throw new AuthError('token expired', 'the session ended', 'app login'); },`;

/**
 * The repro itself, against the built package: a real process, real stdout, a real exit code.
 * In-process spies can agree with each other and still miss what Node prints on its way out.
 */
describe('end to end, as the tutorial ran it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'burgee-json-failure-'));
  const fronts = {
    commander: join(dir, 'commander.mjs'),
    native: join(dir, 'native.mjs'),
  };
  writeFileSync(fronts.commander, `import { Command } from ${dist('commander.js')};
import { AuthError } from ${dist('index.js')};
const h = {${HANDLERS}};
const program = new Command('app');
for (const [name, fn] of Object.entries(h)) program.command(name).action(fn);
await program.parseAsync(process.argv);
`);
  writeFileSync(fronts.native, `import { AuthError, defineCommand, defineProgram, run } from ${dist('index.js')};
const h = {${HANDLERS}};
await run(defineProgram({ name: 'app', commands: Object.entries(h).map(([name, fn]) => defineCommand({ name, effects: 'read_only', run: fn })) }));
`);
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const runs = CASES.flatMap((c) => (['commander', 'native'] as const).map((front) => ({ ...c, front })));
  it.each(runs)('$front $name --json: one envelope on stdout, no stack anywhere, exit per contract', ({ front, name, exit, message }) => {
    const r = spawnRun(fronts[front], [name, '--json']);
    expect(r.code).toBe(exit);
    expect(onlyEnvelope(r.stdout)).toMatchObject({ error: { message } });
    // The commander façade's errors are its incumbent's (clispec-conformance, out of scope); the
    // engine's add the one structured line on stderr (R6).
    if (front === 'native') expect(JSON.parse(r.stderr)).toMatchObject({ error: { code: exit, message } });
    else expect(r.stderr).toBe('');
  });
});

/**
 * parse-refusals R4 — both refusals are recoverable in one turn: the envelope's `fix` is the line
 * as typed with the surplus words removed (R1), or with only the last of a repeated flag kept
 * (R3), and that line runs. It is the `fix` every usage error already carries (E3), which is the
 * runnable correction the spec's `next[]` names. Red first: before R1 and R3 these lines exited 0,
 * so there was no failure and no line to run.
 */
/** A fix line's words, as a shell splits them: `shellWord` quotes with single quotes only. These cases carry no quote inside a word, so neither form's escape (POSIX or PowerShell) is parsed here. */
const words = (line: string): string[] => [...line.matchAll(/'([^']*)'|(\S+)/gu)].map((m) => (m[1] ?? m[2]) as string);

describe('parse-refusals R4: the fix of a refused line runs', () => {
  const refusing = defineProgram({
    name: 'app',
    commands: [defineCommand({ name: 'greet', effects: 'read_only', arguments: [{ name: 'who' }], options: { level: { type: 'string', short: 'l' }, loud: { type: 'boolean' } }, run: ({ positionals, options }) => ({ positionals, options }) })],
  });

  it.each([
    { argv: ['greet', 'ada', 'extra', '--json'], fix: 'app greet ada --json' },
    { argv: ['greet', 'ada', '--json', 'b c', 'd'], fix: 'app greet ada --json' },
    { argv: ['greet', 'ada', '--level', 'info', '--loud', '--level', 'debug', '--json'], fix: 'app greet ada --loud --level debug --json' },
    { argv: ['greet', '-l', 'a', 'ada', '--level=b', '--json'], fix: 'app greet ada --level=b --json' },
    { argv: ['greet', 'ada', 'x', '--level', 'a', '--level', 'b', '--json'], fix: 'app greet ada --level b --json' },
    { argv: ['greet', 'ada', 'x', '--json', '--', 'tail'], fix: 'app greet ada --json -- tail' },
  ])('$argv.0 $argv.2 …: exit 2, and `$fix` exits 0', async ({ argv, fix }) => {
    const refused = await runBurgee(refusing, { argv });
    expect(refused.code).toBe(ExitCode.USAGE);
    expect(onlyEnvelope(refused.stdout)).toMatchObject({ error: { kind: 'usage', code: ExitCode.USAGE, fix } });
    const again = await runBurgee(refusing, { argv: words(fix).slice(1) });
    expect(again.code).toBe(ExitCode.OK);
    expect(again.json).toMatchObject({ ok: true });
  });

  it('quotes a word the shell would split, the way every fix line does', async () => {
    const r = await runBurgee(refusing, { argv: ['greet', 'Ada L', 'x', '--json'] });
    expect(onlyEnvelope(r.stdout)).toMatchObject({ error: { fix: "app greet 'Ada L' --json" } });
  });
});
