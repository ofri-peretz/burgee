/**
 * R3: the grader. Runs one tool over the pinned corpus and writes one jsonl row per document:
 * read, generate, type-check under TypeScript 5.9 / 6.0 / 7.0, round trip, wall-clock ms, error.
 *
 *   npx tsx benchmarks/apicontract/corpus.ts --tool ours:types --sample 100 --seed 1
 *   npx tsx benchmarks/apicontract/corpus.ts --tool openapi-typescript --sample 100 --seed 1
 *   npx tsx benchmarks/apicontract/corpus.ts --tool hey-api --sample 100 --seed 1
 *
 * Flags: `--family` (default: the tool's), `--source a,b`, `--out <dir>` (default
 * `benchmarks/apicontract/results/<date>-<sha>/`), `--timeout <ms>` per document, `--no-typecheck`,
 * `--json` (print the folded summary line instead of a sentence).
 *
 * Every tool is timed the same way: the wall-clock of one process that reads the document and
 * writes the output, start to exit, one document at a time, so the timing includes each tool's
 * start-up. Type-checking runs once per compiler over every output, and each error is attributed
 * to the document whose folder it is in.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { spawnSync } from '../spawn.js';

import { errorLine, expandPins, filesWithErrors, firstLine, foldTool, parseFlags, type Pin, type Row, TYPESCRIPTS, type TsKey } from './corpus-lib.js';
import { fetchAll, select } from './fetch.js';
import { bin, install } from './install.js';
import { readPins } from './net.js';

const REPO = path.resolve(import.meta.dirname, '../..');
const APICONTRACT_DIST = path.join(REPO, 'packages', 'apicontract', 'dist');
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_BUFFER = 64 * 1024 * 1024;
const ISO_DATE = 10;
/** tsc on hundreds of generated files; above Node's default old-space limit for the bigger specs. */
const TSC_HEAP_MB = 8192;

/** An incumbent: the packages it needs at pinned versions, and how its CLI is called on one document. */
interface Incumbent {
  readonly family: string;
  readonly packages: readonly string[];
  readonly command: (dir: string, input: string, out: string) => { file: string; args: string[] };
}

/** The incumbents for the `types` target (intent: openapi-typescript and @hey-api/openapi-ts). */
export const INCUMBENTS: Readonly<Record<string, Incumbent>> = {
  'openapi-typescript': {
    family: 'openapi',
    // TypeScript is its peer; 5.9 is what a user on the last 5.x installs beside it.
    packages: ['openapi-typescript@7.13.0', 'typescript@5.9.3'],
    command: (dir, input, out) => ({ file: bin(dir, 'openapi-typescript'), args: [input, '-o', path.join(out, 'types.ts')] }),
  },
  'hey-api': {
    family: 'openapi',
    packages: ['@hey-api/openapi-ts@0.99.0', 'typescript@5.9.3'],
    // Its types plugin alone: the same target as ours, no client. Not `--silent`: it exits 0 on a
    // missing input and says why only on its output.
    command: (dir, input, out) => ({ file: bin(dir, 'openapi-ts'), args: ['-i', input, '-o', out, '-p', '@hey-api/typescript', '--no-log-file'] }),
  },
};

/**
 * Our side: a child process that loads the built CLI's host the way `apicontract gen` does, reads
 * the document (the `read` column), then runs the target and writes its files.
 */
const RUNNER = `
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const [dist, input, target, out] = process.argv.slice(2);
const load = (name) => import(pathToFileURL(join(dist, name)).href);
const { loadPlugins } = await load('run-load.js');
const { readDocument } = await load('run-input.js');
const report = (row) => { process.stdout.write(JSON.stringify(row)); process.exit(0); };
const message = (error) => String(error?.message ?? error).split('\\n').find((l) => l.trim()) ?? '';
const host = await loadPlugins({ root: out, file: 'corpus', plugins: [] });
let document;
try { document = readDocument(input, 'corpus'); host.read(document); }
catch (error) { report({ read: false, generate: false, error: message(error) }); }
try {
  const { files } = await host.run(target, document, {});
  for (const file of files) { const to = join(out, file.path); mkdirSync(dirname(to), { recursive: true }); writeFileSync(to, file.content); }
  report({ read: true, generate: files.length > 0, error: files.length > 0 ? null : 'no files' });
} catch (error) { report({ read: true, generate: false, error: message(error) }); }
`;

