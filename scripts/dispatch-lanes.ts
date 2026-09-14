/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * One self-contained prompt per lane, generated from `.sdlc/LANES.md` and `.sdlc/PLAN.md`.
 *
 * Generated, never committed. A prompt file in the repository is a fourth copy of the plan
 * that rots against the other three — which is the failure this plan has already watched
 * eleven times in roadmap rows. Regenerate it at dispatch and it cannot be stale.
 *
 *   npx tsx scripts/dispatch-lanes.ts --dry-run
 *   npx tsx scripts/dispatch-lanes.ts --lane paratext
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { forbidden, type Lane, lanes } from './lanes.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LANES_MD = readFileSync(resolve(ROOT, '.sdlc/LANES.md'), 'utf-8');
const PLAN_MD = readFileSync(resolve(ROOT, '.sdlc/PLAN.md'), 'utf-8');

/**
 * The ownership rows this lane must do: the ones that name it, plus every `fan` row, which
 * every package lane does in its own paths. Dropping the fan rows would silently lose the
 * twelve vendored suites and the whole of 4.2 and 4.3.
 */
function steps(lane: Lane): { id: string; what: string; fan: boolean }[] {
  const packageLane = lane.owns.some((o) => o.startsWith('packages/')) && lane.name !== 'harness' && lane.name !== 'integrator';
  return [...LANES_MD.matchAll(/^\| (\d[\w.–-]*) ([^|]+)\|\s*(\w+)\s*\| ([\w*]+)/gm)]
    .filter((m) => (m[4] as string).replaceAll('*', '') === lane.name || (packageLane && m[3] === 'fan'))
    .map((m) => ({ id: m[1] as string, what: (m[2] as string).trim(), fan: m[3] === 'fan' }));
}

/**
 * A step's full paragraph from PLAN.md, which is where its "Done when" lives.
 *
 * A range is spelled whole on both sides (`2.2–2.13`), so look for the whole id first and
 * fall back to its first number — the fallback alone silently dropped the twelve suites,
 * the largest step in the plan, from every package lane's prompt.
 */
function detail(id: string): string {
  // Some bullets bold the title with the id (`- **2.14 \`cross-spawn\` (jest).**`), so the id
  // must be followed by something that is not another digit — `2.1` must not find `2.14`.
  // Scanned rather than built into a RegExp: a pattern assembled from a string at runtime is
  // a pattern nobody can read here, and this one is a prefix test.
  const find = (k: string): number => {
    const needle = `- **${k}`;
    for (const line of PLAN_MD.split('\n')) {
      if (line.startsWith(needle) && !/[\d.]/.test(line.charAt(needle.length))) return PLAN_MD.indexOf(line);
    }
    return -1;
  };
  const start = [id, id.split(/[–-]/)[0] as string].map(find).find((i) => i !== -1) ?? -1;
  if (start === -1) return '';
  const rest = PLAN_MD.slice(start);
  const end = rest.slice(1).search(/\n- \*\*|\n## /);
  return rest.slice(0, end === -1 ? rest.length : end + 1).trim();
}

export function prompt(lane: Lane): string {
  const mine = steps(lane);
  return [
    `## lane ${lane.name}`,
    ``,
    `Branch \`${lane.branch}\`, cut from \`main\`.`,
    ``,
    `You may write only these paths: ${lane.owns.map((o) => `\`${o}\``).join(', ')}.`,
    `You may not write: ${forbidden().map((f) => `\`${f}\``).join(', ')} — those belong to the integrator lane,`,
    `and a lane that touches them conflicts with every other lane. \`npx tsx scripts/lanes.ts --check ${lane.branch}\``,
    `over \`git diff --name-only origin/main...HEAD\` is the check; the pre-push hook runs it.`,
    ``,
    `Record a changeset (\`.changeset/<anything>.md\`) for any published package you change, and never`,
    `edit a \`version\` field by hand — see \`## Releasing\` in .sdlc/PLAN.md.`,
    ``,
    `Your steps, in order:`,
    ``,
    ...mine.flatMap((s) => [
      `### ${s.id} — ${s.what}${s.fan ? ' (fan step)' : ''}`,
      ``,
      detail(s.id) || '_(no PLAN.md paragraph; see .sdlc/LANES.md)_',
      ...(s.fan
        ? [
            ``,
            `**This step fans across every package lane, so its "Done when" command counts the whole`,
            `repository and cannot pass from your branch alone.** Do your package's share only, and prove`,
            `it over your own paths — the entries, tests or files your lane added, not the repo-wide total.`,
            `The integrator lane runs the repo-wide form once every lane has landed.`,
          ]
        : []),
      ``,
    ]),
    `When every step's "Done when" command passes, push \`${lane.branch}\` and stop. The integrator`,
    `lane opens the PR. Do not merge, and do not rebase another lane's branch.`,
  ].join('\n');
}

/** Importers (the lock test) get `prompt` without the CLI printing ten lane briefs. */
if (process.argv[1]?.endsWith('dispatch-lanes.ts') === true) {
  const argv = process.argv.slice(2);
  const only = argv.includes('--lane') ? argv[argv.indexOf('--lane') + 1] : undefined;
  const chosen = lanes().filter((l) => only === undefined || l.name === only);
  if (chosen.length === 0) {
    console.error(`no lane named ${String(only)} — see .sdlc/LANES.md`);
    process.exit(1);
  }
  console.log(chosen.map(prompt).join('\n\n---\n\n'));
}
