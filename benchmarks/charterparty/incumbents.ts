/**
 * Phase 0 baselines for charterparty's `gen` metrics (`.sdlc/intents/charterparty/metrics.md`
 * G2–G5), measured on the incumbent alone. Installs openapi-typescript into a throwaway directory,
 * then reads install size, dependency count, generation time (median of 5) and whether it runs under
 * TypeScript 5, 6 and 7, and
 * whether a plain `npm i` resolves its `typescript` peer range beside each.
 *
 *   node benchmarks/charterparty/incumbents.ts [workdir] > reading.json
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const INCUMBENT = 'openapi-typescript@7.13.0';
const SPEC_URL =
  'https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json';
const RUNS = 5;

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
  try {
    execFileSync('npm', args, { cwd: dir, stdio: 'ignore' });
    return true;
  } catch {
    execFileSync('npm', [...args, '--legacy-peer-deps'], { cwd: dir, stdio: 'ignore' });
    return false;
  }
}

function countPackages(dir: string): number {
  let raw: string;
  try {
    raw = execFileSync('npm', ['ls', '--all', '--json', '--omit=dev'], { cwd: dir, stdio: 'pipe' }).toString();
  } catch (error) {
    // ELSPROBLEMS (an invalid peer) exits 1 but still prints the tree.
    raw = (error as { stdout: Buffer }).stdout.toString();
  }
  const tree = JSON.parse(raw) as {
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
    try {
      execFileSync(bin, [spec, '-o', path.join(dir, 'out.d.ts')], { cwd: dir, stdio: 'pipe' });
    } catch (error) {
      const stderr = (error as { stderr?: Buffer }).stderr?.toString() ?? String(error);
      return { medianMs: Number.NaN, ok: false, error: stderr.split('\n').find((l) => l.trim()) ?? stderr };
    }
    samples.push(performance.now() - start);
  }
  samples.sort((x, y) => x - y);
  return { medianMs: Math.round(samples[Math.floor(RUNS / 2)] ?? Number.NaN), ok: true };
}

const root = process.argv[2] ?? mkdtempSync(path.join(tmpdir(), 'charterparty-bench-'));
const spec = path.join(root, 'github.json');
execFileSync('curl', ['-sSfL', '-o', spec, SPEC_URL]);
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
