/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The lanes of `.sdlc/LANES.md`, read from the file a person edits.
 *
 * A lane is one sub-agent, one branch, one set of owned paths. The point of writing them
 * down is that two lanes can then run at once without their branches fighting: if no path
 * belongs to two lanes, no merge has anything to resolve. `lane-boundaries-lock.test.ts`
 * is what makes that true rather than intended.
 *
 * The table in the Markdown is the source. A second copy in JSON would be a second thing
 * to keep in step, and the drift would be invisible — the failure this repository has now
 * watched three times.
 *
 *   npx tsx scripts/lanes.ts --print
 *   git diff --name-only origin/main... | npx tsx scripts/lanes.ts --check lane/paratext
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LANES_MD = resolve(ROOT, '.sdlc/LANES.md');

export interface Lane {
  name: string;
  branch: string;
  /** Glob-ish prefixes this lane may write. `**` is the only wildcard that matters here. */
  owns: string[];
}

const cells = (row: string): string[] =>
  row
    .split('|')
    .slice(1, -1)
    .map((c) => c.trim());

const backticked = (cell: string): string[] => [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1] as string);

/** The `## The lanes` table: name, branch, owns. Rows without a branch are prose. */
export function lanes(): Lane[] {
  const text = readFileSync(LANES_MD, 'utf-8');
  const out: Lane[] = [];
  for (const row of text.split('\n').filter((l) => l.startsWith('| `'))) {
    const [name, branch, owns] = cells(row);
    if (name === undefined || branch === undefined || owns === undefined) continue;
    if (!branch.includes('lane/')) continue;
    out.push({ name: backticked(name)[0] as string, branch: backticked(branch)[0] as string, owns: backticked(owns) });
  }
  return out;
}

/** Paths every lane is forbidden, from the paragraph that states them (it wraps). */
export function forbidden(): string[] {
  const text = readFileSync(LANES_MD, 'utf-8');
  const start = text.indexOf('**Forbidden to every lane');
  if (start === -1) return [];
  const para = text.slice(start).split('\n\n')[0] as string;
  return backticked(para.slice(para.indexOf(':')));
}

/** A path is inside an `owns` entry when the entry's prefix (before `**`) starts it. */
export const owns = (lane: Lane, path: string): boolean => lane.owns.some((g) => path.startsWith(g.replace(/\*\*$/, '')));

/** Column widths for `--print`; wide enough for the longest lane name and branch. */
const NAME_COL = 12;
const BRANCH_COL = 18;

/** Exits non-zero naming every changed path this lane does not own. Reads stdin. */
function checkChangedPaths(lane: Lane): never {
  const changed = readFileSync(0, 'utf-8').split('\n').filter(Boolean);
  const strays = changed.filter((path) => !owns(lane, path));
  for (const stray of strays) console.error(`${stray} is not owned by lane ${lane.name}`);
  process.exit(strays.length === 0 ? 0 : 1);
}

function checkBranch(branch: string): never {
  const lane = lanes().find((l) => l.branch === branch || l.name === branch);
  if (lane === undefined) {
    console.error(`no lane named ${branch} — see .sdlc/LANES.md`);
    process.exit(1);
  }
  return checkChangedPaths(lane);
}

const argv = process.argv.slice(2);
if (argv[0] === '--print') {
  for (const l of lanes()) console.log(`${l.name.padEnd(NAME_COL)} ${l.branch.padEnd(BRANCH_COL)} ${l.owns.join(' ')}`);
} else if (argv[0] === '--check') checkBranch(argv[1] ?? '');
