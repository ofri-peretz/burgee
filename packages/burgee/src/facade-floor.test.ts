/**
 * J3 / D-121 — the behavioural floor is one explicit call on either façade:
 * `.burgee({ floor: true })`.
 *
 * What J3 calls *behavioural* is what the hosts' own suites assert and a silent change would
 * break: the exit-code contract (E1: a usage error is 2, not the host's 1) and
 * no-help-on-runtime-error (a handler that throws or rejects is one line and its E1 code — never
 * a stack, and never yargs' help screen). So every case is a pair: the same program without the
 * call keeps the host's behaviour, which is the half commander's 1360 and yargs' 804 graded
 * cases depend on (J1, C2).
 *
 * The floor changes what a real process does on its way out, so each case spawns one: a program
 * file importing the **built** `dist/` (present by turbo's `test` → `build` dependency), run
 * the way these programs are run — a plain `parse()`, nothing injected. In-process spies can
 * agree with each other and still miss what Node prints on its way out.
 *
 * Each floor case was run red against the unfixed tree first (`.burgee({ floor: true })` did
 * not exist on the commander façade, and on the yargs façade it was an empty seam).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

/** An import specifier for a built module, as the program file will write it. */
function dist(file: string): string {
  return JSON.stringify(new URL(`../dist/${file}`, import.meta.url).href);
}

interface Run {
  stdout: string;
  stderr: string;
  code: number;
}

/** stdout, stderr and the exit code of one run, whatever the code. */
function spawnRun(file: string, argv: string[]): Run {
  try {
    const stdout = execFileSync(process.execPath, [file, ...argv], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } });
    return { stdout, stderr: '', code: 0 };
  } catch (e) {
    const { stdout, stderr, status } = e as { stdout: string; stderr: string; status: number };
    return { stdout, stderr, code: status };
  }
}

const STACK = /\n\s+at /u;

