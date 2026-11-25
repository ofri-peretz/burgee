/**
 * Every runnable example on this site runs, and prints what the page says it prints.
 *
 * A page marks a file with a titled fence — ```js title="cart.test.js" — and the output it
 * promises with a text fence titled by the command — ```text title="npx eslint cart.test.js".
 * This writes each page's titled `js`, `ts` or `json` files into a scratch directory inside the app (so
 * `truepass` and `eslint` resolve to the workspace's, as they would from `node_modules` after
 * `npm i`), runs each command with stdout and stderr piped, and compares what came out — stdout,
 * then stderr — with the fence.
 *
 * Three command forms run: `node x.mjs`, `npx truepass …` (the package's bin) and `npx eslint …`
 * (the repository's ESLint, which loads the page's `eslint.config.mjs` and through it
 * `truepass/eslint`). ESLint's default formatter prints each file by its absolute path; the scratch
 * directory differs on every run, so it is printed on the page as `/your/project`.
 *
 * How the process ended is part of the example. `exit="1"` on the output fence is the code
 * the page promises; a fence without it promises exit 0. The commands of one page run in order,
 * in one directory, so a page can show a file a command wrote being read by the next.
 *
 * No example runs `truepass diff`: it reads a git range, and a scratch directory inside this
 * repository would read this repository's history. The pages run its check through `check()` with
 * a git that answers from the page, and show what the command prints in a real repository only as
 * text, never as a promise this file checks.
 *
 * Getting started's files are written beside every page's, so a page can run them without
 * repeating them; a page that defines a file of the same name wins.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  for (const [, lang, info = '', body] of readFileSync(abs, 'utf8').matchAll(FENCE)) {
    const title = meta(info, 'title');
    if (title === undefined || body === undefined) continue;
    if (/^(?:node|npx truepass|npx eslint) /u.test(title)) runs.push({ command: title, expected: body, exit: Number(meta(info, 'exit') ?? '0') });
    else if (lang === 'js' || lang === 'ts' || lang === 'javascript' || lang === 'json') files.set(title, body);
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

const MODULES = join(APP, '..', '..', 'node_modules');
/** The `truepass` bin, as `npx truepass` finds it in an install. */
const BIN = join(MODULES, 'truepass', 'dist', 'bin.js');
/** ESLint's bin, as `npx eslint` finds it in a project that has ESLint installed. */
const ESLINT = join(MODULES, 'eslint', 'bin', 'eslint.js');

/**
 * The environment an example runs in: this one, with colour off and no agent named. A page shows
 * what a person sees in a plain shell; a shell that exports FORCE_COLOR would colour the output,
 * and an agent's variables (AI_AGENT, CLAUDECODE) change what a burgee program prints.
 */
const { FORCE_COLOR: _force, AI_AGENT: _agent, CLAUDECODE: _claude, ...inherited } = process.env;
const plain = { ...inherited, NO_COLOR: '1' };

/** `node x.mjs`, `npx truepass --help` or `npx eslint cart.test.js` → node's argv. */
function argvOf(command: string): string[] {
  const words = command.split(/\s+/u);
  if (words[0] === 'npx' && words[1] === 'truepass') return [BIN, ...words.slice(2)];
  if (words[0] === 'npx' && words[1] === 'eslint') return [ESLINT, ...words.slice(2)];
  return words.slice(1);
}

describe.skipIf(process.platform === 'win32')('the examples on this site', () => {
  it('has examples to run — otherwise every case below asserts nothing', () => {
    expect(all.length).toBeGreaterThan(0);
    expect(shared.size, 'getting-started.mdx no longer defines a file the other pages can run').toBeGreaterThan(0);
  });

  describe.each(all.map((p) => [p.path, p] as const))('%s', (_path, page) => {
    const dir = mkdtempSync(join(APP, '.examples-'));
    scratch.push(dir);
    for (const [name, body] of [...shared, ...page.files]) writeFileSync(join(dir, name), body);

    it.each(page.runs.map((r) => [r.command, r] as const))('`%s` prints what the page shows', (_command, run) => {
      const result = spawnSync(process.execPath, argvOf(run.command), { cwd: dir, env: plain, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20_000, killSignal: 'SIGKILL' });
      expect(result.status, result.stderr).toBe(run.exit);
      expect((result.stdout + result.stderr).replaceAll(dir, '/your/project')).toBe(run.expected);
    }, 30_000);
  });
});
