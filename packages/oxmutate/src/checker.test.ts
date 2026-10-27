import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { applyMutant, batches, checkSurvivors, parseDiagnostics, type CheckMutant } from './checker.js';

const typed = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures', 'typed');

describe('the type checker', () => {
  it('applies a mutant at UTF-16 columns, end exclusive', () => {
    const source = "const a = 'é';\nreturn fast ? 'fast' : 'safe';\n";
    expect(applyMutant(source, { start: { line: 2, column: 15 }, end: { line: 2, column: 21 }, replacement: '""' })).toBe("const a = 'é';\nreturn fast ? \"\" : 'safe';\n");
  });

  it('reads the first error per file from --pretty false output, relative to the project', () => {
    const out = "src/a.ts(3,7): error TS2322: Type '\"\"' is not assignable to type 'Mode'.\nsrc/a.ts(9,1): error TS1005: ';' expected.\n/abs/p/src/b.ts(1,1): error TS2304: Cannot find name 'x'.\nnot a diagnostic\n";
    const errors = parseDiagnostics(out, '/abs/p');
    expect(errors.get('src/a.ts')).toBe("TS2322: Type '\"\"' is not assignable to type 'Mode'. (line 3)");
    expect(errors.get('src/b.ts')).toBe("TS2304: Cannot find name 'x'. (line 1)");
    expect(errors.size).toBe(2);
  });

  it('reads indented and CRLF lines, and line and column numbers of any length', () => {
    const out = '  src/a.ts(123,45): error TS2322: wide.\r\n\tsrc/b.ts(1,10): error TS1005: tabbed.\r\nsrc/c.ts(1,1): warning TS1: not an error\n';
    expect(parseDiagnostics(out, '/p')).toEqual(
      new Map([
        ['src/a.ts', 'TS2322: wide. (line 123)'],
        ['src/b.ts', 'TS1005: tabbed. (line 1)'],
      ]),
    );
  });

  it('batches at most one mutant per file', () => {
    const groups = batches([{ file: 'a' }, { file: 'a' }, { file: 'b' }, { file: 'a' }]);
    expect(groups.map((g) => g.map((m) => m.file).join(''))).toEqual(['ab', 'a', 'a']);
    expect(batches([{ file: 'a' }, { file: 'b' }, { file: 'c' }]).map((g) => g.length)).toEqual([3]);
    expect(batches([])).toEqual([]);
  });

  // The one run of the real compiler: the fixture's own tsc, over a real type error.
  it('refuses the mutants that do not compile, with the error, and passes the ones that do', async () => {
    const source = readFileSync(path.join(typed, 'src/pick.ts'), 'utf8');
    const line = source.split('\n').findIndex((l) => l.includes("'fast' : 'safe'")) + 1;
    const col = (needle: string): number => (source.split('\n')[line - 1] ?? '').indexOf(needle) + 1;
    const refused = await checkSurvivors({ root: typed, tsconfig: 'tsconfig.json', concurrency: 2 }, [
      { id: 'fast', file: 'src/pick.ts', start: { line, column: col("'fast'") }, end: { line, column: col("'fast'") + 6 }, replacement: '""' },
      { id: 'safe', file: 'src/pick.ts', start: { line, column: col("'safe'") }, end: { line, column: col("'safe'") + 6 }, replacement: "'fast'" },
    ]);
    expect([...refused.keys()]).toEqual(['fast']);
    expect(refused.get('fast')).toMatch(/^TS2322: .*not assignable to type 'Mode'/);
  }, 120_000);
});

/**
 * A stand-in compiler, so the batching paths run in milliseconds and not one tsc start each. It
 * logs each call (arguments, and how many sandboxes exist beside it), then reports an error in each
 * file containing BAD and, for each file containing CROSS, one in src/c.ts. Like tsc, a summary
 * goes to stdout; the diagnostics go to stderr, after that unterminated line.
 */
