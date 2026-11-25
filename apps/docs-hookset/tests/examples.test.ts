/**
 * Every runnable example on this site runs, and prints what the page says it prints.
 *
 * A page marks a file with a titled fence — ```json title="package.json" — and the output it
 * promises with a text fence titled by the command — ```text title="npx hookset check".
 * This writes each page's files — a titled `js`, `ts`, `json` or `yaml` fence, at the path its
 * title names, `.claude/hookset.json` included — into a scratch directory inside the app, runs
 * each command there with stdout and stderr piped, and compares what came out — stdout, then
 * stderr — with the fence. `npx hookset` is the workspace build of the bin, as it would be from
 * `node_modules` after `npm i`.
 *
 * A page's commands run in order in one directory, the way a reader types them: `hookset init`
 * writes the lefthook.yml that the `hookset check` after it reads.
 *
 * `exit="1"` on the output fence is the code the page promises; a fence without it promises 0.
 *
 * The version a repository pins is the package's own (`hookset@<version>`), so every release
 * would rewrite the output of every example. Both sides are compared with each
 * `hookset@<major>.<minor>.<patch>` read as `hookset@<version>`: the shape of the output is the
 * promise, and a Version PR stays green. A page that pins an older tag on purpose still shows the
 * warning a pin that is behind prints.
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
/** The languages a titled fence is a file in. */
const FILES = new Set(['js', 'ts', 'javascript', 'json', 'yaml', 'yml']);

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
    if (/^(?:[A-Z_]+=\S* )*(?:node|npx hookset) /u.test(title)) runs.push({ command: title, expected: body, exit: Number(meta(info, 'exit') ?? '0') });
    else if (FILES.has(lang)) files.set(title, body);
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

/** The `hookset` bin, as `npx hookset` finds it in an install. */
const BIN = join(APP, '..', '..', 'node_modules', 'hookset', 'dist', 'bin.js');

/**
 * The environment an example runs in: this one, with colour off, and without the project
 * directory Claude Code exports, so the Claude hooks read the scratch repository's
 * `.claude/hookset.json` rather than the one of the session running the tests.
 */
const { FORCE_COLOR: _force, CLAUDE_PROJECT_DIR: _project, ...inherited } = process.env;
const plain = { ...inherited, NO_COLOR: '1' };

/** `node x.mjs`, `NAME=1 node x.mjs` or `npx hookset check --json` → env and node's argv. */
function parse(command: string): { env: Record<string, string>; argv: string[] } {
  const words = command.split(/\s+/u);
  const env: Record<string, string> = {};
  while (words[0] !== undefined && /^[A-Z_]+=/u.test(words[0])) {
    const [key = '', value = ''] = (words.shift() ?? '').split('=');
    env[key] = value;
  }
  if (words[0] === 'npx' && words[1] === 'hookset') return { env, argv: [BIN, ...words.slice(2)] };
  return { env, argv: words.slice(1) };
}

/** Output with every pinned version read as one: see the header. */
const anyVersion = (text: string): string => text.replaceAll(/hookset@\d+\.\d+\.\d+/gu, 'hookset@<version>');

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
      expect(anyVersion(result.stdout + result.stderr)).toBe(anyVersion(run.expected));
    }, 30_000);
  });
});
