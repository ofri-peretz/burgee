/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — the root README's first screen shows output the example really prints.
 *
 * On 2026-11-18 the repository's page had 9 unique visitors in 14 days, and the first `##`
 * heading sat 77 lines down, under four centred paragraphs of claims. So the README now opens,
 * before its first `##`, on the product: `npm i burgee`, one command written with commander and
 * then with burgee, and what the burgee file prints for `--json`, `--mcp --print-config` and
 * `--help`.
 *
 * A pasted transcript is a copy, and a copy drifts: the help text, the envelope and the MCP
 * configuration all change with the code. This reads both programs **from the README**, never a
 * copy, writes each to a scratch directory as `cli.mjs`, and runs them with `node` through a pipe,
 * in an environment holding nothing a developer's shell adds:
 *
 *   - **the commander program runs as written** — it exits 0 and greets — so the "before" is a
 *     real program, not a strawman;
 *   - **every `$ node cli.mjs …` session under the burgee program prints what the README shows**,
 *     byte for byte, and exits as the line says (`# exit N`; 0 when it says nothing).
 *
 * One rewrite, and only one: `--mcp --print-config` prints the absolute path of the file it was
 * run from, so the scratch directory reads as `/path/to/` — the reader's own path goes there.
 *
 * Proven red on 2026-11-18 by editing one line of the README's `--help` output by hand
 * (`the program as data` → `the program as JSON`): "every session prints what the README shows"
 * failed and named the session. The last describe block keeps a proof of that kind in the suite.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { scratchDirs } from './scratch-dir.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const README = 'README.md';
const scratchDir = scratchDirs();

/** Where the reader's own directory goes in the printed MCP configuration. */
export const PLACEHOLDER = '/path/to/';

interface Fence {
  lang: string;
  body: string;
}

export interface Session {
  argv: string[];
  code: number;
  output: string;
}

export interface FirstScreen {
  install: boolean;
  before: string;
  after: string;
  sessions: Session[];
}

/** The README up to its first `##` heading: what a visitor reads before choosing to scroll. */
export const firstScreen = (readme: string): string => {
  const at = readme.search(/^## /mu);
  return at === -1 ? readme : readme.slice(0, at);
};

const fences = (text: string): Fence[] => [...text.matchAll(/^```(\w*)\n([\s\S]*?)^```$/gmu)].map((m) => ({ lang: m[1]!, body: m[2]! }));

/** `$ node cli.mjs --x   # exit 2` → its argv, its exit code and the lines under it. */
export function sessions(transcript: string): Session[] {
  return transcript
    .trimEnd()
    .split(/\n\n(?=\$ )/u)
    .map((block) => {
      const [command = '', ...output] = block.split('\n');
      const [typed = '', comment = ''] = command.replace(/^\$ node cli\.mjs/u, '').split('#');
      return {
        argv: typed.trim().split(/\s+/u).filter((a) => a !== ''),
        code: Number(/\bexit (\d+)/u.exec(comment)?.[1] ?? 0),
        output: output.join('\n'),
      };
    });
}

/** The parts of the first screen this lock holds; a missing one is `''` or `false`, never skipped. */
export function parse(readme: string): FirstScreen {
  const all = fences(firstScreen(readme));
  const source = (from: string): number => all.findIndex((f) => ['js', 'mjs'].includes(f.lang) && f.body.includes(`from '${from}'`));
  const afterAt = source('burgee');
  const transcript = all.slice(afterAt + 1).find((f) => f.lang === 'console');
  return {
    install: all.some((f) => f.lang === 'bash' && /^npm (?:i|install) burgee$/mu.test(f.body)),
    before: all[source('commander')]?.body ?? '',
    after: all[afterAt]?.body ?? '',
    sessions: afterAt === -1 || transcript === undefined ? [] : sessions(transcript.body),
  };
}

/** Finding `node` and nothing else: no `FORCE_COLOR`, no `CI`, no `TERM`, no `COLUMNS`. */
function strangerEnv(): NodeJS.ProcessEnv {
  const keep = ['PATH', 'Path', 'HOME', 'USERPROFILE', 'SystemRoot', 'PATHEXT', 'TMPDIR', 'TEMP', 'TMP'];
  return Object.fromEntries(keep.filter((k) => process.env[k] !== undefined).map((k) => [k, process.env[k]]));
}

/** Write `source` as `cli.mjs` beside the repository's `node_modules`, and return the directory. */
function program(source: string): string {
  const dir = scratchDir('burgee-first-screen-');
  symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'junction');
  writeFileSync(join(dir, 'cli.mjs'), source);
  return dir;
}

