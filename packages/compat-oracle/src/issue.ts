/**
 * The issue body — `upstream-watch` R6, and the reason the intent exists.
 *
 * An issue that says "commander added `.helpCommand()`" is a research task: somebody has to
 * find which of our files is affected, decide what the bump is, and write the changeset. An
 * issue that says *"`burgee/commander` is missing it; add it to
 * `packages/burgee/src/commander/program.ts`; changeset `'burgee': minor`"* is a job a
 * person or an agent finishes in one turn.
 *
 * So the body has three sections and the last two are the point:
 *
 *   1. **what changed** — exports added and removed, the weight, the files whose hash moved;
 *   2. **what it costs us** — which subpath claims parity or a ceiling against this package,
 *      and which of our published numbers is now stale, with the file and line it is written on;
 *   3. **what our change should be** — the derived checklist, and the `.changeset/*.md` body
 *      written out as a fenced block, ready to paste.
 *
 * Rendering is pure: facts in, markdown out. Everything that touches the filesystem or the
 * network happens before this file, which is what lets R8 assert a whole body byte-for-byte.
 *
 * The changeset is **rendered, never written** (intent constraint 6, design R7). A changeset
 * for work nobody has done breaks `changeset:status` for everybody until it is deleted.
 */
import { type Claim } from './competitors.js';
import { bumpKind } from './semver.js';

/** Where one of our published numbers about this competitor is written down. */
export interface Citation {
  /** Repo-relative, with a line number when we could find the exact line. */
  file: string;
  line: number | null;
  /** The text as written, so the issue shows the claim rather than describing it. */
  text: string;
}

/** One claim our family makes against this competitor. */
export interface ClaimSite {
  owner: string;
  subpath: string;
  claim: Claim;
  /** Files the change would touch, derived from the tree — never invented. */
  targets: string[];
  citations: Citation[];
}

export interface SurfaceChange {
  added: string[];
  removed: string[];
  /** Shipped files whose sha256 moved between the two releases. */
  filesChanged: string[];
  /** Files the release started shipping. */
  filesAdded: string[];
  /**
   * Files it stopped shipping. Worth its own row rather than folded into "changed":
   * commander 15.0.0's headline change is that it **dropped** `esm.mjs` and
   * `typings/esm.d.mts`, and a diff that only compared files present on both sides would
   * have reported that major as eleven files changed and nothing removed.
   */
  filesRemoved: string[];
}

export interface WeightChange {
  before: number | null;
  after: number;
  packagesBefore: number | null;
  packagesAfter: number;
}

export interface IssueInput {
  /** The name we call it by. */
  name: string;
  /** The npm package fingerprinted, shown when it differs from the name. */
  npm: string;
  from: string | null;
  to: string;
  /** sha1 of the tarball every number here was computed from. */
  shasum: string;
  surface: SurfaceChange;
  weight: WeightChange;
  claims: ClaimSite[];
}

const RANK: Record<Claim, number> = { surface: 0, weight: 1, compat: 2 };
const strongest = (claims: ClaimSite[]): Claim =>
  claims.reduce<Claim>((best, c) => (RANK[c.claim] > RANK[best] ? c.claim : best), 'surface');

const thousands = (n: number): string => n.toLocaleString('en-US');
const code = (names: string[]): string => names.map((n) => `\`${n}\``).join(', ');

const PERCENT = 100;
const ONE_DP = 1;

function weightCell(w: WeightChange): string {
  if (w.before === null) return `${thousands(w.after)} B across ${w.packagesAfter} packages (first fingerprint)`;
  if (w.before === w.after) return `${thousands(w.after)} B — unchanged`;
  const delta = ((w.after - w.before) / w.before) * PERCENT;
  const sign = delta > 0 ? '+' : '';
  const packages = w.packagesBefore === w.packagesAfter ? `${w.packagesAfter}` : `${String(w.packagesBefore)} → ${w.packagesAfter}`;
  return `${thousands(w.before)} → ${thousands(w.after)} B (${sign}${delta.toFixed(ONE_DP)}%) across ${packages} packages`;
}

const MAX_LISTED = 12;

