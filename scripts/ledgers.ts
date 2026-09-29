/**
 * The decision and gap ledgers — one file per entry, so two branches never write the same file.
 *
 * `.sdlc/DECISIONS.md` and `.sdlc/GAPS.md` were each one table that every PR appended to.
 * Over the ~120 PRs before this file, DECISIONS.md was touched by 36 and GAPS.md by 32, and
 * every one of them took the next sequential id — so any two in flight together conflicted,
 * and one of them rebased, renumbered and re-ran ~20 minutes of CI. `.changeset/*.md` never had
 * that problem, because a changeset is a new file with a name nobody else will pick. The
 * ledgers now work the same way:
 *
 * - **`.sdlc/decisions/<id>.md`** — one decision. Front matter carries `id`, `subject`,
 *   `taken`, `date` and `superseded_by`; the body is the answer.
 * - **`.sdlc/gaps/<id>.md`** — one gap. Front matter carries `id`, `section`, `status` and the
 *   section's two remaining columns; the body is the gap.
 *
 * **Ids.** The sequential ones already written — D-001..D-151 (and the `LEGACY_LATE` ids,
 * which main wrote while this change was in flight), A1..A30, B1..B22, C1..C7 (and C8) — keep
 * their names forever, because commits, specs, PR titles and workflow messages cite them. The
 * sequence itself is frozen: a new entry is `D-YYYYMMDD-slug` (or `A-`, `B-`, `C-` for a gap),
 * which two branches can only collide on by choosing the same slug on the same day — and then
 * git refuses the second as an add/add conflict instead of merging two decisions under one
 * name. "max + 1" is what two agents compute identically; a date and a slug describing the
 * decision is not.
 *
 * **Why the tables are not generated back into the two files.** A committed index that every
 * decision PR regenerates is one file every decision PR edits at the same place — the conflict
 * this change exists to remove, moved rather than removed. `npm run ledger` prints the tables
 * on demand instead, and `decisions-lock.test.ts` / `gaps-lock.test.ts` fail if a row is
 * written back into either file.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { dump, FAILSAFE_SCHEMA, load } from 'js-yaml';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DECISIONS_DIR = '.sdlc/decisions';
export const GAPS_DIR = '.sdlc/gaps';

/**
 * The last sequential id of each ledger, frozen on 2026-09-27 when the ledgers went one file
 * per entry. Every id at or under these exists (except the holes below) and none above them
 * may be written.
 */
export const LEGACY = { D: 151, A: 30, B: 22, C: 7 } as const;
/**
 * Sequential decision ids above the frozen line that main wrote while this layout was in flight.
 * Commits and specs cite them, so they keep their names, and they are the only ones: every other
 * number past D-151 — the gaps between them included — still continues the sequence and fails.
 * D-152 (#638), D-154 (#648), D-157 (#660), D-158 and D-166..D-168 (#669), D-160 (#650), D-161
 * (#646), D-163 and D-164 (#662), D-165 (#667), D-170 and D-171 (#685), D-180 (#686), D-181
 * (#678), D-182 (#683), D-190 (#670).
 */
export const LEGACY_LATE: readonly string[] = [
  'D-152', 'D-154', 'D-157', 'D-158', 'D-160', 'D-161', 'D-163', 'D-164', 'D-165',
  'D-166', 'D-167', 'D-168', 'D-170', 'D-171', 'D-180', 'D-181', 'D-182', 'D-190',
];
/** The same for gaps: C8 (#669). */
export const LEGACY_LATE_GAPS: readonly string[] = ['C8'];
/** Sequential gap ids that were never written: GAPS.md went from A1 to A3 on the day it opened. */
export const LEGACY_HOLES: readonly string[] = ['A2'];
/** A slug long enough to say what the entry is and short enough to cite in a commit subject. */
export const MAX_SLUG = 40;