const tmp = realpathSync(mkdtempSync(path.join(tmpdir(), 'oxmutate-checker-')));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
const fake = path.join(tmp, 'fake-tsc.mjs');
writeFileSync(
  fake,
  `import { appendFileSync, readFileSync, readdirSync } from 'node:fs';
const sandboxes = readdirSync('..').filter((f) => f.startsWith('sandbox-')).length;
appendFileSync(process.env.FAKE_TSC_LOG, JSON.stringify({ args: process.argv.slice(2), sandboxes, src: readdirSync('src').map((f) => readFileSync('src/' + f, 'utf8')).join('|') }) + '\\n');
if (process.env.FAKE_TSC_FAIL) { process.stdout.write('OUT'); process.stderr.write('ERR' + 'e'.repeat(2000) + 'END \\n'); process.exit(2); }
const errors = [];
for (const f of readdirSync('src').sort()) {
  const s = readFileSync('src/' + f, 'utf8');
  if (s.includes('BAD')) errors.push('src/' + f + '(2,3): error TS2322: bad in ' + f);
  if (s.includes('CROSS')) errors.push('src/c.ts(1,1): error TS2345: crossed from ' + f);
}
process.stdout.write('Found ' + errors.length + ' errors');
process.stderr.write(errors.join('\\n'));
process.exit(errors.length && !process.env.FAKE_TSC_EXIT_0 ? 1 : 0);
`,
);
const log = path.join(tmp, 'calls.jsonl');
const calls = (): { args: string[]; sandboxes: number; src: string }[] =>
  existsSync(log)
    ? readFileSync(log, 'utf8')
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l) as { args: string[]; sandboxes: number; src: string })
    : [];

/** A project of three files, each `export const é = 0;`. */
let projects = 0;
const project = (): string => {
  const root = path.join(tmp, `p${String(projects++)}`);
  mkdirSync(path.join(root, 'src'), { recursive: true });
  for (const f of ['a', 'b', 'c']) writeFileSync(path.join(root, 'src', `${f}.ts`), 'export const é = 0;\n');
  writeFileSync(path.join(root, 'tsconfig.json'), '{}');
  return root;
};
/** A mutant replacing the `0` in `src/<file>.ts`, past `é`: one UTF-16 column, two bytes in UTF-8. */
const m = (id: string, file: string, replacement: string): CheckMutant => ({ id, file: `src/${file}.ts`, start: { line: 1, column: 18 }, end: { line: 1, column: 19 }, replacement });
/** What the stand-in saw in src/a.ts, b.ts and c.ts, by each file's value. */
const src = (...values: string[]): string => values.map((v) => `export const é = ${v};\n`).join('|');
const leftover = (root: string): string[] => (existsSync(path.join(root, '.oxmutate-tmp')) ? readdirSync(path.join(root, '.oxmutate-tmp')) : []);

