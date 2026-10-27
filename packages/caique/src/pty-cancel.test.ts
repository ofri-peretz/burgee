/**
 * R4 — Ctrl+C during a prompt, pressed at a **real terminal**, gives the terminal back out of raw
 * mode: on Linux and macOS through a POSIX pty, on Windows through a pseudo-console (ConPTY).
 * caique's intent asks for exactly this, "tested with a PTY in CI" on all three, and until now
 * `raw.test.ts` drove a synthetic key stream that cannot tell a restored terminal from a stuck one.
 *
 * ## What is driven, and why two prompts
 *
 * A prompt holds the terminal in raw mode while it waits, so the Ctrl+C a person presses arrives
 * as a byte, `0x03`, not as a signal: the terminal's own signal key is off. Each fixture asks one
 * question on the real terminal the host gives it, and the test presses Ctrl+C at the question:
 *
 * - **`promptFor` (R1)**, the binding a burgee command is wrapped in, on the terminal it opens
 *   itself — `node:readline` over stdin, the question on stderr;
 * - **`caique/clack`'s `text`**, the raw-mode prompt loop the two façades share.
 *
 * ## How "out of raw mode" is observed, rather than reported
 *
 * The fixture prints `process.stdin.isRaw` after the prompt has settled, which is Node's own
 * record. But that is the program's word for it, so the test then presses Ctrl+C **a second
 * time**, with the fixture waiting on a timer and nothing reading stdin. On a terminal back in
 * cooked mode that keystroke is the terminal's signal key again: the POSIX line discipline raises
 * `SIGINT` and the process ends of it; a Windows console in processed-input mode raises
 * CTRL_C_EVENT and the process ends. (Not on Windows under Node 20 and 22: see `secondPressProves`.) On a terminal left raw it is one more byte nobody reads, and
 * the fixture outlives the press and says `still here`. That is the bug the criterion names
 * (clack #408), observed through the terminal itself.
 *
 * ## The terminal comes from the system, not a dependency
 *
 * `scripts/pty-host.py` — Python's standard library, preinstalled on every GitHub-hosted runner:
 * `pty.fork()` on POSIX (the route `burgee/src/pty-signal.test.ts` measured), and
 * `CreatePseudoConsole` through `ctypes` on Windows, so no native addon enters the lockfile (U1).
 *
 * ## Proven to fail on the broken code
 *
 * With `createIo()`'s interface given a `SIGINT` listener that ignores the key — the
 * readline idiom that keeps a prompt open on Ctrl+C — the `promptFor` fixture never settles, raw
 * mode is never released, and both of its cases go red; with `clack-core.ts`'s release of raw mode
 * removed from `close()`, the clack fixture says `raw=true` and outlives the second press.
 */
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';

import { afterAll, describe, expect, it } from 'vitest';

const HOST = fileURLToPath(new URL('../../../scripts/pty-host.py', import.meta.url));
const windows = process.platform === 'win32';

/** A Python that can open this platform's terminal: `pty` on POSIX, ConPTY's entry point on Windows. */
function python(): string | undefined {
  const probe = windows ? 'import ctypes; ctypes.WinDLL("kernel32").CreatePseudoConsole' : 'import pty, select, os';
  for (const exe of windows ? ['python', 'py', 'python3'] : ['python3', 'python']) {
    try {
      execFileSync(exe, ['-c', probe], { stdio: 'ignore' });
      return exe;
    } catch {
      continue;
    }
  }
  return undefined;
}

const exe = python();
const dir = mkdtempSync(join(tmpdir(), 'caique-pty-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const QUESTION = 'Who should I greet?';
const built = (file: string): string => JSON.stringify(new URL(`../dist/${file}`, import.meta.url).href);

/** After the prompt: what it came to, Node's record of raw mode, then a wait for the second press. */
const AFTER = `
process.stdout.write('\\noutcome=' + outcome + '\\nraw=' + String(process.stdin.isRaw === true) + '\\nwaiting\\n');
setTimeout(() => { process.stdout.write('still here\\n'); process.exit(0); }, 8000);
`;

const FIXTURES = {
  /** R1: a command wrapped by `promptFor`, on the terminal it opens itself. */
  promptFor: `
import { promptFor } from ${built('prompt-for.js')};
const command = promptFor({ arguments: [{ name: 'name' }], run: (ctx) => ctx.args }, 'name', { kind: 'text', message: ${JSON.stringify(QUESTION)} });
let outcome;
try {
  outcome = 'answered ' + JSON.stringify(await command.run({ options: {}, args: {}, positionals: [], env: process.env, interactive: true, json: false }));
} catch (refusal) {
  outcome = 'refused ' + refusal.code;
}
${AFTER}`,
  /** The raw-mode loop under both façades. */
  clack: `
import { isCancel, text } from ${built('clack.js')};
const answer = await text({ message: ${JSON.stringify(QUESTION)} });
const outcome = isCancel(answer) ? 'refused CANCELLED' : 'answered ' + JSON.stringify(answer);
${AFTER}`,
} as const;

interface Outcome {
  output: string;
  /** The signal the fixture died of; 0 when it exited, and always 0 on Windows. */
  signal: number | undefined;
  code: number | undefined;
  /** How many times Ctrl+C was pressed. */
  pressed: number;
}

/** The environment a person has: no `CI`, no agent, nothing forcing a terminal — the host decides that. */
function personEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, TERM: 'xterm-256color' };
  for (const name of ['CI', 'FORCE_TTY', 'AI_AGENT', 'CLAUDECODE', 'CURSOR_AGENT', 'CODEX_THREAD_ID', 'GEMINI_CLI']) delete env[name];
  return env;
}

