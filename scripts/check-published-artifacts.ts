/**
 * Artifact gate — cli-packaging R4 and R5 (floor K4, K5). Runs on the BUILT packages,
 * between build and publish, so what is about to reach npm is what gets checked:
 *
 *   - every `exports` target exists on disk;
 *   - the pack list contains no source maps, no tests, no agent docs;
 *   - the tarball is not more than 10% larger than the recorded baseline (a shrink is
 *     reported so the baseline can be lowered in the same PR).
 *
 * Exit code 1 on any failure. `--update-baseline` rewrites the baseline to what is built.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const BASELINE = join(root, '.agent', 'artifact-size-baseline.json');
const GROWTH_ALLOWED = 0.1;
const PERCENT = 100;

interface Pkg {
  name: string;
  private?: boolean;
  exports?: Record<string, string | Record<string, string>>;
}
interface PackEntry {
  name: string;
  size: number;
  unpackedSize: number;
  files: { path: string }[];
}
type Baseline = Record<string, { size: number; unpackedSize: number }>;

const FORBIDDEN = [/\.map$/, /\.test\.[cm]?[jt]s$/, /(^|\/)AGENTS\.md$/, /(^|\/)CLAUDE\.md$/];

/** Every `exports` target must exist on disk — a build that skipped a file must not publish. */
function missingExportTargets(dir: string, pkg: Pkg): string[] {
  const problems: string[] = [];
  for (const [entry, target] of Object.entries(pkg.exports ?? {})) {
    if (entry === './package.json') continue;
    const files = typeof target === 'string' ? [target] : Object.values(target);
    for (const f of new Set(files)) {
      if (!existsSync(join(dir, f))) problems.push(`${pkg.name}: exports ${entry} -> ${f} does not exist (build first?)`);
    }
  }
  return problems;
}

/** Nothing in the pack list may be a source map, a test, or agent instructions. */
function forbiddenInPack(pkg: Pkg, pack: PackEntry): string[] {
  return pack.files.filter(({ path }) => FORBIDDEN.some((re) => re.test(path))).map(({ path }) => `${pkg.name}: would publish ${path}`);
}

/** The tarball ratchets: growth past the allowance fails, a shrink is reported so the baseline can follow. */
function sizeVerdict(pkg: Pkg, pack: PackEntry, baseline: Baseline, update: boolean): string[] {
  const was = baseline[pkg.name];
  if (was === undefined || update) {
    baseline[pkg.name] = { size: pack.size, unpackedSize: pack.unpackedSize };
    return [];
  }
  if (pack.size > was.size * (1 + GROWTH_ALLOWED)) {
    const pct = (((pack.size - was.size) / was.size) * PERCENT).toFixed(1);
    return [`${pkg.name}: tarball grew ${pct}% (${was.size} -> ${pack.size} bytes); bump the baseline deliberately or trim`];
  }
  if (pack.size < was.size) process.stdout.write(`  ${pkg.name}: tarball shrank ${was.size} -> ${pack.size} bytes; lower the baseline\n`);
  return [];
}

function check(dir: string, pkg: Pkg, baseline: Baseline, update: boolean): string[] {
  const [pack] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: dir, encoding: 'utf8' })) as PackEntry[];
  if (pack === undefined) return [`${pkg.name}: npm pack produced nothing`];
  return [...missingExportTargets(dir, pkg), ...forbiddenInPack(pkg, pack), ...sizeVerdict(pkg, pack, baseline, update)];
}

const update = process.argv.includes('--update-baseline');
const baseline: Baseline = existsSync(BASELINE) ? (JSON.parse(readFileSync(BASELINE, 'utf8')) as Baseline) : {};
const problems: string[] = [];
for (const dir of readdirSync(join(root, 'packages'))) {
  const full = join(root, 'packages', dir);
  const pkg = JSON.parse(readFileSync(join(full, 'package.json'), 'utf8')) as Pkg;
  if (pkg.private === true) continue;
  problems.push(...check(full, pkg, baseline, update));
}
if (update || !existsSync(BASELINE)) writeFileSync(BASELINE, `${JSON.stringify(baseline, null, 2)}\n`);
for (const p of problems) process.stdout.write(`✖ ${p}\n`);
process.stdout.write(problems.length === 0 ? '✓ published artifacts check out\n' : `${problems.length} problem(s)\n`);
process.exitCode = problems.length === 0 ? 0 : 1;