const DATED = String.raw`(\d{4})(\d{2})(\d{2})-([a-z0-9]+(?:-[a-z0-9]+)*)`;
/** `D-001` (legacy, group 1) or `D-20260927-per-entry-ledgers` (groups 2–5). */
export const DECISION_ID = new RegExp(`^D-(?:(\\d{3})|${DATED})$`);
/** `A13` (legacy: letter, number) or `A-20260927-some-slug` (letter, then groups 3–6). */
export const GAP_ID = new RegExp(`^([ABC])(?:(\\d+)|-${DATED})$`);

const EMPTY = '—';
/** D-001: the legacy decision ids are three digits. */
const LEGACY_WIDTH = 3;
/** How much of an offending line a message quotes. */
const EXCERPT = 60;
/** `YYYY-MM-DD` */
const ISO_DATE_LENGTH = 10;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The four sections of the gap ledger, each with the columns its table has always had. */
export const SECTIONS = {
  A: { letter: 'A', heading: 'A — build it', columns: ['Gap', 'Source', 'Done when'], keys: ['source', 'done_when'] },
  B: { letter: 'B', heading: 'B — decide, then build', columns: ['Decision', 'Source', 'Recommendation'], keys: ['source', 'recommendation'] },
  C: { letter: 'C', heading: 'C — outside the repo', columns: ['Gap', 'Source', 'What it needs'], keys: ['source', 'needs'] },
  release: { letter: 'C', heading: 'Release queue — owner actions', columns: ['Gap', 'Exact setting', 'Done when'], keys: ['setting', 'done_when'] },
} as const;
export type Section = keyof typeof SECTIONS;
// Not `in`: `'toString' in SECTIONS` is true, and a section called toString is not one.
const isSection = (s: string): s is Section => Object.keys(SECTIONS).includes(s);

export interface Decision {
  file: string;
  id: string;
  subject: string;
  answer: string;
  taken: string;
  date: string;
  supersededBy: string;
}

export interface Gap {
  file: string;
  id: string;
  section: Section;
  status: 'open' | 'closed';
  body: string;
  /** The section's two remaining columns, by key (`source`, `done_when`, …). */
  cells: Record<string, string>;
}

export interface Read<T> {
  entries: T[];
  /** Files that could not be read as an entry — every one is a failure, never a skip. */
  problems: string[];
}

const DECISION_KEYS = ['id', 'subject', 'taken', 'date', 'superseded_by'] as const;

/** Front matter and body. Returns a problem string instead of throwing, so a lock can list them all. */
export function frontMatter(text: string, file: string): { fields: Record<string, string>; body: string } | string {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text.replaceAll('\r\n', '\n'));
  if (match === null) return `${file} does not open with a --- front-matter block, so none of its fields can be checked`;
  let parsed: unknown;
  try {
    parsed = load(match[1] ?? '', { schema: FAILSAFE_SCHEMA });
  } catch (error) {
    return `${file} has front matter that is not YAML: ${(error as Error).message.split('\n')[0] ?? ''}`;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return `${file} has front matter that is not a mapping`;
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== 'string') return `${file}: "${key}" is not a single string value`;
    fields[key] = value;
  }
  return { fields, body: (match[2] ?? '').trim() };
}

/** Exactly these keys: a misspelt `superseded-by` would otherwise be read as no supersession at all. */
function keyProblems(file: string, fields: Record<string, string>, expected: readonly string[]): string[] {
  const out: string[] = [];
  for (const key of Object.keys(fields)) if (!expected.includes(key)) out.push(`${file} has "${key}", which no check reads — the fields are ${expected.join(', ')}`);
  for (const key of expected) if (!(key in fields)) out.push(`${file} has no "${key}"`);
  return out;
}

/** One decision file, or the reasons it is not one. */
export function parseDecision(text: string, file: string): Decision | string[] {
  const parsed = frontMatter(text, file);
  if (typeof parsed === 'string') return [parsed];
  const { fields, body } = parsed;
  const problems = keyProblems(file, fields, DECISION_KEYS);
  if (problems.length > 0) return problems;
  const id = fields.id ?? '';
  if (file !== `${id}.md`) return [`${file} holds ${id} — the file is named for the id it holds, so the id is the path`];
  return {
    file,
    id,
    subject: fields.subject ?? '',
    answer: body,
    taken: fields.taken ?? '',
    date: fields.date ?? '',
    supersededBy: fields.superseded_by ?? '',
  };
}

