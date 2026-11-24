/**
 * What the reviewer is handed for one round (spec R5): the rules as the base branch has them, the
 * items this diff fires, its own findings from the round before, and the commit it reviews. The
 * base copy of REVIEW.md is the point: a pull request that edits the rules is still reviewed by
 * the rules it did not write.
 */
import { type Fired, toText } from './match.js';

// The HTML comment delimiters are escaped: a module may not hold a bare `<!--` or `-->` token, and
// the mutation lane's rewritten copy of this file must parse too.
const OPEN = '\u003C!--';
const CLOSE = '--\u003E';

/** The line a review summary ends with, so the next round finds it among the PR's comments. */
export const MARKER = `${OPEN} triggerlist-review`;

/** The marker line for a review of `head`. */
export const markerFor = (head: string): string => `${MARKER} head=${head} ${CLOSE}`;

/** A PR comment as `gh api repos/<owner>/<repo>/issues/<n>/comments` lists it. */
export interface Comment {
  readonly body?: string | null;
}

/** The body of the last comment that carries the marker: the previous round's findings, if any. */
export const previousFindings = (comments: readonly Comment[]): string | undefined => comments.findLast((comment) => comment.body?.includes(MARKER) === true)?.body ?? undefined;

/** The head a previous review recorded in its marker, if it has one. */
export const reviewedHead = (findings: string | undefined): string | undefined => findings?.match(/\u003C!-- triggerlist-review head=([0-9a-f]+) --\u003E/u)?.[1];

export interface Brief {
  /** Where the rules were read from: `<base>:REVIEW.md`. */
  readonly rules: string;
  readonly rulesText: string;
  readonly range: string;
  readonly fired: readonly Fired[];
  readonly previous: string | undefined;
  readonly head: string;
}

/** The brief as the reviewer reads it: four sections, then the marker its summary must end with. */
export const briefText = (brief: Brief): string => {
  const before = reviewedHead(brief.previous);
  return [
    `## The rules (${brief.rules}, as the base branch has them)`,
    '',
    brief.rulesText.trim(),
    '',
    `## The rules this diff fires (${brief.range})`,
    '',
    toText(brief.fired, brief.range),
    '',
    '## Your findings from the previous round',
    '',
    brief.previous === undefined
      ? 'None: this is the first review of this pull request.'
      : [`Reviewed at ${before ?? 'an unrecorded head'}. Say which of these the new commits fixed, and do not repeat a finding that still stands unless it changed.`, '', brief.previous.trim()].join('\n'),
    '',
    '## The commit under review',
    '',
    `${brief.head}. End your one summary comment with this line, exactly:`,
    '',
    markerFor(brief.head),
  ].join('\n');
};