/** A cell that stays a cell: long lists are cut with a count rather than wrapping the table. */
function listCell(names: string[]): string {
  if (names.length === 0) return '—';
  if (names.length <= MAX_LISTED) return code(names);
  return `${code(names.slice(0, MAX_LISTED))} … and ${names.length - MAX_LISTED} more`;
}

function whatChanged(input: IssueInput): string {
  const rows = [
    ['exports added', listCell(input.surface.added)],
    ['exports removed', listCell(input.surface.removed)],
    ['weight', weightCell(input.weight)],
    ['files changed', input.surface.filesChanged.length === 0 ? '—' : listCell(input.surface.filesChanged)],
    ['files added', listCell(input.surface.filesAdded)],
    ['files removed', listCell(input.surface.filesRemoved)],
    ['tarball sha1', `\`${input.shasum}\``],
  ];
  return `### What changed\n\n| | |\n| :-- | :-- |\n${rows.map(([k, v]) => `| ${String(k)} | ${String(v)} |`).join('\n')}\n`;
}

/** The weight moved, so anywhere we printed the old figure now prints a false one. */
function staleCitations(site: ClaimSite, moved: boolean): string[] {
  if (!moved || site.citations.length === 0) return [];
  return site.citations.map((c) => {
    const at = c.line === null ? c.file : `${c.file}:${String(c.line)}`;
    return `- \`${at}\` — ${c.text.trim()}`;
  });
}

const isAre = (n: number): string => (n === 1 ? 'is' : 'are');
const itThem = (n: number): string => (n === 1 ? 'it' : 'them');

/** What a graded façade owes when the suite it is graded by moves. */
function compatCost(subject: string, input: IssueInput): string[] {
  const lines = [`${subject} claims **compat** against ${input.name} and is graded by its own suite.`];
  const { added, removed, filesRemoved } = input.surface;
  if (added.length > 0) lines.push(`${code(added)} ${isAre(added.length)} new upstream — the grade is now against a suite that has moved.`);
  if (removed.length > 0) lines.push(`${code(removed)} ${isAre(removed.length)} gone upstream. Dropping ${itThem(removed.length)} from a façade is a decision, not a follow.`);
  if (filesRemoved.length > 0) lines.push(`It stopped shipping ${code(filesRemoved)} — an entry point that disappears breaks callers who import it, whatever the name list says.`);
  return lines;
}

function claimLines(site: ClaimSite, subject: string, input: IssueInput): string[] {
  if (site.claim === 'compat') return compatCost(subject, input);
  if (site.claim === 'weight') return [`${subject} claims a **weight ceiling** against ${input.name}.`];
  return [`${subject} intends **surface** parity with ${input.name}; nothing is graded yet, so nothing is broken.`];
}

function costOfClaim(site: ClaimSite, input: IssueInput, moved: boolean): string {
  const subject = `\`${site.owner}${site.subpath.slice(1)}\``;
  const lines = claimLines(site, subject, input);
  const stale = staleCitations(site, moved);
  if (stale.length > 0) {
    lines.push(`${stale.length === 1 ? 'This published figure is' : 'These published figures are'} now stale:`);
    lines.push(...stale);
  }
  return lines.join('\n');
}

function whatItCosts(input: IssueInput): string {
  if (input.claims.length === 0) return '### What it costs us\n\nNothing in the family claims anything against this package.\n';
  const moved = input.weight.before !== null && input.weight.before !== input.weight.after;
  const body = input.claims.map((site) => costOfClaim(site, input, moved)).join('\n\n');
  return `### What it costs us\n\n${body}\n`;
}

export type Bump = 'major' | 'minor' | 'patch';

/**
 * What the change is worth, decided rather than guessed (design: "How the bump level is
 * decided"). An added export on a package we are graded by is new surface to reach —
 * `minor`. A *removed* export proposes no bump at all: a façade dropping a method is a
 * decision somebody makes, and an issue that proposes `major` for it would be proposing
 * that decision. A weight-only move touches numbers, not code — `patch`. A `surface` claim
 * has promised nothing, so there is nothing to bump.
 */
