/**
 * SC5, sensitivity (.sdlc/intents/oxmutate/intent.md; `npm run test:sensitivity`). A mutation
 * score is only worth reading if it moves with the strength of the tests. Two fixtures hold the
 * same module: `sensitivity-weak` runs every line but asserts neither the grade below 90 nor the
 * boundary, and `sensitivity-closed` asserts both. oxmutate must report survivors on the first and
 * none on the second.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.join(here, '..');
const weak = path.join(pkg, 'test/fixtures/sensitivity-weak');
const closed = path.join(pkg, 'test/fixtures/sensitivity-closed');
const bin = path.join(pkg, 'dist/bin.js');
const native = existsSync(path.join(pkg, 'binding')) && readdirSync(path.join(pkg, 'binding')).some((f) => f.endsWith('.node'));
const ready = native && existsSync(bin);
// Skipped in a plain local `vitest run` without the native core, as e2e.test.ts is. Never skipped
// where a skip would read as a pass: in CI (OXMUTATE_REQUIRE_NATIVE) or under `npm run test:sensitivity`.
const required = process.env['OXMUTATE_REQUIRE_NATIVE'] === '1' || process.env['npm_lifecycle_event'] === 'test:sensitivity';
if (!ready && required) throw new Error('the sensitivity check needs the native core and dist/bin.js, and one is missing. fix: npm run build:native -w oxmutate && npm run build -w oxmutate');

interface Mutant {
  mutatorName: string;
  status: string;
  coveredBy?: string[];
  static?: boolean;
  location: { start: { line: number; column: number } };
}

const out = mkdtempSync(path.join(tmpdir(), 'oxmutate-sc5-'));
afterAll(() => rmSync(out, { recursive: true, force: true }));

const run = (dir: string): { status: number | null; out: string; mutants: Mutant[] } => {
  const reports = path.join(out, path.basename(dir));
  const r = spawnSync(process.execPath, [bin, 'run', '--config', 'oxmutate.config.json', '--report-dir', reports, '--reporter', 'json'], { cwd: dir, encoding: 'utf8' });
  const report = JSON.parse(readFileSync(path.join(reports, 'mutation.json'), 'utf8')) as { files: Record<string, { mutants: Mutant[] }> };
  return { status: r.status, out: `${r.stdout}${r.stderr}`, mutants: report.files['src/grade.ts']?.mutants ?? [] };
};

const at = (m: Mutant): string => `${String(m.location.start.line)}:${String(m.location.start.column)} ${m.mutatorName}`;

it('the two fixtures differ only in their test suites', () => {
  for (const file of ['src/grade.ts', 'oxmutate.config.json', 'vitest.config.mjs']) {
    expect(readFileSync(path.join(closed, file), 'utf8'), file).toBe(readFileSync(path.join(weak, file), 'utf8'));
  }
  expect(readFileSync(path.join(closed, 'src/grade.spec.ts'), 'utf8')).not.toBe(readFileSync(path.join(weak, 'src/grade.spec.ts'), 'utf8'));
});

describe.skipIf(!ready)('sensitivity (SC5)', () => {
  it('a weak suite produces survivors, every one of them covered by a test that ran', () => {
    const r = run(weak);
    const survivors = r.mutants.filter((m) => m.status === 'Survived');
    expect(survivors.length).toBeGreaterThan(0);
    // Weak, not missing: each survivor ran under a test, which passed anyway. A static survivor (the
    // NumericLiteral 90 -> 91 on A_FROM, the untested boundary) is covered by the file that loads it.
    expect(survivors.filter((m) => !m.static && !m.coveredBy?.length).map(at)).toEqual([]);
    expect(r.mutants.filter((m) => m.status === 'NoCoverage').map(at)).toEqual([]);
  });

  it('the closed suite produces none, over the same mutants', () => {
    const before = run(weak);
    const r = run(closed);
    expect(r.status).toBe(0);
    // The same module yields the same mutants: a run that generated none would pass vacuously.
    expect(r.mutants.length).toBeGreaterThan(0);
    expect(r.mutants.map(at)).toEqual(before.mutants.map(at));
    expect(r.mutants.filter((m) => m.status !== 'Killed' && m.status !== 'Timeout').map((m) => `${at(m)}:${m.status}`)).toEqual([]);
  });
});
