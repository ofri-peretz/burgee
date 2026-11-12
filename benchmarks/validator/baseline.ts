/**
 * Baselines for the validator intent's metrics (`.sdlc/intents/validator/intent.md` V3, V4, V5,
 * V7), measured on the incumbents alone: Zod is the bar, the others are read beside it. One order
 * schema is written once per library; each reading runs the same payloads through every library on
 * this machine, in one go.
 *
 *   npx tsx benchmarks/validator/baseline.ts [workdir] > reading.json
 *
 * - V3 throughput: validations per second on a valid and an invalid payload, median of 5.
 * - V4 construction: milliseconds to build the schema 500 times, median of 5.
 * - V5 bundle: min+gzip bytes of the schema and its check, bundled by this repo's esbuild.
 * - V7 type-check: `tsc --extendedDiagnostics` on 500 copies of the schema with an inferred type each,
 *   under every TypeScript in `TYPESCRIPTS`, each installed on its own beside the fixtures.
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { loadavg, tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

import { spawnSync } from '../spawn.js';

const COPIES = 500;
/** Every TypeScript the validator has to hold V7 on: the last 5.x, 6, and the native 7. */
const TYPESCRIPTS = ['5.9.3', '6.0.3', '7.0.2'] as const;
const ERROR_CHARS = 2000;
const ISO_DATE_CHARS = 10;
const EMAIL = String.raw`/^[^@\s]+@[^@\s]+\.[a-z]+$/`;
const ZIP = String.raw`/^\d{5}$/`;

interface Library {
  pkg: string;
  imports: string;
  /** Source declaring `S<i>` (and its parts, suffixed the same way). */
  schema: (i: string) => string;
  /** Source of a `(d) => boolean` over the schema named `s`. */
  check: (s: string) => string;
  /** Source of the inferred type of `S<i>`; absent when the library infers none. */
  infer?: (i: string) => string;
}