/** One gap file, or the reasons it is not one. */
export function parseGap(text: string, file: string): Gap | string[] {
  const parsed = frontMatter(text, file);
  if (typeof parsed === 'string') return [parsed];
  const { fields, body } = parsed;
  const section = fields.section ?? '';
  if (!isSection(section)) return [`${file} has section "${section}" — it is one of ${Object.keys(SECTIONS).join(', ')}`];
  const problems = keyProblems(file, fields, ['id', 'section', 'status', ...SECTIONS[section].keys]);
  if (problems.length > 0) return problems;
  const id = fields.id ?? '';
  if (file !== `${id}.md`) return [`${file} holds ${id} — the file is named for the id it holds, so the id is the path`];
  const status = fields.status ?? '';
  if (status !== 'open' && status !== 'closed') return [`${file} has status "${status}" — a gap is open or closed`];
  const cells: Record<string, string> = {};
  for (const key of SECTIONS[section].keys) cells[key] = fields[key] ?? '';
  return { file, id, section, status, body, cells };
}

/** Every file in a ledger directory. Anything that is not a readable entry is a problem, not a skip. */
function readLedger<T>(dir: string, parse: (text: string, file: string) => T | string[]): Read<T> {
  const entries: T[] = [];
  const problems: string[] = [];
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.md')) {
      problems.push(`${file} is in ${dir} and is not an entry — every file there is read as one, so nothing sits beside them unread`);
      continue;
    }
    const result = parse(readFileSync(join(dir, file), 'utf8'), file);
    if (Array.isArray(result)) problems.push(...result);
    else entries.push(result);
  }
  return { entries, problems };
}

export const readDecisions = (root: string = REPO_ROOT): Read<Decision> => readLedger(join(root, DECISIONS_DIR), parseDecision);
export const readGaps = (root: string = REPO_ROOT): Read<Gap> => readLedger(join(root, GAPS_DIR), parseGap);

// ── Checks. Each returns what is wrong; an empty list is a pass. ──────────────────────────────

/** Every closed decision has a subject, an answer, a taker and a date. */
export function halfWrittenDecisions(entries: readonly Decision[]): string[] {
  const out: string[] = [];
  for (const d of entries) {
    if (d.subject.trim() === '') out.push(`${d.id} has an empty Subject`);
    if (d.answer.trim() === '') out.push(`${d.id} has an empty Answer`);
    if (d.taken.trim() === '') out.push(`${d.id} has an empty Taken / Accepted`);
    if (!ISO_DATE.test(d.date.trim())) out.push(`${d.id} has an empty Date, or one that is not YYYY-MM-DD: "${d.date}"`);
  }
  return out;
}

/** An id used twice, by any two entries. */
export function duplicateIds(ids: readonly string[], noun: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) out.push(`duplicate ${noun} id ${id}`);
    seen.add(id);
  }
  return out;
}

/** Every `superseded_by` names another decision that exists, or is an em dash. */
export function danglingSupersessions(entries: readonly Decision[]): string[] {
  const ids = new Set(entries.map((d) => d.id));
  const out: string[] = [];
  for (const { id, supersededBy } of entries) {
    const ref = supersededBy.trim();
    if (ref === EMPTY) continue;
    if (!DECISION_ID.test(ref)) out.push(`${id} has "${ref}" under superseded_by — that field takes a decision id, or an em dash when nothing reverses it`);
    else if (!ids.has(ref) || ref === id) out.push(`${id} is superseded by ${ref}, which is not another decision in this ledger`);
  }
  return out;
}

/** A dated id's slug, or the problem with it. */
function slugProblem(id: string, slug: string | undefined): string | undefined {
  if (slug !== undefined && slug.length > MAX_SLUG) return `${id}'s slug is ${String(slug.length)} characters; keep it to ${String(MAX_SLUG)} so the id fits in a commit subject`;
  return undefined;
}

