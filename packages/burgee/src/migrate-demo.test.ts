/**
 * The gate — and it was not written for this feature.
 *
 * `examples/demo-cli-commander` holds the same program written twice: `src/index.ts` builds
 * it on real commander, `src/burgee.ts` builds it on `burgee/commander`. That pair predates
 * `burgee migrate` — it is the conformance suite's fixture — which is what makes it a gate
 * rather than a fixture written to agree with the thing it grades. **If the codemod and the
 * hand-written drop-in disagree, one of them is wrong.**
 *
 * `examples/demo-cli-yargs` is the second case. It has no committed twin, so the gate there
 * is the other half of the same claim: every specifier the codemod produces is a subpath
 * `burgee` publishes, and the rewrite is the only byte that moved.
 *
 * **One divergence, found by building this and recorded rather than papered over.**
 * `src/program.ts` and `src/burgee.ts` each keep a *type-only* import of real commander —
 * `import { type Command } from 'commander'` — on purpose: the demo casts burgee's classes
 * to commander's declared types, and that cast is the drop-in claim stated as a type. The
 * codemod rewrites a type-only import like any other, which is right for a user (burgee's
 * front-end exports the same types) and wrong for this demo, whose whole job is to hold the
 * two type universes side by side. So the byte-for-byte comparison is scoped to the
 * **value** import, which is the one a migration is about; the type-only line is asserted
 * separately, as a difference that exists and is understood.
 */
import { cpSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { migrate } from './migrate.js';

const EXAMPLES = resolve(fileURLToPath(new URL('..', import.meta.url)), '../../examples');

/** A copy of one demo's `src/`, so the gate never writes into the repository it is grading. */
function copyOf(demo: string): string {
  const dir = mkdtempSync(join(tmpdir(), `burgee-${demo}-`));
  cpSync(join(EXAMPLES, demo, 'src'), join(dir, 'src'), { recursive: true });
  cpSync(join(EXAMPLES, demo, 'package.json'), join(dir, 'package.json'));
  return dir;
}

const read = (dir: string, file: string): string => readFileSync(join(dir, file), 'utf8');
const committed = (demo: string, file: string): string => readFileSync(join(EXAMPLES, demo, 'src', file), 'utf8');

/** The one line that imports `specifier`, as written. */
function importLine(source: string, specifier: string): string {
  return source.split('\n').find((line) => line.includes(`from '${specifier}'`)) ?? '';
}

describe('demo-cli-commander — the codemod against the hand-written drop-in', () => {
  const dir = copyOf('demo-cli-commander');
  // `burgee.ts` is the target, not the source: the commander variant is the other three files.
  const report = migrate({ dir, status: () => undefined });

  it('produces the drop-in’s value import, byte for byte', async () => {
    await report;
    const ours = importLine(read(dir, 'src/index.ts'), 'burgee/commander');
    expect(ours).toBe("import { Command, Option } from 'burgee/commander';");
    expect(ours, 'the codemod and the committed drop-in have to agree, or one of them is wrong').toBe(
      importLine(committed('demo-cli-commander', 'burgee.ts'), 'burgee/commander'),
    );
  });

  it('moves exactly the specifier and nothing else in the file', async () => {
    await report;
    const before = committed('demo-cli-commander', 'index.ts');
    const after = read(dir, 'src/index.ts');
    expect(after).toBe(before.replace("from 'commander'", "from 'burgee/commander'"));
  });

  it('leaves no file in the copy still importing commander', async () => {
    await report;
    for (const file of ['src/index.ts', 'src/program.ts', 'src/burgee.ts']) {
      expect(read(dir, file), `${file} still names the incumbent`).not.toMatch(/from '(commander|yargs)'/);
    }
  });

  it('rewrites the type-only import too — the one place it diverges from the committed demo', async () => {
    await report;
    // The demo keeps `import { type Command } from 'commander'` so it can cast burgee's
    // classes to commander's declared types. A user has no such reason, and burgee's
    // front-end exports the same names, so rewriting it is the right answer off this fixture.
    expect(committed('demo-cli-commander', 'program.ts')).toContain("from 'commander'");
    expect(read(dir, 'src/program.ts')).toContain("import { type Command, type Option } from 'burgee/commander';");
  });

  it('reports the real counts, refuses nothing, and exits OK', async () => {
    const r = await report;
    expect(r).toMatchObject({ refused: [], exitCode: 0, changed: true });
    expect(r.detected).toEqual({ declared: ['commander'], imported: ['commander'] });
    // `add` and `control` joined the report with A12 (D-137); `add` is empty because the demo already declares burgee.
    expect(r.dependencies).toEqual({ before: ['commander'], removable: ['commander'], after: 0, add: [] });
    expect(r.graded).toEqual([{ host: 'commander', reference: 1360, passed: 1360, rate: 1, control: 1360 }]);
  });
});

describe('demo-cli-yargs — the second case', () => {
  const dir = copyOf('demo-cli-yargs');
  const report = migrate({ dir, status: () => undefined });

  it('rewrites both files and moves only the specifier', async () => {
    await report;
    expect(read(dir, 'src/bin.ts')).toBe(committed('demo-cli-yargs', 'bin.ts').replace("from 'yargs'", "from 'burgee/yargs'"));
    expect(read(dir, 'src/index.ts')).toBe(committed('demo-cli-yargs', 'index.ts').replace("from 'yargs'", "from 'burgee/yargs'"));
  });

  it('reports the real counts and the oracle’s yargs row', async () => {
    const r = await report;
    expect(r).toMatchObject({ files: 2, imports: 2, refused: [], exitCode: 0 });
    // `add` and `control` joined the report with A12 (D-137); `add` is empty because the demo already declares burgee. yargs' control is 802, two
    // cases real yargs cannot pass from a vendored copy.
    expect(r.graded).toEqual([{ host: 'yargs', reference: 804, passed: 804, rate: 1, control: 802 }]);
    expect(r.dependencies).toEqual({ before: ['yargs'], removable: ['yargs'], after: 0, add: [] });
  });
});
