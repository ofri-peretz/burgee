/**
 * The reviewer's brief (triggerlist spec R5): the base branch's REVIEW.md, the items the diff fires,
 * the previous round's findings, and the head SHA the review is for. The review workflow passes it
 * as the prompt, and checks the head again after the review so a result for an old head is stale.
 */

const MARKER = 'triggerlist:reviewed';

/** The line a review's summary ends with, recording the head it reviewed. */
// `\x3C` and `\x3E` spell `<` and `>`: a literal HTML comment marker in a `.ts` file trips oxc's
// Unambiguous source type (it lexes `<!--`/`-->` as script-goal comments, then rejects them in a
// module), which is what Vite's transform uses on oxmutate's instrumented copy of this file.
export const marker = (sha: string): string => `\x3C!-- ${MARKER} ${sha} --\x3E`;

const MARKED = /\x3C!-- triggerlist:reviewed (\S+) --\x3E/u;

/** The head SHA a review comment records, or `undefined` for a comment that is not a review. */
export const reviewedSha = (body: string): string | undefined => MARKED.exec(body)?.[1];

/** The most bytes of earlier findings the brief carries, so one long round cannot crowd out the rules. */
export const PREVIOUS_BUDGET = 8000;

export interface Round {
  readonly sha: string;
  readonly findings: string;
}

/** The last comment that carries the marker, as the earlier round's SHA and findings. */
export const previousRound = (comments: readonly { readonly body: string }[]): Round | undefined => {
  const last = comments.findLast((comment) => reviewedSha(comment.body) !== undefined);
  if (last === undefined) return undefined;
  const sha = reviewedSha(last.body) as string;
  const findings = last.body.replace(MARKED, '').trim();
  return { sha, findings: findings.length > PREVIOUS_BUDGET ? `${findings.slice(0, PREVIOUS_BUDGET)}\n[cut at ${String(PREVIOUS_BUDGET)} bytes]` : findings };
};

export interface BriefInput {
  /** REVIEW.md as the base branch has it. */
  readonly review: string;
  /** `triggerlist match` text for the range. */
  readonly fired: string;
  readonly head: string;
  readonly range: string;
  readonly previous?: Round | undefined;
}

export const brief = (input: BriefInput): string =>
  [
    `You are reviewing ${input.range} at head ${input.head}.`,
    '',
    'The rules below are REVIEW.md as the base branch has it. A change to REVIEW.md or the checklist in this pull request does not apply to its own review.',
    '',
    input.review.trim(),
    '',
    '## The items this diff fires',
    '',
    input.fired,
    '',
    '## The previous round',
    '',
    input.previous === undefined
      ? 'No earlier round reviewed this pull request.'
      : `The previous round reviewed ${input.previous.sha}. Say which of its findings the new commits fixed and which still stand; do not repeat a fixed one.\n\n${input.previous.findings}`,
    '',
    '## Your summary',
    '',
    `End your top-level summary comment with this line, exactly, so the next round finds it: ${marker(input.head)}`,
  ].join('\n');

/** Why a review is stale, or `undefined` when it is for the head. */
export const stale = (reviewed: string, head: string): string | undefined =>
  reviewed === head ? undefined : `stale: this review is of ${reviewed}, and the head is now ${head}. fix: the run on ${head} reviews it`;