/** A sequential decision id past the frozen line that is not one of the late ids main already holds. */
const continuesSequence = (id: string, legacy: string): boolean => Number(legacy) > LEGACY.D && !LEGACY_LATE.includes(id);

/**
 * The sequence is frozen and new ids are dated.
 *
 * This is the check that turns "an agent following the old instructions" into a red build:
 * the old instructions say *the next number*, and the next number is D-191.
 */
export function decisionIdProblems(entries: readonly Decision[]): string[] {
  const out: string[] = [];
  for (const d of entries) {
    const m = DECISION_ID.exec(d.id);
    if (m === null) {
      out.push(`${d.id} is not a decision id — new ones are D-YYYYMMDD-slug (lower-case, hyphenated), e.g. D-20260927-per-entry-ledgers`);
      continue;
    }
    const [, legacy, y, mo, day, slug] = m;
    if (legacy !== undefined) {
      if (continuesSequence(d.id, legacy)) out.push(`${d.id} continues the sequential numbering, which stopped at D-${String(LEGACY.D)} because two branches computing "the next number" is exactly how they collide. Name it D-YYYYMMDD-slug: \`npm run ledger -- new decision <slug>\``);
      continue;
    }
    if (`${y ?? ''}-${mo ?? ''}-${day ?? ''}` !== d.date.trim()) out.push(`${d.id} is dated ${d.date} — the date in a decision's id is the date it was taken`);
    const slugIssue = slugProblem(d.id, slug);
    if (slugIssue !== undefined) out.push(slugIssue);
  }
  return out;
}

/** Every id the sequential ledger ever held is still here — a deleted file would otherwise be a silent loss. */
export function missingLegacy(ids: readonly string[], expected: readonly string[], noun: string): string[] {
  const have = new Set(ids);
  return expected.filter((id) => !have.has(id)).map((id) => `${noun} ${id} is gone — ids cited in commits, specs and PR titles must keep resolving; reverse a decision with superseded_by, strike a gap with status: closed`);
}

export const legacyDecisionIds = (): string[] => [...Array.from({ length: LEGACY.D }, (_, i) => `D-${String(i + 1).padStart(LEGACY_WIDTH, '0')}`), ...LEGACY_LATE];
export const legacyGapIds = (): string[] =>
  [...(['A', 'B', 'C'] as const).flatMap((l) => Array.from({ length: LEGACY[l] }, (_, i) => `${l}${String(i + 1)}`)).filter((id) => !LEGACY_HOLES.includes(id)), ...LEGACY_LATE_GAPS];

/** A sequential gap id past its section's frozen line (and not a late one main holds), or a hole. */
const gapContinuesSequence = (id: string, legacy: string, max: number): boolean => (Number(legacy) > max && !LEGACY_LATE_GAPS.includes(id)) || LEGACY_HOLES.includes(id);

/** Every gap names its section's letter, and new ones are dated. */
export function gapIdProblems(entries: readonly Gap[]): string[] {
  const out: string[] = [];
  for (const g of entries) {
    const m = GAP_ID.exec(g.id);
    if (m === null) {
      out.push(`${g.id} is not a gap id — new ones are <A|B|C>-YYYYMMDD-slug (lower-case, hyphenated), e.g. A-20260927-some-gap`);
      continue;
    }
    const [, letter, legacy, , , , slug] = m;
    const want = SECTIONS[g.section].letter;
    if (letter !== want) out.push(`${g.id} is in section ${g.section}, whose ids start with ${want}`);
    if (legacy !== undefined) {
      const max = LEGACY[letter as 'A' | 'B' | 'C'];
      if (gapContinuesSequence(g.id, legacy, max)) out.push(`${g.id} continues the sequential numbering, which stopped at ${letter ?? ''}${String(max)}. Name it ${letter ?? ''}-YYYYMMDD-slug: \`npm run ledger -- new gap ${g.section} <slug>\``);
      continue;
    }
    const slugIssue = slugProblem(g.id, slug);
    if (slugIssue !== undefined) out.push(slugIssue);
  }
  return out;
}

