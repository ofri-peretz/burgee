/**
 * Phase 0 baselines for apicontract's `gen` metrics (`.sdlc/intents/apicontract/metrics.md`
 * G2–G5), measured on the incumbent alone. Installs openapi-typescript into a throwaway directory,
 * then reads install size, dependency count, generation time (median of 5) and whether it runs under
 * TypeScript 5, 6 and 7, and
 * whether a plain `npm i` resolves its `typescript` peer range beside each.
 *
 *   npx tsx benchmarks/apicontract/incumbents.ts [workdir] > reading.json
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { spawnSync } from '../spawn.js';

const INCUMBENT = 'openapi-typescript@7.13.0';
const SPEC_URL =
  'https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json';
const RUNS = 5;

interface Ran {
  ok: boolean;
  stdout: string;
  stderr: string;
}

/** One command through bellpull (`../spawn.ts`), never a throw. */
function run(file: string, args: readonly string[], cwd?: string): Ran {
  const result = spawnSync(file, args, { cwd, encoding: 'utf8' });
  return { ok: result.status === 0, stdout: result.stdout, stderr: result.stderr };
}

function mustRun(file: string, args: readonly string[], cwd?: string): Ran {
  const result = run(file, args, cwd);
  if (!result.ok) throw new Error(`${file} ${args.join(' ')} failed: ${result.stderr.trim()}`);
  return result;
}

function measureBytes(dir: string): number {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    total += entry.isDirectory() ? measureBytes(full) : statSync(full).size;
  }
  return total;
}

/** Installs the incumbent beside one TypeScript major. Returns whether a plain install resolves. */
function install(dir: string, typescript: string): boolean {
  writeFileSync(path.join(dir, 'package.json'), '{"private":true}');
  const args = ['i', '--silent', '--no-audit', '--no-fund', INCUMBENT, `typescript@${typescript}`];
  if (run('npm', args, dir).ok) return true;
  mustRun('npm', [...args, '--legacy-peer-deps'], dir);
  return false;
}

function countPackages(dir: string): number {
  // ELSPROBLEMS (an invalid peer) exits 1 but still prints the tree, so the exit code is not read.
  const tree = JSON.parse(run('npm', ['ls', '--all', '--json', '--omit=dev'], dir).stdout) as {
    dependencies?: Record<string, unknown>;
  };
  const seen = new Set<string>();
  const walk = (deps: Record<string, unknown> | undefined): void => {
    for (const [name, node] of Object.entries(deps ?? {})) {
      const n = node as { version?: string; dependencies?: Record<string, unknown> };
      const key = `${name}@${n.version ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      walk(n.dependencies);
    }
  };
  walk((tree.dependencies?.['openapi-typescript'] as { dependencies?: Record<string, unknown> })?.dependencies);
  return seen.size;
}

function timeGen(dir: string, spec: string): { medianMs: number; ok: boolean; error?: string } {
  const bin = path.join(dir, 'node_modules', '.bin', 'openapi-typescript');
  const samples: number[] = [];
  for (let i = 0; i < RUNS; i += 1) {
    const start = performance.now();
    const result = run(bin, [spec, '-o', path.join(dir, 'out.d.ts')], dir);
    if (!result.ok) {
      return { medianMs: Number.NaN, ok: false, error: result.stderr.split('\n').find((l) => l.trim()) ?? result.stderr };
    }
    samples.push(performance.now() - start);
  }
  samples.sort((x, y) => x - y);
  return { medianMs: Math.round(samples[Math.floor(RUNS / 2)] ?? Number.NaN), ok: true };
}

const root = process.argv[2] ?? mkdtempSync(path.join(tmpdir(), 'apicontract-bench-'));
const spec = path.join(root, 'github.json');
mustRun('curl', ['-sSfL', '-o', spec, SPEC_URL]);
const operations = Object.values(
  (JSON.parse(readFileSync(spec, 'utf8')) as { paths: Record<string, object> }).paths,
).reduce((n, item) => n + Object.keys(item).filter((k) => k !== 'parameters').length, 0);

const results: Record<string, unknown> = {};
for (const ts of ['5', '6', '7']) {
  const dir = path.join(root, `ts${ts}`);
  mkdirSync(dir, { recursive: true });
  const peerResolves = install(dir, ts);
  results[`ts${ts}`] = {
    peerResolves,
    installBytes: measureBytes(path.join(dir, 'node_modules')),
    packagesOutsideTypescript: countPackages(dir),
    gen: timeGen(dir, spec),
  };
}

process.stdout.write(
  `${JSON.stringify(
    {
      date: new Date().toISOString(),
      incumbent: INCUMBENT,
      subject: { spec: 'github/rest-api-description api.github.com.json', operations },
      node: process.version,
      results,
    },
    null,
    2,
  )}\n`,
);
