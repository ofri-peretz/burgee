/**
 * Every runnable example on this site runs, and prints what the page says it prints.
 *
 * A page marks a file with a titled fence — ```js title="steps.mjs" — and the output it
 * promises with a text fence titled by the command — ```text title="node steps.mjs --json".
 * This writes each page's files into a scratch directory inside the app (so `flagstaff`
 * resolves to the workspace build, as it would from `node_modules` after `npm i`), runs each
 * command with stdout and stderr piped — the mode an example's output is shown in, since a
 * page cannot show a terminal repaint as text — and compares what came out, both streams, in
 * the order they were written, with the fence.
 *
 * Getting started's files — `rt.mjs`, the runtime every example hoists with, and its first
 * program — are written beside every page's, so a page can run them without repeating them;
 * a page that defines a file of the same name wins.
 *
 * The environment is cleared of everything the output policy reads (`CI`, `CLI_ACCESSIBLE`,
 * `NO_COLOR`, `FORCE_COLOR`, `TERM`) unless the command sets it, so a CI runner and a laptop
 * run the same example.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(APP, 'content', 'docs');

/** A fenced block: its language, the rest of its opening line, and its body. */
const FENCE = /^```(\w+)([^\n]*)\n([\s\S]*?)^```$/gmu;
/** One `key="value"` of a fence's meta. */
const meta = (line: string, key: string): string | undefined => new RegExp(`\\b${key}="([^"]*)"`, 'u').exec(line)?.[1];

interface Page {
  readonly path: string;
  readonly files: ReadonlyMap<string, string>;
  readonly runs: readonly { readonly command: string; readonly expected: string; readonly exit: number }[];
}

function pagesWithExamples(dir: string = CONTENT): Page[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e): Page[] => {
    const abs = join(dir, e.name);
    if (e.isDirectory()) return pagesWithExamples(abs);
    if (!e.name.endsWith('.mdx')) return [];
    const files = new Map<string, string>();
    const runs: { command: string; expected: string; exit: number }[] = [];
    for (const [, lang, info = '', body] of readFileSync(abs, 'utf8').matchAll(FENCE)) {
      const title = meta(info, 'title');
      if (title === undefined || body === undefined) continue;
      // `exit="1"` on the output fence: the example fails on purpose, and says so.
      if (/^(?:[A-Z_]+=\S* )*(?:node|npx flagstaff) /u.test(title)) runs.push({ command: title, expected: body, exit: Number(meta(info, 'exit') ?? '0') });
      else if (lang === 'js' || lang === 'ts' || lang === 'javascript') files.set(title, body);
    }
    return runs.length === 0 ? [] : [{ path: relative(CONTENT, abs), files, runs }];
  });
}

const all = pagesWithExamples();
const shared = all.find((p) => p.path === 'getting-started.mdx')?.files ?? new Map<string, string>();
const scratch: string[] = [];
afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

/** What the output policy reads; cleared unless a command sets it. */
const POLICY = ['CI', 'CLI_ACCESSIBLE', 'NO_COLOR', 'FORCE_COLOR', 'TERM'];

/** The `flagstaff` bin, as `npx flagstaff` finds it in an install. */
const BIN = join(APP, '..', '..', 'node_modules', 'flagstaff', 'dist', 'cli.js');

/** `node x.mjs --json`, `CLI_ACCESSIBLE=1 node x.mjs` or `npx flagstaff check x.mjs` → env and node's argv. */
function parse(command: string): { env: Record<string, string>; argv: string[] } {
  const words = command.split(/\s+/u);
  const env: Record<string, string> = {};
  while (words[0] !== undefined && /^[A-Z_]+=/u.test(words[0])) {
    const [key = '', value = ''] = (words.shift() ?? '').split('=');
    env[key] = value;
  }
  if (words[0] === 'npx' && words[1] === 'flagstaff') return { env, argv: [BIN, ...words.slice(2)] };
  return { env, argv: words.slice(1) };
}

describe('the examples on this site', () => {
  it('has examples to run — otherwise every case below asserts nothing', () => {
    expect(all.length).toBeGreaterThan(0);
    expect(shared.has('rt.mjs'), 'getting-started.mdx no longer defines rt.mjs, which the other pages import').toBe(true);
  });

  describe.each(all.map((p) => [p.path, p] as const))('%s', (_path, page) => {
    const dir = mkdtempSync(join(APP, '.examples-'));
    scratch.push(dir);
    for (const [name, body] of [...shared, ...page.files]) writeFileSync(join(dir, name), body);

    it.each(page.runs.map((r) => [r.command, r] as const))('`%s` prints what the page shows', (_command, run) => {
      const { env, argv } = parse(run.command);
      const childEnv: NodeJS.ProcessEnv = { ...process.env, ...env };
      for (const key of POLICY) if (!(key in env)) delete childEnv[key];
      // The pages show Unicode symbols. On Windows, ora (via is-unicode-supported) and flagstaff
      // both fall back to `√` unless the terminal says it is Unicode, so the examples run as they
      // would in Windows Terminal. Elsewhere this variable is ignored.
      if (process.platform === 'win32') childEnv['WT_SESSION'] ??= 'examples';
      const result = spawnSync(process.execPath, argv, { cwd: dir, env: childEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      expect(result.status, result.stderr).toBe(run.exit);
      // Both streams. Every example writes to one of them per run — a `--json` run to stderr,
      // everything else to stdout — so their order against each other never matters.
      expect(result.stdout + result.stderr).toBe(run.expected);
    });
  });
});
