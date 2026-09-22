/**
 * The seam itself (PLAN 4.3, Y9): `runtime.ts` is the one file in caique that names
 * `process`, and what it hands back is read at call time rather than at import.
 *
 * Both of these are the kind of thing that is true on the day it is written and quietly
 * false a month later, so both are asserted rather than documented. The first walks the
 * package's own sources with the same pattern `burgee/src/process-reference-lock.test.ts`
 * applies repo-wide — a package should fail in its own suite before it fails in another
 * package's lock. The second is the reason `processRuntime` is a function: a runtime built
 * once at import freezes whatever the environment was when the module graph loaded, which
 * is before any test could say what it wanted the world to look like.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { decide, type Runtime as DecideRuntime } from './decide.js';
import { processRuntime } from './runtime.js';
import { streamsOf } from './terminal.js';

const src = resolve(dirname(fileURLToPath(import.meta.url)));

/** The repo lock's pattern, kept in step deliberately: the bare global or `globalThis.process`. */
const PROCESS_READ = /(?:(?<=\bglobalThis\.)|(?<![.\w]))process\??\.(env|argv|exit|exitCode|stdout|stderr|stdin|cwd)\b/;

function sources(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'dist') continue;
      sources(p, out);
    } else if (/\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}

/** Comments and quoted spans are prose, not code — the repo lock strips them for the same reason. */
function codeOf(line: string): string {
  return line
    .replace(/\/\/.*$/, '')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\$]|\\.)*`/g, '``');
}

describe('the runtime seam', () => {
  /**
   * The only library file, and the declared program beside it. `caique check` (2026-09-22) is a
   * ten-line `cli.ts` that owns the process by definition — argv in, stdout out, an exit code
   * set — and hands all three to a pure `check.ts`. Read from `package.json`'s `bin`, so the
   * exemption lasts exactly as long as the program does.
   */
  it('is the only file in caique that reads the process, besides the program itself', () => {
    const offenders: string[] = [];
    const manifest = JSON.parse(readFileSync(join(src, '..', 'package.json'), 'utf8')) as { bin?: Record<string, string> };
    const bin = new Set(Object.values(manifest.bin ?? {}).map((t) => t.replace('./dist/', '').replace(/\.js$/u, '.ts')));
    for (const file of sources(src)) {
      const rel = relative(src, file).split(sep).join('/');
      if (rel === 'runtime.ts' || bin.has(rel)) continue;
      readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .forEach((line, i) => {
          if (PROCESS_READ.test(codeOf(line)) && !/^\s*(\*|\/\*)/.test(line)) offenders.push(`${rel}:${i + 1}`);
        });
    }
    expect(offenders, 'read the Runtime instead').toEqual([]);
  });

  it('names the process at least once, or it is not the seam', () => {
    expect(PROCESS_READ.test(readFileSync(join(src, 'runtime.ts'), 'utf8'))).toBe(true);
  });
});

describe('processRuntime', () => {
  /**
   * The failure this exists for: `export const processRuntime = { env: process.env, … }`
   * type-checks, reads correctly on the day it is written, and cannot be substituted by a
   * test that assigns `process.env` after the import — which is every test that needs one.
   */
  it('reads the environment when asked, not when imported', () => {
    const original = process.env;
    try {
      process.env = { ...original, CAIQUE_RUNTIME_LIVE: 'yes' };
      expect(processRuntime().env['CAIQUE_RUNTIME_LIVE']).toBe('yes');
    } finally {
      process.env = original;
    }
  });

  it('reads the terminal when asked, not when imported', () => {
    const before = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
    try {
      // Both answers from one import. A runtime captured at load time can satisfy one of
      // these two lines; it cannot satisfy both.
      Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
      expect(processRuntime().isTTY.stdout).toBe(true);
      Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
      expect(processRuntime().isTTY.stdout).toBe(false);
    } finally {
      if (before === undefined) delete (process.stdout as { isTTY?: boolean }).isTTY;
      else Object.defineProperty(process.stdout, 'isTTY', before);
    }
  });

  it('satisfies the slice `decide()` asks for, CI included', () => {
    const original = process.env;
    try {
      process.env = { ...original, CI: '1' };
      const runtime: DecideRuntime = processRuntime();
      const d = decide({ value: undefined, spec: { kind: 'text', message: 'where?' }, option: 'out', runtime, required: true });
      // `CI` set means nobody is there to type, whatever the terminal claims.
      expect(d.action).toBe('error');
      expect(d.message).toContain('--out');
    } finally {
      process.env = original;
    }
  });

  it('is the stream pair `createIo()` builds over when it is given none', () => {
    expect(streamsOf(processRuntime())).toEqual({ input: process.stdin, output: process.stdout });
  });
});
