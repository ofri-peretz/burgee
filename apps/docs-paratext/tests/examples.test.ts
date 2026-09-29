/**
 * Every runnable example on this site runs, and prints what the page says it prints.
 *
 * A page marks a file with a titled fence — ```js title="steps.mjs" — and the output it
 * promises with a text fence titled by the command — ```text title="node steps.mjs --json".
 * This writes each page's files into a scratch directory inside the app (so `paratext`
 * resolves to the workspace build, as it would from `node_modules` after `npm i`), runs each
 * command with stdout and stderr piped, and compares what came out, both streams, with the
 * fence. A piped run is the one the static projection is for, and the one whose output does
 * not depend on the terminal running the test.
 *
 * Getting started's files are written beside every page's, so a page can run them without
 * repeating them; a page that defines a file of the same name wins.
 *
 * The environment is cleared of everything a terminal-detection rule here reads — the output
 * policy's switches, `TERM`, `TERM_PROGRAM` and the variables terminals announce themselves
 * with, and `FORCE_HYPERLINK` — unless the command sets it, so a CI runner and a laptop inside
 * iTerm2 run the same example.
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
      if (/^(?:[A-Z_]+=\S* )*(?:node|npx paratext) /u.test(title)) runs.push({ command: title, expected: body, exit: Number(meta(info, 'exit') ?? '0') });
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

/** What paratext's and supports-hyperlinks' detection read; cleared unless a command sets it. */
const POLICY = [
  'CI',
  'CLI_ACCESSIBLE',
  'NO_COLOR',
  'FORCE_COLOR',
  'COLORTERM',
  'TERM',
  'TERM_PROGRAM',
  'TERM_PROGRAM_VERSION',
  'VTE_VERSION',
  'WT_SESSION',
  'KONSOLE_VERSION',
  'TEAMCITY_VERSION',
  'FORCE_HYPERLINK',
];

/** The `paratext` bin, as `npx paratext` finds it in an install. */
const BIN = join(APP, '..', '..', 'node_modules', 'paratext', 'dist', 'cli.js');

/** `node x.mjs --json`, `CI=true node x.mjs` or `npx paratext check x.mjs` → env and node's argv. */
function parse(command: string): { env: Record<string, string>; argv: string[] } {
  const words = command.split(/\s+/u);
  const env: Record<string, string> = {};
  while (words[0] !== undefined && /^[A-Z_]+=/u.test(words[0])) {
    const [key = '', value = ''] = (words.shift() ?? '').split('=');
    env[key] = value;
  }
  if (words[0] === 'npx' && words[1] === 'paratext') return { env, argv: [BIN, ...words.slice(2)] };
  return { env, argv: words.slice(1) };
}

describe('the examples on this site', () => {
  it('has examples to run — otherwise every case below asserts nothing', () => {
    expect(all.length).toBeGreaterThan(0);
    expect(shared.has('first.mjs'), 'getting-started.mdx no longer defines first.mjs').toBe(true);
  });

  describe.each(all.map((p) => [p.path, p] as const))('%s', (_path, page) => {
    const dir = mkdtempSync(join(APP, '.examples-'));
    scratch.push(dir);
    for (const [name, body] of [...shared, ...page.files]) writeFileSync(join(dir, name), body);

    it.each(page.runs.map((r) => [r.command, r] as const))('`%s` prints what the page shows', (_command, run) => {
      const { env, argv } = parse(run.command);
      const childEnv: NodeJS.ProcessEnv = { ...process.env, ...env };
      for (const key of POLICY) if (!(key in env)) delete childEnv[key];
      const result = spawnSync(process.execPath, argv, { cwd: dir, env: childEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      expect(result.status, result.stderr).toBe(run.exit);
      // Both streams, as a reader piping the command sees them. Every example here writes to
      // one of them per run, so their order against each other never matters.
      expect(result.stdout + result.stderr).toBe(run.expected);
    });
  });
});
