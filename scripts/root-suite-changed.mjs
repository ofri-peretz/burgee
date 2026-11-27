#!/usr/bin/env node
// Pre-push's root suite: what `vitest --changed` finds through imports, plus the locks that read a
// changed non-code file as text (lefthook.yml, a workflow, a JSON config). `--changed` follows
// imports only, so a lock that reads lefthook.yml was skipped (CI caught three, 2026-11-26), and
// rerunning all 182 files whenever config changed took 4-5 min under load and hit the 5m cap.
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, realpathSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CODE = /\.(?:[cm]?[jt]sx?)$/;

const vitest = (args) => spawnSync('npx', ['--no', 'vitest', 'run', '--config', 'vitest.root.config.ts', '--bail=1', ...args], { stdio: 'inherit' }).status ?? 1;

/** Root test files whose source names a changed non-code file. Basename match: a superset, never fewer. */
export function readersOf(changed, tests) {
  const names = [...new Set(changed.filter((f) => !CODE.test(f)).map((f) => basename(f)))];
  if (names.length === 0) return [];
  return Object.entries(tests)
    .filter(([, src]) => names.some((n) => src.includes(n)))
    .map(([file]) => file)
    .sort();
}

if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
  // The merge base, not main's tip: against the tip, every release commit on main since this branch
  // started (its package.json bumps) counts as changed, and a package.json change reruns everything.
  const base = spawnSync('git', ['merge-base', process.argv[2] ?? 'origin/main', 'HEAD'], { encoding: 'utf8' }).stdout.trim() || (process.argv[2] ?? 'origin/main');
  const changed = spawnSync('git', ['diff', '--name-only', base], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
  const tests = Object.fromEntries(
    readdirSync('scripts', { recursive: true })
      .filter((f) => String(f).endsWith('.test.ts'))
      .map((f) => [join('scripts', String(f)), readFileSync(join('scripts', String(f)), 'utf8')]),
  );
  const first = vitest(['--changed', base]);
  if (first !== 0) process.exit(first);
  const readers = readersOf(changed, tests);
  if (readers.length > 0) console.log(`root-suite: ${readers.length} lock(s) read a changed file as text`);
  process.exit(readers.length > 0 ? vitest(readers) : 0);
}
