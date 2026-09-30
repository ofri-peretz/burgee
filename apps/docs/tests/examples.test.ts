/**
 * Every runnable example on this site runs, and prints what the page says it prints.
 *
 * The pattern `apps/docs-flagstaff/tests/examples.test.ts` set, for the front door. A page marks
 * a file with a titled fence — ```js title="policy.mjs" — and the output it promises with a
 * text fence titled by the command — ```text title="NO_COLOR=1 node policy.mjs", or
 * ```text title="npx roundel check acme.mjs" for a family package's own bin. This writes
 * each page's files into a scratch directory inside the app, so every family package resolves
 * to the workspace build as it would from `node_modules` after `npm i`, runs each command with
 * stdin closed and stdout and stderr piped, and compares what came out — both streams, stdout
 * first — with the fence. `exit="N"` on the output fence says the example fails on purpose, and
 * `signal="SIGTERM"` that it dies of that signal, which a POSIX parent sees as no exit code at all
 * (skipped on Windows, which has no such death).
 *
 * The environment is cleared of everything the output policy and agent detection read unless
 * the command sets it, so a CI runner, a laptop and an agent's shell run the same example.
 *
 * Proven red: changing any expected line in `content/docs/concepts/*.mdx` fails its case, and
 * so does a page whose files no longer import.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  readonly signal: string | undefined;
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
      if (/^(?:[A-Z_]+=\S* )*(?:node|npx [a-z]+) /u.test(title)) runs.push({ command: title, expected: body, exit: Number(meta(info, 'exit') ?? '0'), signal: meta(info, 'signal') });
      else if (lang === 'js' || lang === 'ts' || lang === 'javascript' || lang === 'json') files.set(title, body);
    }
    return runs.length === 0 ? [] : [{ path: relative(CONTENT, abs), files, runs }];
  });
}

const all = pagesWithExamples();
const scratch: string[] = [];
afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

/**
 * What the output policy and agent detection read — `roundel/policy`, `roundel/terminal` and
 * burgee's `agent.ts` — cleared unless a command sets it.
 */
const AMBIENT = new Set(['CI', 'CLI_ACCESSIBLE', 'NO_COLOR', 'FORCE_COLOR', 'FORCE_TTY', 'TERM', 'COLORTERM', 'AI_AGENT', 'CLAUDECODE', 'CURSOR_AGENT', 'CODEX_THREAD_ID', 'GEMINI_CLI', 'GITHUB_ACTIONS', 'GITEA_ACTIONS', 'CIRCLECI', 'TRAVIS', 'APPVEYOR', 'GITLAB_CI', 'BUILDKITE', 'DRONE', 'CI_NAME', 'TF_BUILD', 'AGENT_NAME']);

/** A family package's bin, as `npx <name>` finds it in an install. */
function bin(name: string): string {
  const dir = join(APP, '..', '..', 'node_modules', name);
  const { bin: declared } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { bin?: string | Record<string, string> };
  const path = typeof declared === 'string' ? declared : declared?.[name];
  if (path === undefined) throw new Error(`${name} has no bin named ${name}`);
  return join(dir, path);
}

/** `NO_COLOR=1 node x.mjs --json` or `npx roundel check x.mjs` → env and node's argv. */
function parse(command: string): { env: Record<string, string>; argv: string[] } {
  const words = command.split(/\s+/u);
  const env: Record<string, string> = {};
  while (words[0] !== undefined && /^[A-Z_]+=/u.test(words[0])) {
    const word = words.shift() ?? '';
    const at = word.indexOf('=');
    env[word.slice(0, at)] = word.slice(at + 1);
  }
  if (words[0] === 'npx') return { env, argv: [bin(words[1] ?? ''), ...words.slice(2)] };
  return { env, argv: words.slice(1) };
}

describe('the examples on this site', () => {
  it('has examples to run — otherwise every case below asserts nothing', () => {
    expect(all.length).toBeGreaterThan(0);
  });

  describe.each(all.map((p) => [p.path, p] as const))('%s', (_path, page) => {
    const dir = mkdtempSync(join(APP, '.examples-'));
    scratch.push(dir);
    for (const [name, body] of page.files) {
      mkdirSync(dirname(join(dir, name)), { recursive: true });
      writeFileSync(join(dir, name), body);
    }

    it.each(page.runs.map((r) => [r.command, r] as const))('`%s` prints what the page shows', (_command, run) => {
      if (run.signal !== undefined && process.platform === 'win32') return;
      const { env, argv } = parse(run.command);
      const childEnv: NodeJS.ProcessEnv = {};
      for (const [key, value] of Object.entries(process.env)) if (!AMBIENT.has(key)) childEnv[key] = value;
      Object.assign(childEnv, env);
      const result = spawnSync(process.execPath, argv, { cwd: dir, env: childEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      if (run.signal === undefined) expect(result.status, result.stderr).toBe(run.exit);
      else expect([result.status, result.signal], result.stderr).toEqual([null, run.signal]);
      expect(result.stdout + result.stderr).toBe(run.expected);
    });
  });
});
