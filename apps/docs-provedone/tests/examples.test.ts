/**
 * Every runnable example on this site runs, and prints what the page says it prints.
 *
 * A page marks a file with a titled fence — ```js title="check.mjs" — and the output it
 * promises with a text fence titled by the command — ```text title="npx provedone gate msg.txt".
 * This writes each page's files into a scratch directory inside the app (so `provedone` resolves
 * to the workspace build, as it would from `node_modules` after `npm i`), runs each command with
 * stdout and stderr piped, and compares what came out — stdout, then stderr — with the fence.
 *
 * A file is a titled `js`, `ts`, `json`, `md` or `text` fence whose title is not a command: a
 * script a `--run` proves something with, an intent under `.sdlc/intents/<slug>/`, a commit
 * message the gate reads. A title with a directory in it is written at that path.
 *
 * `exit="1"` on the output fence is the code the page promises; a fence without it promises 0.
 *
 * provedone keeps its stamps and gate log under the repository's git directory. The scratch
 * directory sits inside this repository, so every run here sets `GIT_CEILING_DIRECTORIES` to the
 * app: git finds no repository, provedone writes `.provedone/` inside the scratch directory, and a
 * test run never touches this clone's `.git/provedone/` log nor reads a block an earlier run left
 * there. The session variables are unset for the same reason: the gate's escape counts blocks per
 * session, and a page's three runs must start from none. The commands on a page run in order in
 * one directory, so a page can stamp and then ask `done`.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { discard } from 'docs-chassis/scratch-dir';
import { afterAll, describe, expect, it } from 'vitest';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(APP, 'content', 'docs');

/** A fenced block: its language, the rest of its opening line, and its body. */
const FENCE = /^```(\w+)([^\n]*)\n([\s\S]*?)^```$/gmu;
/** One `key="value"` of a fence's meta. */
const meta = (line: string, key: string): string | undefined => new RegExp(`\\b${key}="([^"]*)"`, 'u').exec(line)?.[1];
/** A fence title that is a command to run, not a file to write. */
const COMMAND = /^(?:[A-Z_]+=\S* )*(?:node|npx provedone) /u;
const FILE_LANGS = new Set(['js', 'ts', 'javascript', 'json', 'md', 'text']);

interface Run {
  readonly command: string;
  readonly expected: string;
  readonly exit: number;
}

interface Page {
  readonly path: string;
  readonly files: ReadonlyMap<string, string>;
  readonly runs: readonly Run[];
}

/** One page's titled files and the commands whose output it shows. */
function pageOf(abs: string): Page {
  const files = new Map<string, string>();
  const runs: Run[] = [];
  for (const [, lang = '', info = '', body] of readFileSync(abs, 'utf8').matchAll(FENCE)) {
    const title = meta(info, 'title');
    if (title === undefined || body === undefined) continue;
    if (COMMAND.test(title)) runs.push({ command: title, expected: body, exit: Number(meta(info, 'exit') ?? '0') });
    else if (FILE_LANGS.has(lang)) files.set(title, body);
  }
  return { path: relative(CONTENT, abs), files, runs };
}

function pagesWithExamples(dir: string = CONTENT): Page[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e): Page[] => {
    const abs = join(dir, e.name);
    if (e.isDirectory()) return pagesWithExamples(abs);
    if (!e.name.endsWith('.mdx')) return [];
    const page = pageOf(abs);
    return page.runs.length === 0 ? [] : [page];
  });
}

const all = pagesWithExamples();
const shared = all.find((p) => p.path === 'getting-started.mdx')?.files ?? new Map<string, string>();
const scratch: string[] = [];
afterAll(() => {
  discard(...scratch);
});

/** The `provedone` bin, as `npx provedone` finds it in an install. */
const BIN = join(APP, '..', '..', 'node_modules', 'provedone', 'dist', 'bin.js');

/**
 * The environment an example runs in: this one, with colour off, no session or mode a shell or an
 * agent exported, and git stopped at the app so it finds no repository.
 */
const { FORCE_COLOR: _force, CLAUDE_CODE_SESSION_ID: _a, CLAUDE_SESSION_ID: _b, PROVEDONE_SESSION: _c, PROVEDONE_MODE: _d, GIT_DIR: _e, GIT_WORK_TREE: _f, ...inherited } = process.env;
const plain = { ...inherited, NO_COLOR: '1', GIT_CEILING_DIRECTORIES: APP };

/** `node x.mjs`, `NAME=1 node x.mjs` or `npx provedone gate msg.txt` → env and node's argv. */
function parse(command: string): { env: Record<string, string>; argv: string[] } {
  const words = command.split(/\s+/u);
  const env: Record<string, string> = {};
  while (words[0] !== undefined && /^[A-Z_]+=/u.test(words[0])) {
    const [key = '', value = ''] = (words.shift() ?? '').split('=');
    env[key] = value;
  }
  if (words[0] === 'npx' && words[1] === 'provedone') return { env, argv: [BIN, ...splitArgs(words.slice(2).join(' '))] };
  return { env, argv: words.slice(1) };
}

/** A command line's words, with a quoted word kept whole, as a shell reads `--run 'node check.mjs'`. */
function splitArgs(line: string): string[] {
  return [...line.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/gu)].map((m) => m[1] ?? m[2] ?? m[3] ?? '');
}

describe.skipIf(process.platform === 'win32')('the examples on this site', () => {
  it('has examples to run — otherwise every case below asserts nothing', () => {
    expect(all.length).toBeGreaterThan(0);
    expect(shared.size, 'getting-started.mdx no longer defines a file the other pages can run').toBeGreaterThan(0);
  });

  describe.each(all.map((p) => [p.path, p] as const))('%s', (_path, page) => {
    const dir = mkdtempSync(join(APP, '.examples-'));
    scratch.push(dir);
    for (const [name, body] of [...shared, ...page.files]) {
      mkdirSync(dirname(join(dir, name)), { recursive: true });
      writeFileSync(join(dir, name), body);
    }

    it.each(page.runs.map((r) => [r.command, r] as const))('`%s` prints what the page shows', (_command, run) => {
      const { env, argv } = parse(run.command);
      const result = spawnSync(process.execPath, argv, { cwd: dir, env: { ...plain, ...env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20_000, killSignal: 'SIGKILL' });
      expect(result.status, result.stderr).toBe(run.exit);
      expect(result.stdout + result.stderr).toBe(run.expected);
    }, 30_000);
  });
});
