/**
 * Every question still open across every intent, and the ratchet that makes the count go
 * down rather than up.
 *
 * 102 questions had accumulated across 48 intents before this existed, because an intent's
 * `## Open questions` section is a place to *raise* one and nothing in the repository could
 * ever *close* one. `.sdlc/DECISIONS.md` is where they end; this is what counts them.
 *
 * The ceiling is a ratchet in the repository's usual sense: raising it is a decision, taken
 * in `.sdlc/bands/open-questions.json` with the reason written beside it, never a drift.
 * Lowering it is what closing a question looks like.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INTENTS = join(REPO_ROOT, '.sdlc/intents');

/**
 * A list item under `## Open questions`, up to the next heading of any level.
 *
 * The first version ended the section with `(?=^#{1,6} |\z)`. `\z` is not a JavaScript
 * anchor — it is an identity escape for the letter `z` — so the section ended at the first
 * `z` in the prose and the count read **23** where the tree holds 102. A regex that is
 * wrong in the flattering direction is the failure this repository keeps finding in its own
 * checkers, so the section is sliced explicitly rather than anchored.
 */
const HEADING = /^#{1,6} /gm;
const ITEM = /^\s*(?:[-*]|\d+\.)\s+\S/gm;

/** Right-aligns the count beside the slug; no intent is anywhere near a thousand. */
const COUNT_WIDTH = 3;

export interface OpenQuestions {
  slug: string;
  count: number;
}

/** One intent's open questions. A missing section is zero, not an error: not every intent has any. */
export function questionsIn(markdown: string): number {
  const start = /^## Open questions[ \t]*$/m.exec(markdown);
  if (start === null) return 0;
  const from = start.index + start[0].length;
  HEADING.lastIndex = from;
  const next = HEADING.exec(markdown);
  const section = markdown.slice(from, next?.index ?? markdown.length);
  return (section.match(ITEM) ?? []).length;
}

/** Every intent that still carries at least one, heaviest first. */
export function openQuestions(root: string = INTENTS): OpenQuestions[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== '_template')
    .map((e) => {
      let markdown = '';
      try {
        markdown = readFileSync(join(root, e.name, 'intent.md'), 'utf8');
      } catch {
        return { slug: e.name, count: 0 };
      }
      return { slug: e.name, count: questionsIn(markdown) };
    })
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug));
}

export function total(rows: readonly OpenQuestions[]): number {
  return rows.reduce((sum, r) => sum + r.count, 0);
}

/** The committed ceiling. Throws rather than defaulting — a gate running at `Infinity` passes everything. */
export function ceiling(root: string = REPO_ROOT): number {
  const file = join(root, '.sdlc/bands/open-questions.json');
  const doc = JSON.parse(readFileSync(file, 'utf8')) as { ceiling?: number };
  if (typeof doc.ceiling !== 'number') throw new Error(`no numeric "ceiling" in ${file} — a gate with no ceiling is not a gate`);
  return doc.ceiling;
}

if (import.meta.url === `file://${process.argv[1] ?? ''}`) {
  const rows = openQuestions();
  const sum = total(rows);
  const max = ceiling();
  for (const r of rows) console.log(`${String(r.count).padStart(COUNT_WIDTH)}  ${r.slug}`);
  console.log(`\n${String(sum)} open across ${String(rows.length)} intents, against a ceiling of ${String(max)}.`);
  console.log(sum > max ? '✖ over the ceiling — close one, or raise it deliberately in .sdlc/bands/open-questions.json' : '✓ at or under the ceiling');
  process.exitCode = sum > max ? 1 : 0;
}
