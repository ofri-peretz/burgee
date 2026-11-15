/**
 * Every reason `hosts.ts` declares, against the page that publishes it.
 *
 * A case that leaves a number — excluded by name, allowed to fail in the control, registered on
 * some platforms only, or in a directory vendored and not graded — leaves it with a reason, and
 * the reason is the claim a reader checks (`compat-oracle/intent.md`: "the exclusion list is
 * explicit, named and justified in the repo"). `scripts/compat-page.ts` writes them into the
 * family app's `compatibility.mdx`, and its `--check` compares the page with the oracle's last
 * results; nothing in this package's suite read them at all, so a reason emptied, a count moved
 * or a row dropped in `hosts.ts` passed every test here. These locks read the committed page:
 * each table holds exactly the rows `hosts.ts` declares, in its order, and no other.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { type Host, HOSTS, PREVIOUS_MAJORS } from './hosts.js';

const ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));

/** The family app's directory: the one `familyPages: true` row of `.github/vercel-apps.json`, as `compat-page.ts` reads it. */
function familyDir(): string {
  const { apps } = JSON.parse(readFileSync(join(ROOT, '.github', 'vercel-apps.json'), 'utf8')) as { apps: Record<string, { familyPages?: boolean; outputDirectory: string }> };
  const family = Object.values(apps).filter((a) => a.familyPages === true);
  expect(family).toHaveLength(1);
  // `apps/docs/.next` → `apps/docs`
  return (family[0]?.outputDirectory ?? '').replace(/\/\.next$/u, '');
}

const PAGE = readFileSync(join(ROOT, familyDir(), 'content', 'docs', 'compatibility.mdx'), 'utf8');

const LINES = PAGE.split('\n');

/** The body rows of the table whose header is at `head`: past the header and its separator, until the table ends. */
function rowsFrom(head: number): string[] {
  const rows: string[] = [];
  for (let i = head + 2; i < LINES.length && (LINES[i] ?? '').startsWith('| '); i++) rows.push(LINES[i] ?? '');
  return rows;
}

/** The body rows of the first table under the heading `heading` (`### Cases excluded from the gate`). */
function table(heading: string): string[] {
  const at = LINES.indexOf(heading);
  expect(at, `the page has no "${heading}" section`).toBeGreaterThan(-1);
  return rowsFrom(LINES.findIndex((l, i) => i > at && l.startsWith('| ')));
}

/** The results tables, active rows first and previous majors second: host and front-end of each row. */
const RESULTS_HEADER = '| Host | Front-end | burgee | rate | control | rate |';
const results = LINES.flatMap((l, i) => (l.startsWith(RESULTS_HEADER) ? [i] : [])).map((head) =>
  rowsFrom(head).map((row) => {
    // `| **name** | ...` or, where a guide exists, `| [**name**](url) | ...`
    const m = /^\| \[?\*\*([^*]+)\*\*(?:\]\([^)]*\))? \| `([^`]+)` \|/u.exec(row);
    return m === null ? row : `${m[1] ?? ''} → ${m[2] ?? ''}`;
  }),
);

const gradedRows = [...HOSTS.filter((h) => h.status === 'active'), ...PREVIOUS_MAJORS];

/** `only on linux`, `not on win32`, `…, and only on x64`: the registration a conditional row publishes. */
const registered = (c: NonNullable<Host['conditionalCases']>): string =>
  `${c.only !== undefined ? `only on ${c.only.join(', ')}` : `not on ${(c.notOn ?? []).join(', ')}`}${c.arch === undefined ? '' : `, and only on ${c.arch.join(', ')}`}`;

describe('the published page states every reason hosts.ts declares, and no other', () => {
  it('every excluded case, by host, match and reason', () => {
    const declared = [...HOSTS, ...PREVIOUS_MAJORS].flatMap((h) => (h.excludes ?? []).map((e) => `| **${h.name}** | \`${e.match.trim()}\` | ${e.why} |`));
    expect(declared.length).toBeGreaterThan(0);
    expect(table('### Cases excluded from the gate')).toEqual(declared);
  });

  it('every control failure allowed, by host, count and reason', () => {
    const declared = gradedRows.flatMap((h) => (h.controlFailures === undefined ? [] : [`| **${h.name}** | ${String(h.controlFailures.count)} | ${h.controlFailures.why} |`]));
    expect(declared.length).toBeGreaterThan(0);
    expect(table('### Control failures allowed')).toEqual(declared);
  });

  it('every case only some platforms register, by host, count, platform and reason', () => {
    const declared = gradedRows.flatMap((h) => (h.conditionalCases === undefined ? [] : [`| **${h.name}** | ${String(h.conditionalCases.count)} | ${registered(h.conditionalCases)} | ${h.conditionalCases.why} |`]));
    expect(declared.length).toBeGreaterThan(0);
    expect(table('### Cases only some platforms register')).toEqual(declared);
  });

  it('every directory vendored and not graded, by host, directory and reason', () => {
    const declared = gradedRows.flatMap((h) => (h.ungradedDirs ?? []).map((d) => `| **${h.name}** | \`${d.dir}/\` | ${d.why} |`));
    expect(declared.length).toBeGreaterThan(0);
    expect(table('### Directories vendored and not graded')).toEqual(declared);
  });

  it('every row graded as a ceiling, by host, target and reason', () => {
    const declared = gradedRows.flatMap((h) => (h.ceiling === undefined ? [] : [`| **${h.name}** | \`${h.target}\` | ${h.ceiling} |`]));
    expect(declared.length).toBeGreaterThan(0);
    expect(table('### Graded as a ceiling, not a drop-in')).toEqual(declared);
  });

  it('every host not graded, by name, status and the note that says why', () => {
    const declared = HOSTS.filter((h) => h.status !== 'active').map((h) => `| ${h.name} | ${h.status} | ${h.note ?? ''} |`);
    expect(declared.length).toBeGreaterThan(0);
    expect(declared.filter((row) => row.endsWith('|  |')), 'a row that is not graded publishes no reason').toEqual([]);
    expect(table('## Other hosts')).toEqual(declared);
  });

  it('every reason is a sentence, not an empty cell', () => {
    const reasons = [...HOSTS, ...PREVIOUS_MAJORS].flatMap((h) => [
      ...(h.excludes ?? []).map((e) => [h.name, e.match, e.why] as const),
      ...(h.ungradedDirs ?? []).map((d) => [h.name, d.dir, d.why] as const),
      ...(h.controlFailures === undefined ? [] : [[h.name, 'controlFailures', h.controlFailures.why] as const]),
      ...(h.conditionalCases === undefined ? [] : [[h.name, 'conditionalCases', h.conditionalCases.why] as const]),
    ]);
    expect(reasons.filter(([, what, why]) => what.trim() === '' || why.trim() === '')).toEqual([]);
  });
});

describe('the published results name every graded row and its front-end, in order', () => {
  it('the active rows, then the previous majors', () => {
    expect(results).toEqual([
      HOSTS.filter((h) => h.status === 'active').map((h) => `${h.name} → ${h.target}`),
      PREVIOUS_MAJORS.map((h) => `${h.name} → ${h.target}`),
    ]);
  });
});
