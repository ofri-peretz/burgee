/**
 * SC4 (.sdlc/intents/oxmutate/intent.md): the two machine-readable reports of a real run validate
 * against the schemas their readers use. `mutation.json` is checked against Stryker's
 * `mutation-testing-report-schema`, which dashboards and `mutation-testing-elements` read.
 * `mutation.sarif` is checked against SARIF 2.1.0, which code scanning reads. Both schemas are
 * vendored in test/schemas/, and the README there gives each file's source, version and fetch date.
 *
 * The validator is the `ajv` 8 that the root devDependency `@stryker-mutator/core` depends on
 * (Stryker validates its own options with it), resolved from Stryker's own install. No new
 * dependency.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.join(here, '..');
const schemas = path.join(pkg, 'test/schemas');
// The fixture the end-to-end tests run: it has killed and surviving mutants, so the SARIF has results.
const fixture = path.join(pkg, 'test/fixtures/registry');
const bin = path.join(pkg, 'dist/bin.js');
const native = existsSync(path.join(pkg, 'binding')) && readdirSync(path.join(pkg, 'binding')).some((f) => f.endsWith('.node'));
const ready = native && existsSync(bin);
if (!ready && process.env['OXMUTATE_REQUIRE_NATIVE'] === '1') throw new Error('OXMUTATE_REQUIRE_NATIVE is set and the native core or dist/bin.js is missing. fix: npm run build:native -w oxmutate && npm run build -w oxmutate');

interface Validate {
  (data: unknown): boolean;
  errors?: { instancePath: string; message?: string }[] | null;
}
interface Ajv {
  compile(schema: object): Validate;
  addFormat(name: string, format: (value: string) => boolean): Ajv;
}

const strykerCore = createRequire(import.meta.url).resolve('@stryker-mutator/core');
const AjvClass = (createRequire(strykerCore)('ajv') as { default: new (options: object) => Ajv }).default;
const RFC3339 = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/i;
// Strict, every error, and every format the two schemas name checked rather than ignored.
const ajv = new AjvClass({ strict: true, allErrors: true })
  .addFormat('uri', (v) => URL.canParse(v))
  .addFormat('uri-reference', (v) => URL.canParse(v, 'file:///'))
  .addFormat('date-time', (v) => RFC3339.test(v) && !Number.isNaN(Date.parse(v)));
const schema = (file: string): object => JSON.parse(readFileSync(path.join(schemas, file), 'utf8')) as object;
const validateReport = ajv.compile(schema('mutation-testing-report-schema.json'));
const validateSarif = ajv.compile(schema('sarif-2.1.0.json'));

/** Every schema error, as `path message`: an empty list is a valid document. */
const problems = (validate: Validate, data: unknown): string[] => (validate(data) ? [] : (validate.errors ?? []).map((e) => `${e.instancePath} ${e.message ?? ''}`));

type Report = { files: Record<string, { mutants: Record<string, unknown>[] }> };
type Sarif = { runs: { tool: { driver: Record<string, unknown> }; results: unknown[] }[] };

const out = mkdtempSync(path.join(tmpdir(), 'oxmutate-sc4-'));
afterAll(() => rmSync(out, { recursive: true, force: true }));

describe.skipIf(!ready)('the reports validate against their schemas (SC4)', () => {
  let report: Report;
  let sarif: Sarif;
  beforeAll(() => {
    const r = spawnSync(process.execPath, [bin, 'run', '--config', 'oxmutate.config.json', '--report-dir', out, '--reporter', 'json,sarif'], { cwd: fixture, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`oxmutate run exited ${String(r.status)}: ${r.stdout}${r.stderr}`);
    report = JSON.parse(readFileSync(path.join(out, 'mutation.json'), 'utf8')) as Report;
    sarif = JSON.parse(readFileSync(path.join(out, 'mutation.sarif'), 'utf8')) as Sarif;
  }, 60_000);

  it("mutation.json validates against Stryker's mutation-testing-report-schema 3.8.4", () => {
    const statuses = new Set(Object.values(report.files).flatMap((f) => f.mutants.map((m) => m['status'])));
    expect([...statuses].sort()).toEqual(['Killed', 'Survived']);
    expect(problems(validateReport, report)).toEqual([]);
  });

  it('mutation.sarif validates against the SARIF 2.1.0 schema', () => {
    expect(sarif.runs[0]?.results.length).toBeGreaterThan(0);
    expect(problems(validateSarif, sarif)).toEqual([]);
  });

  // The two cases above pass only if the validators can fail: drop one required field from each.
  it('rejects a report with a required field removed', () => {
    const broken = structuredClone(report);
    const first = Object.values(broken.files)[0]?.mutants[0];
    delete first?.['status'];
    expect(problems(validateReport, broken).join('\n')).toMatch(/must have required property 'status'/);
  });

  it('rejects a SARIF log with a required field removed', () => {
    const broken = structuredClone(sarif);
    delete broken.runs[0]?.tool.driver['name'];
    expect(problems(validateSarif, broken).join('\n')).toMatch(/must have required property 'name'/);
  });
});