const LIBRARIES: Record<string, Library> = {
  zod: {
    pkg: 'zod@4.6.7',
    imports: `import * as z from 'zod';`,
    schema: (i) => `
const Item${i} = z.object({ sku: z.string().min(1).max(32), qty: z.number().int().min(1), price: z.number().min(0) });
const Card${i} = z.object({ kind: z.literal('card'), last4: z.string().length(4) });
const Bank${i} = z.object({ kind: z.literal('bank'), iban: z.string().min(15).max(34) });
const S${i} = z.object({
  id: z.string().min(1), email: z.string().regex(${EMAIL}), age: z.number().int().min(0).max(150).optional(),
  role: z.enum(['admin', 'user', 'guest']), active: z.boolean(), tags: z.array(z.string()).max(10),
  address: z.object({ street: z.string(), city: z.string(), zip: z.string().regex(${ZIP}) }),
  items: z.array(Item${i}).min(1), payment: z.discriminatedUnion('kind', [Card${i}, Bank${i}]),
});`,
    check: (s) => `(d) => ${s}.safeParse(d).success`,
    infer: (i) => `z.infer<typeof S${i}>`,
  },
  valibot: {
    pkg: 'valibot@1.5.0',
    imports: `import * as v from 'valibot';`,
    schema: (i) => `
const Item${i} = v.object({ sku: v.pipe(v.string(), v.minLength(1), v.maxLength(32)), qty: v.pipe(v.number(), v.integer(), v.minValue(1)), price: v.pipe(v.number(), v.minValue(0)) });
const Card${i} = v.object({ kind: v.literal('card'), last4: v.pipe(v.string(), v.length(4)) });
const Bank${i} = v.object({ kind: v.literal('bank'), iban: v.pipe(v.string(), v.minLength(15), v.maxLength(34)) });
const S${i} = v.object({
  id: v.pipe(v.string(), v.minLength(1)), email: v.pipe(v.string(), v.regex(${EMAIL})), age: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(150))),
  role: v.picklist(['admin', 'user', 'guest']), active: v.boolean(), tags: v.pipe(v.array(v.string()), v.maxLength(10)),
  address: v.object({ street: v.string(), city: v.string(), zip: v.pipe(v.string(), v.regex(${ZIP})) }),
  items: v.pipe(v.array(Item${i}), v.minLength(1)), payment: v.variant('kind', [Card${i}, Bank${i}]),
});`,
    check: (s) => `(d) => v.safeParse(${s}, d).success`,
    infer: (i) => `v.InferOutput<typeof S${i}>`,
  },
  arktype: {
    pkg: 'arktype@2.2.9',
    imports: `import { type } from 'arktype';`,
    schema: (i) => `
const Item${i} = type({ sku: '1 <= string <= 32', qty: 'number.integer >= 1', price: 'number >= 0' });
const S${i} = type({
  id: 'string >= 1', email: ${EMAIL}, 'age?': '0 <= number.integer <= 150',
  role: "'admin' | 'user' | 'guest'", active: 'boolean', tags: 'string[] <= 10',
  address: { street: 'string', city: 'string', zip: ${ZIP} },
  items: Item${i}.array().atLeastLength(1),
  payment: type({ kind: "'card'", last4: 'string == 4' }).or({ kind: "'bank'", iban: '15 <= string <= 34' }),
});`,
    check: (s) => `(d) => !(${s}(d) instanceof type.errors)`,
    infer: (i) => `typeof S${i}.infer`,
  },
  typebox: {
    pkg: '@sinclair/typebox@0.34.52',
    imports: `import { Type } from '@sinclair/typebox';\nimport { TypeCompiler } from '@sinclair/typebox/compiler';`,
    schema: (i) => `
const Item${i} = Type.Object({ sku: Type.String({ minLength: 1, maxLength: 32 }), qty: Type.Integer({ minimum: 1 }), price: Type.Number({ minimum: 0 }) });
const Card${i} = Type.Object({ kind: Type.Literal('card'), last4: Type.String({ minLength: 4, maxLength: 4 }) });
const Bank${i} = Type.Object({ kind: Type.Literal('bank'), iban: Type.String({ minLength: 15, maxLength: 34 }) });
const S${i} = Type.Object({
  id: Type.String({ minLength: 1 }), email: Type.String({ pattern: ${EMAIL}.source }), age: Type.Optional(Type.Integer({ minimum: 0, maximum: 150 })),
  role: Type.Union([Type.Literal('admin'), Type.Literal('user'), Type.Literal('guest')]), active: Type.Boolean(), tags: Type.Array(Type.String(), { maxItems: 10 }),
  address: Type.Object({ street: Type.String(), city: Type.String(), zip: Type.String({ pattern: ${ZIP}.source }) }),
  items: Type.Array(Item${i}, { minItems: 1 }), payment: Type.Union([Card${i}, Bank${i}]),
});`,
    // Compiled ahead of the first check with `new Function`, which a strict CSP forbids.
    check: (s) => `((c) => (d) => c.Check(d))(TypeCompiler.Compile(${s}))`,
    infer: (i) => `import('@sinclair/typebox').Static<typeof S${i}>`,
  },
  ajv: {
    pkg: 'ajv@8.20.0',
    imports: `import AjvModule from 'ajv';\nconst ajv = new (AjvModule.default ?? AjvModule)();`,
    schema: (i) => `
const str = (o) => ({ type: 'string', ...o });
const obj = (properties, optional = []) => ({ type: 'object', properties, required: Object.keys(properties).filter((k) => !optional.includes(k)) });
const Item${i} = obj({ sku: str({ minLength: 1, maxLength: 32 }), qty: { type: 'integer', minimum: 1 }, price: { type: 'number', minimum: 0 } });
const S${i} = obj({
  id: str({ minLength: 1 }), email: str({ pattern: ${EMAIL}.source }), age: { type: 'integer', minimum: 0, maximum: 150 },
  role: { enum: ['admin', 'user', 'guest'] }, active: { type: 'boolean' }, tags: { type: 'array', items: str({}), maxItems: 10 },
  address: obj({ street: str({}), city: str({}), zip: str({ pattern: ${ZIP}.source }) }),
  items: { type: 'array', items: Item${i}, minItems: 1 },
  payment: { oneOf: [obj({ kind: { const: 'card' }, last4: str({ minLength: 4, maxLength: 4 }) }), obj({ kind: { const: 'bank' }, iban: str({ minLength: 15, maxLength: 34 }) })] },
}, ['age']);`,
    // Compiled with `new Function` too. No inferred type, so V7 does not apply.
    check: (s) => `ajv.compile(${s})`,
  },
};

const RUNNER = `
import { performance } from 'node:perf_hooks';
const { build } = await import(process.argv[2]);
const valid = { id: 'u_1', email: 'ada@example.com', age: 36, role: 'admin', active: true, tags: ['a', 'b'],
  address: { street: '1 Quay Rd', city: 'Haifa', zip: '31000' },
  items: [{ sku: 'A-1', qty: 2, price: 9.5 }, { sku: 'B-2', qty: 1, price: 120 }], payment: { kind: 'card', last4: '4242' } };
const invalid = structuredClone(valid); invalid.payment.last4 = '424';
const median = (a) => a.sort((x, y) => x - y)[a.length >> 1];
const check = build();
if (check(valid) !== true || check(invalid) !== false) throw new Error('the fixture does not accept the valid payload and reject the invalid one');
const construct = [];
for (let r = 0; r < 5; r++) { const t = performance.now(); for (let i = 0; i < ${String(COPIES)}; i++) build(); construct.push(performance.now() - t); }
const ops = (d) => { const out = []; for (let r = 0; r < 6; r++) { let n = 0; const t = performance.now(); while (performance.now() - t < 300) { for (let i = 0; i < 500; i++) check(d); n += 500; } if (r > 0) out.push(n / ((performance.now() - t) / 1000)); } return Math.round(median(out)); };
console.log(JSON.stringify({ constructMs: Math.round(median(construct) * 10) / 10, validPerSec: ops(valid), invalidPerSec: ops(invalid) }));
`;