const dir = mkdtempSync(join(tmpdir(), 'burgee-facade-floor-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/**
 * One program per façade and per `call` appended to its construction. The commander program
 * says what escaped `parse()` and exits 7 for it, and writes `after` once `parse()` returns, so
 * a case can tell a throw from a run that went on and from one that exited.
 */
function commanderProgram(name: string, call: string): string {
  const file = join(dir, `${name}.mjs`);
  writeFileSync(
    file,
    `import { Command } from ${dist('commander.js')};
const program = new Command('tool')${call};
program.command('sync').action(() => { throw new Error('sync boom'); });
program.command('async').action(async () => { throw new Error('async boom'); });
program.command('ok').action(() => 'a returned value');
try {
  program.parse();
} catch (e) {
  process.stderr.write('escaped ' + (e.code ?? e.message) + '\\n');
  process.exit(7);
}
process.stdout.write('after\\n');
`,
  );
  return file;
}

function yargsProgram(name: string, call: string): string {
  const file = join(dir, `${name}.mjs`);
  writeFileSync(
    file,
    `import yargs from ${dist('yargs.js')};
yargs(process.argv.slice(2))${call}
  .strict()
  .command('sync', 'throws', () => {}, () => { throw new Error('sync boom'); })
  .command('async', 'rejects', () => {}, async () => { throw new Error('async boom'); })
  .command('ok', 'works', () => {}, () => 'a returned value')
  .parse();
`,
  );
  return file;
}

describe('commander façade: .burgee({ floor: true }) (J3)', () => {
  const plain = commanderProgram('commander-plain', '');
  const floor = commanderProgram('commander-floor', '.burgee({ floor: true })');
  const override = commanderProgram('commander-override', '.burgee({ floor: true }).exitOverride()');

  it("without the call, an unknown option is commander's exit 1", () => {
    expect(spawnRun(plain, ['--nope']).code).toBe(1);
  });

  it('with it, the same unknown option is USAGE, exit 2', () => {
    expect(spawnRun(floor, ['--nope'])).toMatchObject({ code: 2, stderr: "error: unknown option '--nope'\n" });
  });

  it('with it, an unknown command is USAGE, exit 2 — and commander exited 1', () => {
    expect([spawnRun(plain, ['nope']).code, spawnRun(floor, ['nope']).code]).toEqual([1, 2]);
  });

  it("without the call, an action that throws escapes parse() — commander's behaviour", () => {
    expect(spawnRun(plain, ['sync'])).toEqual({ code: 7, stderr: 'escaped sync boom\n', stdout: '' });
  });

  it('without the call, an action that rejects under a plain parse() dies as an unhandled rejection with a stack', () => {
    const r = spawnRun(plain, ['async']);
    expect({ code: r.code, stack: STACK.test(r.stderr) }).toEqual({ code: 1, stack: true });
  });

  it('with it, an action that throws is one error line and exit 1 (RUNTIME), no stack', () => {
    expect(spawnRun(floor, ['sync'])).toEqual({ code: 1, stderr: 'error: sync boom\n', stdout: 'after\n' });
  });

  it('with it, an action that rejects under a plain parse() is one error line and exit 1', () => {
    expect(spawnRun(floor, ['async'])).toEqual({ code: 1, stderr: 'error: async boom\n', stdout: 'after\n' });
  });

  it('with it, a run that succeeds exits 0 and injects nothing: the returned value is not printed', () => {
    expect(spawnRun(floor, ['ok'])).toEqual({ code: 0, stdout: 'after\n', stderr: '' });
  });

  it('with it, --help still exits 0', () => {
    expect(spawnRun(floor, ['--help']).code).toBe(0);
  });

  it('a program that called exitOverride() keeps its own exits — they are its to keep', () => {
    expect(spawnRun(override, ['--nope'])).toMatchObject({ code: 7, stderr: expect.stringContaining('escaped commander.unknownOption') as string });
  });
});

describe('yargs façade: .burgee({ floor: true }) (J3)', () => {
  const plain = yargsProgram('yargs-plain', '');
  const floor = yargsProgram('yargs-floor', '.burgee({ floor: true })');

  it("without the call, an unknown argument is yargs' exit 1", () => {
    expect(spawnRun(plain, ['ok', '--nope']).code).toBe(1);
  });

  it('with it, the same unknown argument is USAGE, exit 2', () => {
    const r = spawnRun(floor, ['ok', '--nope']);
    expect({ code: r.code, said: r.stderr.includes('Unknown argument: nope') }).toEqual({ code: 2, said: true });
  });

  it("without the call, a handler that throws escapes as a stack — yargs' behaviour", () => {
    const r = spawnRun(plain, ['sync']);
    expect({ code: r.code, stack: STACK.test(r.stderr) }).toEqual({ code: 1, stack: true });
  });

  it('with it, a handler that throws is one line and exit 1 (RUNTIME), no stack', () => {
    expect(spawnRun(floor, ['sync'])).toEqual({ code: 1, stderr: 'sync boom\n', stdout: '' });
  });

  it("without the call, a handler that rejects prints yargs' help screen for it", () => {
    const r = spawnRun(plain, ['async']);
    expect({ code: r.code, help: r.stderr.includes('Options:') }).toEqual({ code: 1, help: true });
  });

  it('with it, a handler that rejects is one line and exit 1 — no help on a runtime error', () => {
    expect(spawnRun(floor, ['async'])).toEqual({ code: 1, stderr: 'async boom\n', stdout: '' });
  });

  it('with it, a run that succeeds exits 0 and injects nothing: the returned value is not printed', () => {
    expect(spawnRun(floor, ['ok'])).toEqual({ code: 0, stdout: '', stderr: '' });
  });

  it('with it, --help still exits 0', () => {
    expect(spawnRun(floor, ['--help']).code).toBe(0);
  });

  it('with it, --json still settles a failure to the envelope on stdout (D-140), not the line', () => {
    const r = spawnRun(floor, ['sync', '--json']);
    expect({ code: r.code, stdout: JSON.parse(r.stdout) as unknown, stderr: r.stderr }).toEqual({ code: 1, stdout: { ok: false, error: { code: 'runtime', message: 'sync boom' } }, stderr: '' });
  });
});