const tsFiles = (dir: string): string[] =>
  existsSync(dir) ? readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((f) => /\.(ts|mts|cts)$/.test(f) && !f.endsWith('.d.ts.map')).map((f) => path.join(dir, f)) : [];

interface Generated {
  readonly read: boolean | null;
  readonly generate: boolean;
  readonly ms: number;
  readonly error: string | null;
  readonly out: string;
}

interface Job {
  readonly tool: string;
  readonly input: string;
  readonly out: string;
  readonly timeout: number;
  /** The incumbent's install folder; absent for ours. */
  readonly toolDir: string | undefined;
}

/** What our runner printed, or why it printed nothing usable. */
function oursResult(stdout: string, stderr: string, status: number | null): Omit<Generated, 'ms' | 'out'> {
  try {
    const row = JSON.parse(stdout) as { read: boolean; generate: boolean; error: string | null };
    return { ...row, error: row.error === null ? null : firstLine(row.error) };
  } catch {
    return { read: null, generate: false, error: errorLine(stderr || stdout) || `exit ${String(status)}` };
  }
}

function generateOne({ tool, input, out, timeout, toolDir }: Job): Generated {
  mkdirSync(out, { recursive: true });
  const ours = tool.startsWith('ours:');
  const { file, args } = ours
    ? { file: process.execPath, args: [path.join(path.dirname(out), '..', 'runner.mjs'), APICONTRACT_DIST, input, tool.slice('ours:'.length), out] }
    : (INCUMBENTS[tool] as Incumbent).command(toolDir as string, input, out);
  const start = performance.now();
  const result = spawnSync(file, args, { cwd: out, encoding: 'utf8', timeout, maxBuffer: MAX_BUFFER, env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' } });
  const ms = Math.round(performance.now() - start);
  if (result.error !== undefined || result.signal !== null) {
    const error = result.signal === 'SIGTERM' ? `timed out after ${timeout} ms` : firstLine(String(result.error ?? result.signal));
    return { read: null, generate: false, ms, error, out };
  }
  if (ours) return { ...oursResult(result.stdout, result.stderr, result.status), ms, out };
  const ok = result.status === 0 && tsFiles(out).length > 0;
  return { read: null, generate: ok, ms, error: ok ? null : errorLine(`${result.stderr}\n${result.stdout}`) || `exit ${String(result.status)}, no output`, out };
}

/** One `tsc` per compiler over every output; returns, per compiler, the document folders with an error (or `null` when tsc crashed). */
function typecheck(work: string, outs: readonly string[]): Map<TsKey, Set<string> | null> {
  const files = outs.flatMap((o) => tsFiles(o)).map((f) => path.relative(work, f));
  const config = path.join(work, 'tsconfig.json');
  writeFileSync(
    config,
    JSON.stringify({
      compilerOptions: { strict: true, noEmit: true, skipLibCheck: true, target: 'es2022', module: 'esnext', moduleResolution: 'bundler', lib: ['es2023', 'dom'], types: [] },
      files,
    }),
  );
  const result = new Map<TsKey, Set<string> | null>();
  for (const [key, version] of Object.entries(TYPESCRIPTS) as [TsKey, string][]) {
    if (files.length === 0) {
      result.set(key, new Set());
      continue;
    }
    const tsc = bin(install([`typescript@${version}`]), 'tsc');
    const ran = spawnSync(tsc, ['-p', config, '--pretty', 'false'], {
      cwd: work,
      encoding: 'utf8',
      maxBuffer: MAX_BUFFER,
      env: { ...process.env, NODE_OPTIONS: `--max-old-space-size=${TSC_HEAP_MB}` },
    });
    const output = `${ran.stdout}\n${ran.stderr}`;
    const failing = filesWithErrors(output, work);
    // A non-zero exit with no attributable error is a compiler crash, not a verdict on any document.
    if (ran.status !== 0 && failing.size === 0) {
      process.stderr.write(`tsc ${version} exited ${ran.status} without a diagnostic: ${firstLine(output)}\n`);
      result.set(key, null);
      continue;
    }
    result.set(key, new Set([...failing].map((f) => f.split('/')[0] as string)));
  }
  return result;
}

function gitSha(): string {
  const ran = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO, encoding: 'utf8' });
  return ran.stdout.trim() || 'unknown';
}

export const resultsDir = (date = new Date()): string => path.join(import.meta.dirname, 'results', `${date.toISOString().slice(0, ISO_DATE)}-${gitSha()}`);
export const fileFor = (tool: string): string => `${tool.replaceAll(/[^\w.-]+/g, '-')}.jsonl`;