describe('checkSurvivors, against a stand-in compiler', () => {
  beforeEach(() => {
    rmSync(log, { force: true });
    vi.stubEnv('FAKE_TSC_LOG', log);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('checks nothing, and starts nothing, when there are no survivors', async () => {
    expect(await checkSurvivors({ root: project(), tsconfig: 'tsconfig.json', command: `node ${fake}`, concurrency: 2 }, [])).toEqual(new Map());
    expect(calls()).toEqual([]);
  });

  it('runs the command, split on any spaces, with --noEmit --pretty false -p and the tsconfig', async () => {
    const root = project();
    await checkSurvivors({ root, tsconfig: 'tsconfig.build.json', command: `  node   ${fake}  `, concurrency: 1 }, [m('x', 'a', '1')]);
    expect(calls().map((c) => c.args)).toEqual([
      ['--noEmit', '--pretty', 'false', '-p', 'tsconfig.build.json'],
      ['--noEmit', '--pretty', 'false', '-p', 'tsconfig.build.json'],
    ]);
  });

  it("uses the project's tsgo when it has one", async () => {
    const root = project();
    mkdirSync(path.join(root, 'node_modules', '.bin'), { recursive: true });
    writeFileSync(path.join(root, 'node_modules', '.bin', 'tsgo'), `#!/bin/sh\nexec node ${fake} "$@"\n`);
    chmodSync(path.join(root, 'node_modules', '.bin', 'tsgo'), 0o755);
    expect(await checkSurvivors({ root, tsconfig: 'tsconfig.json', concurrency: 1 }, [m('x', 'a', 'BAD')])).toEqual(new Map([['x', 'TS2322: bad in a.ts (line 2)']]));
    expect(calls()).toHaveLength(2);
  });

  it('lays each error at the mutant in the file it names, one batch for mutants in different files', async () => {
    const refused = await checkSurvivors({ root: project(), tsconfig: 'tsconfig.json', command: `node ${fake}`, concurrency: 1 }, [m('a1', 'a', 'BAD'), m('b1', 'b', '1')]);
    expect(refused).toEqual(new Map([['a1', 'TS2322: bad in a.ts (line 2)']]));
    // The base check, then one check of the batch: nothing crossed files.
    expect(calls().map((c) => c.src)).toEqual([src('0', '0', '0'), src('BAD', '1', '0')]);
  });

  it('restores each file after its batch, so a later batch sees only its own mutant', async () => {
    // Two batches on one sandbox: [a1, b1], then [a2]. Were b1 left in place, a2 would read its error.
    const refused = await checkSurvivors({ root: project(), tsconfig: 'tsconfig.json', command: `node ${fake}`, concurrency: 1 }, [m('a1', 'a', '1'), m('b1', 'b', 'BAD'), m('a2', 'a', '2')]);
    expect(refused).toEqual(new Map([['b1', 'TS2322: bad in b.ts (line 2)']]));
    expect(calls().at(-1)?.src).toBe(src('2', '0', '0'));
  });

  it('re-checks a batch one mutant at a time when an error lands in a file none of them touched', async () => {
    const refused = await checkSurvivors({ root: project(), tsconfig: 'tsconfig.json', command: `node ${fake}`, concurrency: 1 }, [m('a1', 'a', 'BAD'), m('b1', 'b', 'CROSS')]);
    // b1 broke src/c.ts: alone, it is the only candidate, so the error is its own.
    expect(refused).toEqual(
      new Map([
        ['a1', 'TS2322: bad in a.ts (line 2)'],
        ['b1', 'TS2345: crossed from b.ts (line 1)'],
      ]),
    );
    expect(calls()).toHaveLength(4);
  });

  it('the exit code is the verdict: a run that passes refuses nothing, whatever it printed', async () => {
    vi.stubEnv('FAKE_TSC_EXIT_0', '1');
    expect(await checkSurvivors({ root: project(), tsconfig: 'tsconfig.json', command: `node ${fake}`, concurrency: 1 }, [m('a1', 'a', 'BAD'), m('b1', 'b', 'CROSS')])).toEqual(new Map());
    expect(calls()).toHaveLength(2);
  });

  it('opens one sandbox per worker, never more than the survivors, at least one', async () => {
    const sandboxes = async (concurrency: number, survivors: CheckMutant[]): Promise<number> => {
      rmSync(log, { force: true });
      await checkSurvivors({ root: project(), tsconfig: 'tsconfig.json', command: `node ${fake}`, concurrency }, survivors);
      return calls()[0]?.sandboxes ?? -1;
    };
    expect(await sandboxes(4, [m('a1', 'a', '1'), m('a2', 'a', '2')])).toBe(2);
    expect(await sandboxes(1, [m('a1', 'a', '1'), m('a2', 'a', '2'), m('a3', 'a', '3')])).toBe(1);
    expect(await sandboxes(0, [m('a1', 'a', '1')])).toBe(1);
  });

  it('works through every batch across its workers, and removes the sandboxes', async () => {
    const root = project();
    const survivors = ['1', '2', 'BAD', '4', '5'].map((r, i) => m(`a${String(i)}`, 'a', r));
    expect(await checkSurvivors({ root, tsconfig: 'tsconfig.json', command: `node ${fake}`, concurrency: 2 }, survivors)).toEqual(new Map([['a2', 'TS2322: bad in a.ts (line 2)']]));
    expect(calls()).toHaveLength(6);
    expect(leftover(root)).toEqual([]);
  });

  it('stops with the command, the output and the fix when the unmutated project fails, and still cleans up', async () => {
    vi.stubEnv('FAKE_TSC_FAIL', '1');
    const root = project();
    const error = await checkSurvivors({ root, tsconfig: 'tsconfig.json', command: `node ${fake}`, concurrency: 2 }, [m('a1', 'a', '1'), m('b1', 'b', '1')]).catch((e: unknown) => e as Error);
    const output = `OUTERR${'e'.repeat(2000)}END`.slice(-1500);
    expect((error as Error).message).toBe(`the project does not type-check with no mutant applied (\`node ${fake} --noEmit --pretty false -p tsconfig.json\`): ${output}. fix: make the type check pass first, or drop checkers`);
    expect(leftover(root)).toEqual([]);
  });
});