function mustRun(file: string, args: readonly string[], cwd: string): string {
  const result = spawnSync(file, args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${file} ${args.join(' ')} failed: ${(result.stderr || result.stdout).trim().slice(0, ERROR_CHARS)}`);
  return result.stdout;
}

/** `tsc --extendedDiagnostics` prints `Name:   value`; this reads one of those values. */
function diagnostic(output: string, name: string): number {
  const line = output.split('\n').find((l) => l.startsWith(`${name}:`));
  const value = Number.parseFloat(line?.slice(name.length + 1) ?? '');
  if (Number.isNaN(value)) throw new Error(`tsc printed no "${name}"`);
  return value;
}

const require = createRequire(import.meta.url);
const bin = (name: string): string => path.join(path.dirname(require.resolve('typescript/package.json')), '..', '.bin', name);

const dir = process.argv[2] ?? mkdtempSync(path.join(tmpdir(), 'validator-baseline-'));
mkdirSync(dir, { recursive: true });
writeFileSync(path.join(dir, 'package.json'), '{"private":true,"type":"module"}');
mustRun('npm', ['i', '--silent', '--no-audit', '--no-fund', ...Object.values(LIBRARIES).map((l) => l.pkg)], dir);
writeFileSync(path.join(dir, 'run.mjs'), RUNNER);

const TSC = ['--noEmit', '--strict', '--skipLibCheck', '--target', 'es2022', '--module', 'nodenext', '--moduleResolution', 'nodenext', '--extendedDiagnostics'];
/** One `tsc` per version, each in its own folder so no two share a `node_modules/typescript`. */
const compilers = TYPESCRIPTS.map((version) => {
  const home = path.join(dir, `ts-${version}`);
  mkdirSync(home, { recursive: true });
  writeFileSync(path.join(home, 'package.json'), '{"private":true}');
  mustRun('npm', ['i', '--silent', '--no-audit', '--no-fund', `typescript@${version}`], home);
  return { version, tsc: path.join(home, 'node_modules', '.bin', 'tsc') };
});

const readings: Record<string, unknown> = {};
for (const [name, library] of Object.entries(LIBRARIES)) {
  const fixture = path.join(dir, `fx-${name}.mjs`);
  writeFileSync(fixture, `${library.imports}\nexport function build() {${library.schema('')}\n  return ${library.check('S')};\n}\n`);
  const runtime = JSON.parse(mustRun(process.execPath, ['run.mjs', fixture], dir)) as Record<string, number>;

  const entry = path.join(dir, `entry-${name}.mjs`);
  const bundle = path.join(dir, `bundle-${name}.js`);
  writeFileSync(entry, `import { build } from './fx-${name}.mjs';\nexport const check = build();\n`);
  mustRun(bin('esbuild'), [entry, '--bundle', '--minify', '--format=esm', '--platform=browser', `--outfile=${bundle}`, '--log-level=error'], dir);
  const bundled = readFileSync(bundle);

  let types: Record<string, Record<string, number>> | undefined;
  if (library.infer) {
    const source = path.join(dir, `types-${name}.ts`);
    const copies = Array.from({ length: COPIES }, (_, i) => `${library.schema(String(i))}\nexport type T${String(i)} = ${library.infer?.(String(i)) ?? 'never'};\nexport const zip${String(i)} = (x: T${String(i)}): string => x.address.zip;`);
    writeFileSync(source, `${library.imports}\n${copies.join('\n')}\n`);
    types = Object.fromEntries(compilers.map(({ version, tsc }) => {
      const output = mustRun(tsc, [...TSC, source], dir);
      return [version, { instantiations: diagnostic(output, 'Instantiations'), checkSeconds: diagnostic(output, 'Check time'), totalSeconds: diagnostic(output, 'Total time'), memoryK: diagnostic(output, 'Memory used') }];
    }));
  }
  readings[name] = { package: library.pkg, ...runtime, bundleMinBytes: bundled.length, bundleGzipBytes: gzipSync(bundled).length, types };
}

console.log(JSON.stringify({
  date: new Date().toISOString().slice(0, ISO_DATE_CHARS), node: process.version, typescripts: TYPESCRIPTS,
  loadAverage1m: Math.round(loadavg()[0] ?? 0), schemaCopiesForTypes: COPIES, readings,
}, undefined, 2));