export function proposeBump(input: IssueInput): Bump | null {
  const claim = strongest(input.claims);
  if (claim === 'surface' || input.claims.length === 0) return null;
  if (input.surface.removed.length > 0 || input.surface.filesRemoved.length > 0) return null;
  if (claim === 'compat' && input.surface.added.length > 0) return 'minor';
  if (input.weight.before !== null && input.weight.before !== input.weight.after) return 'patch';
  if (input.surface.added.length > 0) return 'patch';
  return null;
}

/** The package a changeset would name: the owner of the strongest claim. */
function bumpTarget(input: IssueInput): ClaimSite | null {
  const claim = strongest(input.claims);
  return input.claims.find((c) => c.claim === claim) ?? null;
}

function changesetBlock(input: IssueInput): string {
  const bump = proposeBump(input);
  const site = bumpTarget(input);
  if (bump === null || site === null) {
    const dropped = [...input.surface.removed, ...input.surface.filesRemoved];
    if (dropped.length > 0) {
      return `No changeset is proposed. ${input.name} ${input.to} **removed** ${code(dropped)}, and whether a façade follows a removal is a decision for a person — proposing a bump here would be proposing that decision.\n`;
    }
    return `No changeset is proposed: the claim against ${input.name} is \`surface\`, so nothing we published has moved.\n`;
  }
  const subject = `\`${site.owner}${site.subpath.slice(1)}\``;
  const headline =
    input.surface.added.length > 0
      ? `${subject} follows ${input.name} ${input.to}: adds ${code(input.surface.added)}.`
      : `${subject} restates its ${input.name} comparison against ${input.name} ${input.to}.`;
  const weightLine =
    input.weight.before === null || input.weight.before === input.weight.after
      ? ''
      : `\n\nThe weight comparison moves with it — ${input.name} ${input.to} is ${thousands(input.weight.after)} B across ${input.weight.packagesAfter} packages, against ${thousands(input.weight.before)} B at ${input.from ?? 'the last fingerprint'}.`;
  return ['```changeset', '---', `'${site.owner}': ${bump}`, '---', '', `${headline}${weightLine}`, '```'].join('\n');
}

/** One line per file, with the lines to look at — not one item per citation. */
function citationItems(input: IssueInput, site: ClaimSite): string[] {
  if (input.weight.before === null || input.weight.before === input.weight.after) return [];
  const byFile = new Map<string, number[]>();
  for (const c of site.citations) {
    const lines = byFile.get(c.file) ?? [];
    if (c.line !== null) lines.push(c.line);
    byFile.set(c.file, lines);
  }
  return [...byFile].map(([file, lines]) => {
    const where = lines.length === 0 ? '' : `:${lines.join(', ')}`;
    return `- [ ] \`${file}${where}\` — the ${input.name} figure`;
  });
}

function checklist(input: IssueInput): string {
  const items = input.claims.flatMap((site) => [...site.targets.map((target) => `- [ ] \`${target}\``), ...citationItems(input, site)]);
  const unique = [...new Set(items)];
  // Nothing invented: a checklist naming a file that does not exist teaches people to skim,
  // and so does a checklist of twelve near-identical lines in the same file.
  return unique.length === 0 ? '_No file in the tree could be derived for this change._\n' : `${unique.join('\n')}\n`;
}

function whatToDo(input: IssueInput): string {
  return `### What our change should be\n\n${checklist(input)}\n${changesetBlock(input)}\n`;
}

/** The title the workflow dedupes on: one issue per (competitor, version). */
export const issueTitle = (name: string, version: string): string => `upstream: ${name} ${version} released`;

/**
 * The whole body. Pure — the same input renders the same bytes, which is what R8 asserts.
 */
export function renderIssue(input: IssueInput): string {
  const named = input.npm === input.name ? input.name : `${input.name} (\`${input.npm}\`)`;
  const from = input.from ?? 'no fingerprint';
  const kind = input.from === null ? 'first fingerprint' : bumpKind(input.from, input.to);
  const head = `## ${named}: ${from} → ${input.to}\n\nA ${kind} release. Fingerprinted from the published tarball, read-only — no install, nothing executed.\n`;
  return [head, whatChanged(input), whatItCosts(input), whatToDo(input)].join('\n');
}
