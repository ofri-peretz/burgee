/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * `.sdlc/intents/README.md`'s status column, checked against each intent's own `Status:`.
 *
 * The index rotted twice in three days — nine rows on 2026-09-10, two more on 09-13 — and
 * both times the same way: an `intent.md` moved on and the row that summarises it did not.
 * A row is read as work remaining, so stale rows get the work redone or get real work
 * deferred behind something already finished.
 *
 * This does **not** regenerate the prose. The prose is the part a person writes and the part
 * worth writing. It checks the one token that is mechanically true or false: the status word
 * in the row is the status word in the file it points at. Anything more would be a generator
 * that overwrites judgement; anything less is what already failed.
 *
 *   npx tsx scripts/roadmap-index.ts --check   # exits 1 on drift, and names it
 *   npx tsx scripts/roadmap-index.ts --fix     # rewrites the status word only
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INTENTS = join(ROOT, '.sdlc/intents');
const INDEX = join(INTENTS, 'README.md');

export const STATES = ['draft', 'review', 'approved', 'shipped', 'dropped'] as const;
export type State = (typeof STATES)[number];

/** The `**Status:** <word>` an intent declares about itself. */
export function declared(slug: string): State | undefined {
  let text: string;
  try {
    text = readFileSync(join(INTENTS, slug, 'intent.md'), 'utf-8');
  } catch {
    return undefined;
  }
  const m = /\*\*Status:\*\*\s*`?(\w+)`?/.exec(text);
  return m !== null && (STATES as readonly string[]).includes(m[1] as string) ? (m[1] as State) : undefined;
}

interface Row {
  slug: string;
  line: number;
  /** The first status word in the row's status cell. */
  says: State | undefined;
  raw: string;
}

/** Index rows that link an intent directory, with the status word each one asserts. */
export function rows(): Row[] {
  const out: Row[] = [];
  const lines = readFileSync(INDEX, 'utf-8').split('\n');
  for (const [i, raw] of lines.entries()) {
    const link = /\]\(\.\/([a-z0-9-]+)\/\)/.exec(raw);
    if (link === null || !raw.startsWith('|')) continue;
    const slug = link[1] as string;
    // The status cell is everything after the link's cell; the first state word in it wins,
    // so `**review** (was \`shipped\`)` reads as review — the correction, not the history.
    const after = raw.slice(raw.indexOf(`](./${slug}/)`));
    const said = new RegExp(`\\b(${STATES.join('|')})\\b`).exec(after.replace(/\(was [^)]*\)/g, ''));
    out.push({ slug, line: i + 1, says: said === null ? undefined : (said[1] as State), raw });
  }
  return out;
}

export interface Drift {
  slug: string;
  line: number;
  says: string;
  declares: string;
}

export function drift(): Drift[] {
  const out: Drift[] = [];
  for (const row of rows()) {
    const is = declared(row.slug);
    if (is === undefined) continue; // an intent with no Status: line is a different defect
    if (row.says !== is) out.push({ slug: row.slug, line: row.line, says: row.says ?? '(none)', declares: is });
  }
  return out;
}

/**
 * Intents the index never mentions. Not "has no table row" — `burgee` is named in prose as
 * the parent of everything and `security-profile` appears in four places without a link, and
 * calling those missing would be a checker inventing work.
 */
export function unlisted(): string[] {
  const text = readFileSync(INDEX, 'utf-8');
  return readdirSync(INTENTS, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_') && declared(d.name) !== undefined)
    .map((d) => d.name)
    .filter((slug) => !text.includes(slug));
}

if (process.argv[1]?.endsWith('roadmap-index.ts') === true) {
  const argv = process.argv.slice(2);
  const bad = drift();
  const missing = unlisted();
  if (argv.includes('--fix')) {
    // **The index wins, and the intent is rewritten** — not the other way round. Every drift
    // found on the first run was an `intent.md` claiming `shipped` while the row said
    // `review — 3 of 6` and named the unmet criteria. The index was audited against the tree
    // on 2026-09-10; the statuses were assigned on 09-09. The direction that flatters is the
    // stale one, which is the direction a careless fixer would have taken.
    for (const d of bad) {
      const file = join(INTENTS, d.slug, 'intent.md');
      const text = readFileSync(file, 'utf-8');
      writeFileSync(file, text.replace(/(\*\*Status:\*\*\s*`?)\w+(`?)/, `$1${d.says}$2`));
      console.log(`${d.slug}: intent.md ${d.declares} -> ${d.says}, from the index`);
    }
  } else {
    for (const d of bad) console.error(`${INDEX}:${String(d.line)}  ${d.slug}: the row says ${d.says}, intent.md says ${d.declares}`);
    for (const slug of missing) console.error(`${slug} has an intent.md and no row in the index`);
    if (bad.length === 0 && missing.length === 0) console.log(`${String(rows().length)} rows agree with their intents`);
    process.exitCode = bad.length + missing.length === 0 ? 0 : 1;
  }
}