/** Run `node cli.mjs …` in `dir`: stdout then stderr, and the exit code. */
function runIn(dir: string, argv: readonly string[]): { code: number; output: string } {
  try {
    const stdout = execFileSync(process.execPath, ['cli.mjs', ...argv], { cwd: dir, env: strangerEnv(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20_000 });
    return { code: 0, output: stdout };
  } catch (error) {
    const e = error as { status?: number | null; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

/** `dir`, as a JSON string spells it, replaced by the placeholder: the one rewrite this lock makes. */
export function placeheld(output: string, dir: string): string {
  // The longer spelling first: on macOS `/var/…` is inside its realpath `/private/var/…`.
  return [realpathSync(dir), dir].toSorted((a, b) => b.length - a.length).reduce((text, d) => text.replaceAll(JSON.stringify(`${d}${sep}`).slice(1, -1), PLACEHOLDER), output);
}

/** What differs between the sessions the README shows and what the program printed for each. */
export function drift(shown: readonly Session[], printed: readonly { code: number; output: string }[]): string[] {
  return shown.flatMap((session, i) => {
    const got = printed[i];
    const command = `$ node cli.mjs ${session.argv.join(' ')}`;
    if (got === undefined) return [`${command}: not run`];
    const out: string[] = [];
    if (got.output.trimEnd() !== session.output) out.push(`${command}: the README shows\n${session.output}\n— it prints\n${got.output.trimEnd()}`);
    if (got.code !== session.code) out.push(`${command}: the README says exit ${String(session.code)}, it exits ${String(got.code)}`);
    return out;
  });
}

describe("the root README's first screen", () => {
  const screen = parse(readFileSync(join(ROOT, README), 'utf8'));
  let printed: { code: number; output: string }[] = [];
  let before: { code: number; output: string } = { code: -1, output: '' };

  beforeAll(() => {
    const at = program(screen.after);
    printed = screen.sessions.map((s) => {
      const r = runIn(at, s.argv);
      return { code: r.code, output: placeheld(r.output, at) };
    });
    before = runIn(program(screen.before), ['--name', 'ada']);
  });

  it('opens on the install line, the commander program and the burgee one, before the first heading', () => {
    expect(screen.install, 'no ```bash block with `npm i burgee` before the first ##').toBe(true);
    expect(screen.before, "no js block importing from 'commander' before the first ##").not.toBe('');
    expect(screen.after, "no js block importing from 'burgee' before the first ##").not.toBe('');
  });

  it('shows --json, the MCP configuration and --help', () => {
    const shown = screen.sessions.map((s) => s.argv.join(' '));
    for (const flag of ['--json', '--mcp --print-config', '--help']) expect(shown.some((argv) => argv.includes(flag)), `no "$ node cli.mjs … ${flag}" session`).toBe(true);
  });

  it('the commander program runs as written', () => {
    expect(before).toEqual({ code: 0, output: 'hello, ada\n' });
  });

  it('every session prints what the README shows', () => {
    expect(drift(screen.sessions, printed)).toEqual([]);
  });
});

describe('the lock can fail', () => {
  const readme = readFileSync(join(ROOT, README), 'utf8');

  it('fails a hand-edited output line', () => {
    const screen = parse(readme);
    const honest = screen.sessions.map((s) => ({ code: s.code, output: s.output }));
    const edited = parse(readme.replace('"greeting":"hello, ada"', '"greeting":"hello, world"'));
    expect(edited.sessions, 'the edit did not apply, so this proves nothing').not.toEqual(screen.sessions);
    expect(drift(edited.sessions, honest).join('\n')).toMatch(/--json: the README shows/u);
  });

  it('fails a wrong exit code', () => {
    expect(drift([{ argv: ['--x'], code: 2, output: 'a' }], [{ code: 0, output: 'a\n' }])).toEqual([expect.stringMatching(/says exit 2, it exits 0/u)]);
  });

  it('finds nothing when the example has moved below the first heading', () => {
    const moved = parse(`# x\n\n## Start\n\n${fences(firstScreen(readme)).map((f) => `\`\`\`${f.lang}\n${f.body}\`\`\``).join('\n\n')}\n`);
    expect(moved).toEqual({ install: false, before: '', after: '', sessions: [] });
  });

  it('reads argv and the stated exit from a session line, and not the comment', () => {
    expect(sessions('$ node cli.mjs --mcp --print-config   # paste it\n{}\n\n$ node cli.mjs   # exit 2\nerror')).toEqual([
      { argv: ['--mcp', '--print-config'], code: 0, output: '{}' },
      { argv: [], code: 2, output: 'error' },
    ]);
  });

  it('rewrites the scratch directory as JSON spells it, and nothing else', () => {
    const dir = scratchDir('burgee-first-screen-');
    const json = JSON.stringify({ args: [join(dir, 'cli.mjs'), '--mcp'] });
    expect(placeheld(json, dir)).toBe(JSON.stringify({ args: [`${PLACEHOLDER}cli.mjs`, '--mcp'] }));
    expect(placeheld('/elsewhere/cli.mjs', dir)).toBe('/elsewhere/cli.mjs');
  });
});
