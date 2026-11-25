/**
 * Every runnable example on this site runs, and prints what the page says it prints.
 *
 * A page marks a file with a titled fence — ```yaml title=".sdlc/checklist.yaml" — and the
 * output it promises with a text fence titled by the command — ```text title="npx triggerlist compile".
 * This writes each page's files — a titled `js`, `ts`, `json`, `yaml` or `md` fence, at the path in
 * its title — into a scratch directory inside the app (so `triggerlist` resolves to the workspace
 * build, as it would from `node_modules` after `npm i`), runs each command with stdout and stderr
 * piped, and compares what came out — stdout, then stderr — with the fence. A `yaml` file is a
 * checklist, an `md` file a REVIEW.md that `compile --check` compares.
 *
 * How the process ended is part of the example. `exit="1"` on the output fence is the code
 * the page promises, and `signal="SIGTERM"` says the process dies of that signal. A fence
 * with neither promises exit 0.
 *
 * No example runs `triggerlist match`, `brief` or `protect` from the command line: each reads a
 * diff and a base branch from git, and the scratch directory is not a repository of its own. A
 * page shows what they print only as plain text, never as a promise this file checks. The
 * examples here run `compile` and `seed`, which read files, and the API on a diff written in the
 * page, which is what they can promise byte for byte. Commands run in the order the page lists
 * them, so a `compile` that writes REVIEW.md is seen by the `compile --check` after it.
 *
 * Getting started's files are written beside every page's, so a page can run them without
 * repeating them; a page that defines a file of the same name wins.
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

interface Run {
  readonly command: string;
  readonly expected: string;
  readonly exit: number | null;
  readonly signal: string | null;
}

interface Page {
  readonly path: string;
  readonly files: ReadonlyMap<string, string>;
  readonly runs: readonly Run[];
}

/** An output fence: the command in its title, and how the process must end. */
function runOf(command: string, info: string, expected: string): Run {
  const signal = meta(info, 'signal') ?? null;
  return { command, expected, exit: signal === null ? Number(meta(info, 'exit') ?? '0') : null, signal };
}

/** One page's titled files and the commands whose output it shows. */
function pageOf(abs: string): Page {
  const files = new Map<string, string>();
  const runs: Run[] = [];
  for (const [, lang, info = '', body] of readFileSync(abs, 'utf8').matchAll(FENCE)) {
    const title = meta(info, 'title');
    if (title === undefined || body === undefined) continue;
    if (/^(?:[A-Z_]+=\S* )*(?:node|npx triggerlist) /u.test(title)) runs.push(runOf(title, info, body));
    else if (lang === 'js' || lang === 'ts' || lang === 'javascript' || lang === 'json' || lang === 'yaml' || lang === 'md') files.set(title, body);
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

/** The `triggerlist` bin, as `npx triggerlist` finds it in an install. */
const BIN = join(APP, '..', '..', 'node_modules', 'triggerlist', 'dist', 'bin.js');

/**
 * The environment an example runs in: this one, with colour off. A page shows plain output, and a
 * shell that exports FORCE_COLOR (a developer's, or a hook's) would have Node colour the objects.
 */
const { FORCE_COLOR: _force, ...inherited } = process.env;
const plain = { ...inherited, NO_COLOR: '1' };

/** `node x.mjs`, `NAME=1 node x.mjs` or `npx triggerlist compile --json` → env and node's argv. */
function parse(command: string): { env: Record<string, string>; argv: string[] } {
  const words = command.split(/\s+/u);
  const env: Record<string, string> = {};
  while (words[0] !== undefined && /^[A-Z_]+=/u.test(words[0])) {
    const [key = '', value = ''] = (words.shift() ?? '').split('=');
    env[key] = value;
  }
  if (words[0] === 'npx' && words[1] === 'triggerlist') return { env, argv: [BIN, ...words.slice(2)] };
  return { env, argv: words.slice(1) };
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
      // A hung example is killed with SIGKILL, which no page promises, so a timeout can never
      // pass for an example that was meant to die of SIGTERM.
      const result = spawnSync(process.execPath, argv, { cwd: dir, env: { ...plain, ...env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20_000, killSignal: 'SIGKILL' });
      expect({ status: result.status, signal: result.signal }, result.stderr).toEqual({ status: run.exit, signal: run.signal });
      expect(result.stdout + result.stderr).toBe(run.expected);
    }, 30_000);
  });
});