export interface GradeOptions {
  readonly tool: string;
  readonly sample?: number | undefined;
  readonly seed?: number | undefined;
  readonly family?: string | undefined;
  readonly source?: string | undefined;
  readonly out?: string | undefined;
  readonly timeout?: number | undefined;
  readonly typecheck?: boolean | undefined;
}

export async function grade(options: GradeOptions): Promise<{ file: string; rows: Row[] }> {
  const { tool } = options;
  const ours = tool.startsWith('ours:');
  const incumbent = INCUMBENTS[tool];
  if (!ours && incumbent === undefined) throw new Error(`no tool is named "${tool}". fix: pass ours:<target> or one of ${Object.keys(INCUMBENTS).join(', ')}`);
  if (ours && !existsSync(path.join(APICONTRACT_DIST, 'run-load.js'))) throw new Error('apicontract is not built. fix: npx turbo run build --filter=apicontract');
  const family = options.family ?? incumbent?.family ?? 'openapi';
  const pins = select(expandPins(readPins()), { family, source: options.source, sample: options.sample, seed: options.seed });
  const fetched = await fetchAll(pins);
  const toolDir = incumbent === undefined ? undefined : install(incumbent.packages);

  const work = mkdtempSync(path.join(tmpdir(), 'apicontract-corpus-run-'));
  writeFileSync(path.join(work, 'runner.mjs'), RUNNER);
  const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
  const generated = fetched.map(({ pin, file }, index) => {
    const one = generateOne({ tool, input: file, out: path.join(work, 'out', String(index)), timeout, toolDir });
    process.stderr.write(`${tool} ${index + 1}/${fetched.length} ${one.generate ? 'ok ' : 'ERR'} ${one.ms}ms ${pin.id}\n`);
    return one;
  });

  const keys = Object.keys(TYPESCRIPTS) as TsKey[];
  const checked = options.typecheck === false ? undefined : typecheck(path.join(work, 'out'), generated.filter((g) => g.generate).map((g) => g.out));
  const rows: Row[] = fetched.map(({ pin }, index) => {
    const g = generated[index] as Generated;
    const folder = String(index);
    const typecheckRow = Object.fromEntries(
      keys.map((k) => {
        const failing = checked?.get(k);
        return [k, !g.generate || failing === undefined || failing === null ? null : !failing.has(folder)];
      }),
    ) as Record<TsKey, boolean | null>;
    return { id: pin.id, tool, read: g.read, generate: g.generate, typecheck: typecheckRow, roundtrip: null, ms: g.ms, error: g.error };
  });

  const outDir = options.out ?? resultsDir();
  mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, fileFor(tool));
  writeFileSync(file, `${rows.map((r) => JSON.stringify(r)).join('\n')}
`);
  writeFileSync(
    file.replace(/\.jsonl$/, '.meta.json'),
    `${JSON.stringify({ tool, packages: incumbent?.packages ?? ['file:packages/apicontract'], family, source: options.source ?? null, sample: options.sample ?? null, seed: options.seed ?? 1, typescripts: TYPESCRIPTS, node: process.version, date: new Date().toISOString() }, undefined, 2)}\n`,
  );
  rmSync(work, { recursive: true, force: true });
  return { file, rows };
}

if (process.argv[1] === import.meta.filename) {
  const { flags } = parseFlags(process.argv.slice(2));
  const str = (name: string): string | undefined => (typeof flags.get(name) === 'string' ? (flags.get(name) as string) : undefined);
  const num = (name: string): number | undefined => (str(name) === undefined ? undefined : Number(str(name)));
  const tool = str('tool');
  if (tool === undefined) throw new Error('usage: corpus.ts --tool <ours:types|openapi-typescript|hey-api> [--sample N] [--seed S] [--family F] [--source a,b] [--out dir]');
  const { file, rows } = await grade({ tool, sample: num('sample'), seed: num('seed'), family: str('family'), source: str('source'), out: str('out'), timeout: num('timeout'), typecheck: !flags.has('no-typecheck') });
  const folded = foldTool(tool, rows);
  process.stdout.write(flags.has('json') ? `${JSON.stringify({ file, ...folded })}\n` : `${file}: ${folded.generate.passed}/${folded.documents} generated, ${folded.usable.passed} usable under every TypeScript, median ${folded.medianMs ?? '—'} ms\n`);
}