/** Every gap says what it is and fills its section's columns. */
export function halfWrittenGaps(entries: readonly Gap[]): string[] {
  const out: string[] = [];
  for (const g of entries) {
    if (g.body.trim() === '') out.push(`${g.id} says nothing about the gap — its body is empty`);
    for (const [key, value] of Object.entries(g.cells)) if (value.trim() === '') out.push(`${g.id} has an empty ${key}`);
  }
  return out;
}

/**
 * Rows written into the file that used to hold them. DECISIONS.md and GAPS.md keep their prose
 * and hold no entries, so an agent appending a row there — the old instruction — fails here
 * instead of writing to a file nothing reads.
 */
export function rowsLeftIn(markdown: string, file: string, row: RegExp): string[] {
  return markdown
    .replaceAll('\r\n', '\n')
    .split('\n')
    .filter((line) => row.test(line))
    .map((line) => `${file} holds an entry row again — one entry is one file under ${file === 'DECISIONS.md' ? DECISIONS_DIR : GAPS_DIR}/ (\`npm run ledger -- new ...\`): ${line.slice(0, EXCERPT)}...`);
}
/** `| D-…` — a decision row. */
export const DECISION_ROW = /^\|\s*D-\d/;
/** `| A13 |`, `| ~~B4~~ |`, `| C-2026… |` — a gap row. */
export const GAP_ROW = /^\|\s*(?:~~)?[ABC](?:\d|-\d{8})/;

/** `decisions/D-102.md`, `gaps/C5.md` — a path to one entry, from anywhere in the tree. */
const ENTRY_LINK = /\b(decisions|gaps)\/([A-Z][A-Za-z0-9-]*)\.md\b/g;

/** Every path to an entry resolves to a file. `files` is `[path, text]`. */
export function danglingLinks(files: readonly (readonly [string, string])[], root: string = REPO_ROOT): string[] {
  const out: string[] = [];
  for (const [path, text] of files) {
    for (const [, dir, id] of text.matchAll(ENTRY_LINK)) {
      const target = join(root, dir === 'decisions' ? DECISIONS_DIR : GAPS_DIR, `${id ?? ''}.md`);
      if (!existsSync(target)) out.push(`${path} points at ${dir ?? ''}/${id ?? ''}.md, which does not exist`);
    }
  }
  return out;
}

// ── Rendering, for people. Nothing is written back into the tree. ─────────────────────────────

/** A sequential id's number; a dated id sorts after every one of them. */
function sequence(id: string): number {
  const m = /^[A-Z]-?(\d{1,3})$/.exec(id);
  return m === null ? Number.POSITIVE_INFINITY : Number(m[1]);
}

/** Sequential ids by number, then dated ids by date and slug. */
function byId(a: string, b: string): number {
  return sequence(a) - sequence(b) || (sequence(a) === Number.POSITIVE_INFINITY ? a.localeCompare(b) : 0);
}

/** One table cell: a line, with any pipe escaped so it cannot split the row. */
const cell = (text: string): string => text.replaceAll(/\s*\n\s*/g, ' ').replaceAll('|', String.raw`\|`).trim();

export function renderDecisions(entries: readonly Decision[]): string {
  const rows = [...entries]
    .sort((a, b) => byId(a.id, b.id))
    .map((d) => `| ${d.id} | ${cell(d.subject)} | ${cell(d.answer)} | ${cell(d.taken)} | ${d.date} | ${d.supersededBy} |`);
  return ['| # | Subject | Answer | Taken / Accepted | Date | Superseded by |', '| :-- | :-- | :-- | :-- | :-- | :-- |', ...rows].join('\n');
}