/** Run a fixture on a real terminal: Ctrl+C at the question, and again once it says it is waiting. */
async function pressCtrlC(python: string, fixture: keyof typeof FIXTURES): Promise<Outcome> {
  const program = join(dir, `${fixture}-${String(Math.random()).slice(2)}.mjs`);
  writeFileSync(program, FIXTURES[fixture]);
  return await new Promise<Outcome>((settle, fail) => {
    const host = spawn(python, [HOST, process.execPath, program], { stdio: ['pipe', 'pipe', 'pipe'], env: personEnv() });
    let output = '';
    let status = '';
    let pressed = 0;
    host.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      // Pressed when the program shows it is listening, never after a fixed wait: a sleep long
      // enough for a loaded runner is a sleep in every green run.
      if ((pressed === 0 && output.includes(QUESTION)) || (pressed === 1 && output.includes('waiting'))) {
        pressed += 1;
        host.stdin.write('\x03');
      }
    });
    host.stderr.on('data', (chunk: Buffer) => {
      status += chunk.toString();
    });
    host.on('error', fail);
    host.on('close', () => {
      const wait = /SIGNAL (\d+) CODE (\d+)/u.exec(status);
      settle({ output, signal: wait?.[1] === undefined ? undefined : Number(wait[1]), code: wait?.[2] === undefined ? undefined : Number(wait[2]), pressed });
    });
  });
}

const terminal = windows ? 'a Windows pseudo-console (ConPTY)' : 'a POSIX pty';

/**
 * Whether the second Ctrl+C is a proof here. On Windows under Node 20.19 and 22.13 it is not, as
 * measured on GitHub's windows-latest (#1316): the prompt is cancelled and `setRawMode(false)`
 * has run (`raw=false`, asserted on every runtime), and yet the next Ctrl+C raises no
 * CTRL_C_EVENT, so the fixture outlives it. The same harness, fixture and code on Node 24 end on
 * it. The key does not reach the console as a control event on those runtimes, which is below
 * caique, so the case asserts there what holds and records the gap
 * (D-20261027-caique-pty-windows-conpty) rather than passing on a weaker reading.
 */
const secondPressProves = !windows || Number(process.versions.node.split('.')[0]) >= 24;

describe.skipIf(exe === undefined).each(Object.keys(FIXTURES) as (keyof typeof FIXTURES)[])(`R4 · Ctrl+C at a %s prompt on ${terminal}`, (fixture) => {
  let seen: Promise<Outcome> | undefined;
  const run = async (): Promise<Outcome> => await (seen ??= pressCtrlC(exe as string, fixture));

  it('cancels the question rather than answering it', async () => {
    const { output, pressed } = await run();
    expect(output, 'the question never reached the terminal').toContain(QUESTION);
    expect(pressed, 'the second Ctrl+C was never pressed: the prompt did not settle').toBe(2);
    expect(output).toContain('outcome=refused CANCELLED');
  }, 60_000);

  it('leaves stdin out of raw mode: Node says so, and the next Ctrl+C is the terminal’s signal key again', async () => {
    const { output, signal, code } = await run();
    // What the terminal showed, as text: ConPTY re-renders the screen and ends a line with an
    // erase (`ESC [ K`), so the escapes are read past rather than matched.
    expect(stripVTControlCharacters(output).replace(/\r/gu, '')).toContain('raw=false\n');
    if (!secondPressProves) return;
    expect(output, 'the second Ctrl+C was a byte nobody read: the terminal was left raw').not.toContain('still here');
    // SIGINT, either way a program may take it: died of it, or a handler that the prompt library
    // registered on the way in caught it and exited 128 + 2 — `caique/clack` hides the cursor and
    // takes raw mode through `closeout/exit-hook`, which reports a signal as `128 + n` on every
    // platform (`clack-output.ts`; burgee's `ExitCode.SIGINT` is 130). Without a handler, POSIX
    // reports signal 2 and Windows STATUS_CONTROL_C_EXIT, 0xC000013A. Each needs the terminal to
    // have turned the key into a signal, which a raw terminal never does.
    const bySignal = windows ? code === 0xc0_00_01_3a : signal === 2;
    expect(bySignal || (signal === 0 && code === 130), `ended by SIGINT, not by signal ${String(signal)} code ${String(code)}`).toBe(true);
  }, 60_000);
});

// A suite skipped where nobody looks has quietly stopped running. One case always says why.
describe('the pty harness says when it is not running', () => {
  it('names why, when it is skipped', () => {
    if (exe !== undefined) {
      expect(exe).toMatch(/py/u);
      return;
    }
    console.warn(`[pty-cancel] skipped: no Python that can open ${terminal} on this machine`);
    expect(exe).toBeUndefined();
  });
});
