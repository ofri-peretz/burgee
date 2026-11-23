/**
 * The two truemark checks a lint rule cannot make, because they are
 * about what a change did rather than what a file says: an assertion moved to
 * a weaker matcher, and a snapshot rewritten with no reason given.
 *
 * Both read only changed lines (a unified diff with `--unified=0`) and the
 * commit messages of the range — never a whole file.
 */

import { message } from './rule.js';

export interface ChangedLine {
  line: number;
  text: string;
}

export interface Hunk {
  removed: ChangedLine[];
  added: ChangedLine[];
}

export interface FileDiff {
  path: string;
  hunks: Hunk[];
}

export interface Finding {
  check: 'weakened-assertion' | 'unexplained-snapshot';
  path: string;
  line: number;
  message: string;
}

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;
const NEW_FILE = '+++ ';

interface ParseState {
  files: FileDiff[];
  file: FileDiff | undefined;
  hunk: Hunk | undefined;
  oldLine: number;
  newLine: number;
}

/** Start a hunk of the current file at the header's line numbers. */
function startHunk(state: ParseState, header: RegExpExecArray): void {
  if (!state.file) return;
  state.hunk = { removed: [], added: [] };
  state.file.hunks.push(state.hunk);
  state.oldLine = Number(header[1]);
  state.newLine = Number(header[2]);
}

/**
 * One line of the diff: a file or hunk header, or a removed or added line of the current hunk.
 * `diff --git` and the metadata lines after it (index, mode, rename, binary) need no case: none
 * starts with `+` or `-`, and the `+++` line that follows resets the file and the hunk.
 */
function read(state: ParseState, raw: string): void {
  if (raw.startsWith(NEW_FILE)) {
    const target = raw.slice(NEW_FILE.length);
    state.file = undefined;
    state.hunk = undefined;
    if (target === '/dev/null') return;
    state.file = { path: target.replace(/^b\//, ''), hunks: [] };
    state.files.push(state.file);
    return;
  }
  if (raw.startsWith('--- ')) return;
  const header = HUNK_HEADER.exec(raw);
  if (header) {
    startHunk(state, header);
    return;
  }
  const { hunk } = state;
  if (!hunk) return;
  if (raw.startsWith('-')) hunk.removed.push({ line: state.oldLine++, text: raw.slice(1) });
  else if (raw.startsWith('+')) hunk.added.push({ line: state.newLine++, text: raw.slice(1) });
}

/** Parse `git diff --unified=0` output into files and hunks. */
export function parseUnifiedDiff(diff: string): FileDiff[] {
  // Stryker disable next-line NumericLiteral: no line is read into a hunk before its header sets both
  const state: ParseState = { files: [], file: undefined, hunk: undefined, oldLine: 0, newLine: 0 };
  for (const raw of diff.split('\n')) read(state, raw);
  return state.files;
}

/**
 * Strictness, strongest first. A change that moves an assertion on the same
 * subject to a lower rank accepts more wrong answers than it did.
 */
export const MATCHER_RANK: Readonly<Record<string, number>> = {
  toBe: 4,
  toStrictEqual: 4,
  toEqual: 3,
  toMatchObject: 2,
  toBeTruthy: 1,
  toBeDefined: 1,
};

const EXPECT = /expect\(/g;
/**
 * What follows `expect(subject)`: the matcher, up to its `(`. `.not.toBe(` does not match —
 * `not` is followed by a dot — so a negated assertion is never read: it is a different claim, not
 * a weaker one.
 */
const MATCHER_CALL = /^\s*\.\s*(\w+)\s*\(/;

interface Call {
  subject: string;
  rest: string;
}

/** The subject inside `expect(` (which opens just before `open`) and the text after its `)`. */
function expectCall(text: string, open: number): Call | undefined {
  let depth = 1;
  for (const [offset, char] of text.slice(open).split('').entries()) {
    if (char === '(') depth++;
    else if (char === ')' && --depth === 0) {
      const close = open + offset;
      return { subject: text.slice(open, close), rest: text.slice(close + 1) };
    }
  }
  return undefined;
}

interface Assertion {
  subject: string;
  matcher: string;
  line: number;
}

function assertions(lines: ChangedLine[]): Assertion[] {
  const found: Assertion[] = [];
  for (const { line, text } of lines) {
    for (const at of text.matchAll(EXPECT)) {
      const call = expectCall(text, at.index + at[0].length);
      if (!call) break;
      const matched = MATCHER_CALL.exec(call.rest);
      if (matched === null) continue;
      // The matcher group always takes part in a match: it is not inside an optional group.
      const matcher = matched[1] as string;
      if (!(matcher in MATCHER_RANK)) continue;
      found.push({ subject: call.subject.replace(/\s/g, ''), matcher, line });
    }
  }
  return found;
}

/** A matcher's rank; only matchers `assertions` kept, which are all in the table, reach it. */
function rank(matcher: string): number {
  return MATCHER_RANK[matcher] as number;
}

const ASSERTION_REASON = /^Assertion:\s*\S/im;

/**
 * Assertions on the same subject that moved to a weaker matcher. An
 * `Assertion: <why>` line in one of the range's commit messages accepts them.
 */
export function weakenedAssertions(files: FileDiff[], commitMessages: string): Finding[] {
  if (ASSERTION_REASON.test(commitMessages)) return [];
  const findings: Finding[] = [];
  for (const file of files) {
    for (const hunk of file.hunks) {
      const before = assertions(hunk.removed);
      for (const after of assertions(hunk.added)) {
        const old = before.find((b) => b.subject === after.subject);
        if (!old) continue;
        if (rank(after.matcher) >= rank(old.matcher)) continue;
        findings.push({
          check: 'weakened-assertion',
          path: file.path,
          line: after.line,
          message: message(
            'Weakened assertion',
            `expect(${after.subject}) moved from .${old.matcher}() to the weaker .${after.matcher}() in this change`,
            `keep the strict matcher and fix the code, or assert the new exact value with .${old.matcher}(). If the looser claim is intended, add an "Assertion: <why>" line to the commit message.`,
          ),
        });
      }
    }
  }
  return findings;
}

const SNAPSHOT_FILE = /\.snap$|(?:^|\/)__snapshots__\//;
const SNAPSHOT_REASON = /^Snapshot:\s*\S/im;

/**
 * A changed snapshot needs a `Snapshot: <reason>` line in one of the range's
 * commit messages — updating a snapshot is how a wrong output becomes the
 * expected one, so the change has to say what it accepts.
 */
export function unexplainedSnapshots(changedPaths: string[], commitMessages: string): Finding[] {
  if (SNAPSHOT_REASON.test(commitMessages)) return [];
  return changedPaths
    .filter((p) => SNAPSHOT_FILE.test(p))
    .map((path) => ({
      check: 'unexplained-snapshot' as const,
      path,
      line: 1,
      message: message(
        'Unexplained snapshot update',
        'A snapshot changed and no commit in the range says why the new output is correct',
        'add a "Snapshot: <what changed and why it is right>" line to the commit message, or revert the snapshot and fix the code.',
      ),
    }));
}
