/**
 * Every runnable example on this site runs, and prints what the page says it prints.
 *
 * The pattern `apps/docs-flagstaff/tests/examples.test.ts` set. A page marks a file with a titled
 * fence — ```js title="deploy.mjs" — and the output it promises with a text fence titled by the
 * command — ```text title="node deploy.mjs --json". This writes each page's files into a scratch
 * directory inside the app (so `controlroom` resolves to the workspace build, as it would from
 * `node_modules` after `npm i`), runs each command with stdout and stderr piped — the mode an
 * example's output is shown in, since a page cannot show a terminal repaint as text — and
 * compares what came out, both streams, stdout first, with the fence.
 *
 * Two additions to flagstaff's. A command may start with `printf '…' |`, which becomes the
 * child's stdin: that is how a page shows the input line fed from a pipe. And an output fence
 * may carry `in="examples/<name>"`, which runs the command in that example directory of this
 * repository instead of a scratch one — so a recipe's output is the boilerplate's real output,
 * not a copy of its source that could drift from it.
 *
 * Getting started's files are written beside every page's, so a page can import them without
 * repeating them; a page that defines a file of the same name wins.
 *
 * The environment is cleared of everything the output policy reads (`CI`, `CLI_ACCESSIBLE`,
 * `NO_COLOR`, `FORCE_COLOR`, `TERM`) unless the command sets it, so a CI runner and a laptop
 * run the same example.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = join(APP, '..', '..');
const CONTENT = join(APP, 'content', 'docs');

/** A fenced block: its language, the rest of its opening line, and its body. */
const FENCE = /^```(\w+)([^\n]*)\n([\s\S]*?)^```$/gmu;
/** One `key="value"` of a fence's meta. */
const meta = (line: string, key: string): string | undefined => new RegExp(`\\b${key}="([^"]*)"`, 'u').exec(line)?.[1];
/** A command this suite runs: optional `printf '…' |`, optional `KEY=value`s, then `node` or `npx controlroom`. */
const COMMAND = /^(?:printf '[^']*' \| )?(?:[A-Z_]+=\S* )*(?:node|npx controlroom) /u;

interface Run {
  readonly command: string;
  readonly expected: string;
  readonly exit: number;
  /** A repository directory to run in, instead of the page's scratch directory. */
  readonly in?: string;
}

interface Page {
  readonly path: string;
  readonly files: ReadonlyMap<string, string>;
  readonly runs: readonly Run[];
}

function pagesWithExamples(dir: string = CONTENT): Page[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e): Page[] => {
    const abs = join(dir, e.name);
    if (e.isDirectory()) return pagesWithExamples(abs);
    if (!e.name.endsWith('.mdx')) return [];
    const files = new Map<string, string>();
    const runs: Run[] = [];
    for (const [, lang, info = '', body] of readFileSync(abs, 'utf8').matchAll(FENCE)) {
      const title = meta(info, 'title');
      if (title === undefined || body === undefined) continue;
      // `exit="1"` on the output fence: the example fails on purpose, and says so.
      if (COMMAND.test(title)) runs.push({ command: title, expected: body, exit: Number(meta(info, 'exit') ?? '0'), in: meta(info, 'in') });
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

/** The `controlroom` bin, as `npx controlroom` finds it in an install. */
const BIN = join(REPO, 'node_modules', 'controlroom', 'dist', 'cli.js');

/** `printf 'a\n' | CI=1 node x.mjs --json` or `npx controlroom check x.mjs` → stdin, env and node's argv. */
function parse(command: string): { input: string | undefined; env: Record<string, string>; argv: string[] } {
  const piped = /^printf '([^']*)' \| /u.exec(command);
  const input = piped?.[1]?.replaceAll(String.raw`\n`, '\n');
  const words = command.slice(piped?.[0].length ?? 0).split(/\s+/u);
  const env: Record<string, string> = {};
  while (words[0] !== undefined && /^[A-Z_]+=/u.test(words[0])) {
    const [key = '', value = ''] = (words.shift() ?? '').split('=');
    env[key] = value;
  }
  if (words[0] === 'npx' && words[1] === 'controlroom') return { input, env, argv: [BIN, ...words.slice(2)] };
  return { input, env, argv: words.slice(1) };
}

describe('the examples on this site', () => {
  it('has examples to run — otherwise every case below asserts nothing', () => {
    expect(all.length).toBeGreaterThan(0);
    expect(shared.size, 'getting-started.mdx defines no files, which the other pages import').toBeGreaterThan(0);
  });

  it('reads a piped command the way a shell would', () => {
    expect(parse(String.raw`printf 'a\nb\n' | CI=1 node x.mjs --json`)).toEqual({ input: 'a\nb\n', env: { CI: '1' }, argv: ['x.mjs', '--json'] });
    expect(parse('npx controlroom check p.mjs').argv).toEqual([BIN, 'check', 'p.mjs']);
  });

  describe.each(all.map((p) => [p.path, p] as const))('%s', (_path, page) => {
    const dir = mkdtempSync(join(APP, '.examples-'));
    scratch.push(dir);
    for (const [name, body] of [...shared, ...page.files]) writeFileSync(join(dir, name), body);

    it.each(page.runs.map((r) => [r.command, r] as const))('`%s` prints what the page shows', (_command, run) => {
      const cwd = run.in === undefined ? dir : join(REPO, run.in);
      expect(existsSync(cwd), `in="${run.in ?? ''}" is not a directory of this repository`).toBe(true);
      const { input, env, argv } = parse(run.command);
      const childEnv: NodeJS.ProcessEnv = { ...process.env, ...env };
      for (const key of POLICY) if (!(key in env)) delete childEnv[key];
      // The pages show Unicode symbols. On Windows, flagstaff falls back to ASCII unless the
      // terminal says it is Unicode, so the examples run as they would in Windows Terminal.
      if (process.platform === 'win32') childEnv['WT_SESSION'] ??= 'examples';
      const result = spawnSync(process.execPath, argv, { cwd, env: childEnv, encoding: 'utf8', input: input ?? '', stdio: ['pipe', 'pipe', 'pipe'] });
      expect(result.status, result.stderr).toBe(run.exit);
      expect(result.stdout + result.stderr).toBe(run.expected);
    });
  });
});