export function renderGaps(entries: readonly Gap[], onlyOpen = false): string {
  const out: string[] = [];
  for (const [name, section] of Object.entries(SECTIONS) as [Section, (typeof SECTIONS)[Section]][]) {
    const rows = entries
      .filter((g) => g.section === name && (!onlyOpen || g.status === 'open'))
      .sort((a, b) => byId(a.id, b.id))
      .map((g) => `| ${g.status === 'closed' ? `~~${g.id}~~` : g.id} | ${cell(g.body)} | ${section.keys.map((k) => cell(g.cells[k] ?? '')).join(' | ')} |`);
    out.push(`## ${section.heading}`, '', `| # | ${section.columns.join(' | ')} |`, `| :-- | ${section.columns.map(() => ':--').join(' | ')} |`, ...rows, '');
  }
  return out.join('\n');
}

// ── Writing, for `new` and the one-off migration. ─────────────────────────────────────────────

const yaml = (fields: Record<string, string>): string => dump(fields, { lineWidth: -1 }).trimEnd();

export function serializeDecision(d: Omit<Decision, 'file'>): string {
  const fields = { id: d.id, subject: d.subject, taken: d.taken, date: d.date, superseded_by: d.supersededBy };
  return `---\n${yaml(fields)}\n---\n\n${d.answer}\n`;
}

export function serializeGap(g: Omit<Gap, 'file'>): string {
  return `---\n${yaml({ id: g.id, section: g.section, status: g.status, ...g.cells })}\n---\n\n${g.body}\n`;
}

/** `per-entry ledgers` → `per-entry-ledgers`. */
export const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '');

const today = (): string => new Date().toISOString().slice(0, ISO_DATE_LENGTH);

/**
 * A new, deliberately incomplete entry: every field the lock checks is empty, so it fails until
 * it is written. Refuses to overwrite.
 */
export interface ScaffoldOptions {
  kind: 'decision' | 'gap';
  slug: string;
  /** A gap's section; ignored for a decision. */
  section?: Section;
  root?: string;
  date?: string;
}

export function scaffold({ kind, slug, section = 'A', root = REPO_ROOT, date = today() }: ScaffoldOptions): string {
  const stamp = date.replaceAll('-', '');
  const id = kind === 'decision' ? `D-${stamp}-${slugify(slug)}` : `${SECTIONS[section].letter}-${stamp}-${slugify(slug)}`;
  const path = join(root, kind === 'decision' ? DECISIONS_DIR : GAPS_DIR, `${id}.md`);
  if (existsSync(path)) throw new Error(`${path} already exists — pick another slug`);
  const text =
    kind === 'decision'
      ? serializeDecision({ id, subject: '', answer: '', taken: '', date, supersededBy: EMPTY })
      : serializeGap({ id, section, status: 'open', body: '', cells: Object.fromEntries(SECTIONS[section].keys.map((k) => [k, ''])) });
  writeFileSync(path, text);
  return path;
}

const USAGE = `usage:
  npm run ledger -- decisions               every decision, as one table
  npm run ledger -- gaps [--open]           every gap (or only the open ones), by section
  npm run ledger -- new decision <slug>     .sdlc/decisions/D-YYYYMMDD-<slug>.md, to fill in
  npm run ledger -- new gap <A|B|C|release> <slug>`;

function fail(message: string): void {
  console.error(message);
  process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1] ?? ''}`) {
  const [command, ...rest] = process.argv.slice(2);
  if (command === 'decisions') {
    const { entries, problems } = readDecisions();
    console.log(renderDecisions(entries));
    for (const p of problems) fail(p);
  } else if (command === 'gaps') {
    const { entries, problems } = readGaps();
    console.log(renderGaps(entries, rest.includes('--open')));
    for (const p of problems) fail(p);
  } else if (command === 'new' && rest[0] === 'decision' && rest[1] !== undefined) {
    console.log(scaffold({ kind: 'decision', slug: rest.slice(1).join(' ') }));
  } else if (command === 'new' && rest[0] === 'gap' && rest[1] !== undefined && isSection(rest[1]) && rest[2] !== undefined) {
    console.log(scaffold({ kind: 'gap', slug: rest.slice(2).join(' '), section: rest[1] }));
  } else {
    fail(USAGE);
  }
}
