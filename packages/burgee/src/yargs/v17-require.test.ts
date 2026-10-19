/**
 * `previous-majors` R4 — `require('burgee/yargs/v17')` is yargs 17's singleton: an instance
 * bound to `process.argv` without its binary, its methods on the required function, callable as
 * the factory, and rebuilt by a fresh `require()` after a cache bust. 18 removed it, so
 * `require('burgee/yargs')` hands back the factory, whose `.argv` is undefined.
 *
 * Each case is a child process, because the subject is what one process's `require()` returns
 * for one `process.argv`. It loads the built entry by name through the package's own exports
 * map, which is the path a migrated program takes; `npm test` builds first.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

const MANIFEST = fileURLToPath(new URL('../../package.json', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'burgee-v17-require-'));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

let scripts = 0;

/** Runs `body` as a CommonJS program with `args`, `load(spec)` requiring through burgee's exports map; returns its stdout as JSON. */
function run(body: string, args: string[] = [], env: NodeJS.ProcessEnv = {}): { out: unknown; stderr: string; status: number | null } {
  scripts += 1;
  const file = join(dir, `program-${String(scripts)}.cjs`);
  writeFileSync(file, `const load = require('node:module').createRequire(${JSON.stringify(MANIFEST)});\n${body}\n`);
  const child = spawnSync(process.execPath, [file, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
  return { out: child.stdout === '' ? undefined : (JSON.parse(child.stdout) as unknown), stderr: child.stderr, status: child.status };
}

describe("require('burgee/yargs/v17') is yargs 17's singleton", () => {
  it('parses process.argv, without its binary, through `.argv` on the required function', () => {
    const { out } = run("const yargs = load('burgee/yargs/v17'); console.log(JSON.stringify({ kind: typeof yargs, argv: yargs.argv }));", ['--foo', 'bar', 'rest']);
    expect(out).toMatchObject({ kind: 'function', argv: { foo: 'bar', _: ['rest'] } });
  });

  it('carries every instance method, bound, so a chain off the require works', () => {
    const { out } = run("const yargs = load('burgee/yargs/v17'); const argv = yargs.option('n', { type: 'number' }).parse(); console.log(JSON.stringify({ n: argv.n, $0: yargs.$0, parsed: yargs.parsed !== false }));", ['-n', '3']);
    expect(out).toEqual({ n: 3, $0: expect.stringMatching(/program-\d+\.cjs$/) as unknown, parsed: true });
  });

  it('is callable as the factory, and rebinds itself to the instance a call builds', () => {
    const { out } = run("const yargs = load('burgee/yargs/v17'); const built = yargs(['--x', '1']); console.log(JSON.stringify({ built: built.argv.x, singleton: yargs.argv.x }));", ['--x', '9']);
    expect(out).toEqual({ built: 1, singleton: 1 });
  });

  it('is rebuilt over the current process.argv by a require after a cache bust', () => {
    const { out } = run(
      "const spec = load.resolve('burgee/yargs/v17'); const first = load(spec); process.argv = [process.argv[0], process.argv[1], '--again']; delete load.cache[spec]; const second = load(spec); console.log(JSON.stringify({ fresh: first !== second, argv: second.argv.again === true }));",
    );
    expect(out).toEqual({ fresh: true, argv: true });
  });

  it("refuses a Node older than YARGS_MIN_NODE_VERSION, as 17's CommonJS entry does", () => {
    const refused = run("load('burgee/yargs/v17'); console.log('null');", [], { YARGS_MIN_NODE_VERSION: '999' });
    expect(refused.status).not.toBe(0);
    expect(refused.stderr).toMatch(/yargs supports a minimum Node\.js version of 999/);
    expect(run("load('burgee/yargs/v17'); console.log('true');", [], { YARGS_MIN_NODE_VERSION: '12' }).out).toBe(true);
  });

  it("is not burgee/yargs's: 18's require() hands back the factory, whose .argv is undefined", () => {
    const { out } = run("const yargs = load('burgee/yargs'); console.log(JSON.stringify({ argv: yargs.argv === undefined, option: typeof yargs.option }));", ['--foo']);
    expect(out).toEqual({ argv: true, option: 'undefined' });
  });
});
