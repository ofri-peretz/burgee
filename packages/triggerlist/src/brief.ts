/**
 * What the reviewer is handed for one round (spec R5): the rules as the base branch has them, the
 * items this diff fires, its own findings from the round before, the author's replies to them since,
 * and the commit it reviews. The
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
  /** When it was posted (ISO 8601, UTC), so the author's later replies can be told apart. */
  readonly created_at?: string | null;
}

/** The last comment that carries the marker: the previous round's summary, if any. */
export const previousRound = (comments: readonly Comment[]): Comment | undefined => comments.findLast((comment) => comment.body?.includes(MARKER) === true);

/** The body of the last comment that carries the marker: the previous round's findings, if any. */
export const previousFindings = (comments: readonly Comment[]): string | undefined => previousRound(comments)?.body ?? undefined;

/**
 * A PR conversation comment or review-thread comment, as `gh api .../issues/<n>/comments` and
 * `gh api .../pulls/<n>/comments` list them: a reply the author made to the reviewer.
 */
export interface Reply extends Comment {
  readonly user?: { readonly login?: string | null; readonly type?: string | null } | null;
  /** The file a review-thread comment sits on; absent on a conversation comment. */
  readonly path?: string | null;
  readonly line?: number | null;
}

/** At most this many replies reach the brief: the latest ones. */
export const MAX_REPLIES = 10;
/** A reply longer than this is cut: the reviewer needs the argument, not the whole essay. */
export const MAX_REPLY_CHARS = 1200;

const isBot = (reply: Reply): boolean => reply.user?.type === 'Bot' || (reply.user?.login ?? '').endsWith('[bot]');

/**
 * The replies posted after the previous round, oldest first, bots left out, each trimmed. None when
 * there was no previous round (nothing to answer) or it carries no time to count from.
 */
export const repliesSince = (replies: readonly Reply[], since: string | null | undefined): Reply[] => {
  if (since === undefined || since === null || since === '') return [];
  const after = Date.parse(since);
  if (Number.isNaN(after)) return [];
  return replies
    .filter((reply) => !isBot(reply) && (reply.body ?? '').trim() !== '' && Date.parse(reply.created_at ?? '') > after)
    .toSorted((a, b) => Date.parse(a.created_at ?? '') - Date.parse(b.created_at ?? ''))
    .slice(-MAX_REPLIES)
    .map((reply) => {
      const body = (reply.body ?? '').trim();
      return { ...reply, body: body.length > MAX_REPLY_CHARS ? `${body.slice(0, MAX_REPLY_CHARS).trimEnd()} [trimmed]` : body };
    });
};

/** One reply as the brief quotes it: who, when, where, then the body as a block quote. */
const replyText = (reply: Reply): string => {
  const line = reply.line ? `:${reply.line}` : '';
  const where = reply.path ? ` on ${reply.path}${line}` : '';
  const quoted = (reply.body ?? '')
    .split('\n')
    .map((line) => `> ${line}`.trimEnd())
    .join('\n');
  return [`- @${reply.user?.login ?? 'unknown'}, ${reply.created_at ?? 'at an unrecorded time'}${where}:`, '', quoted].join('\n');
};

/** The head a previous review recorded in its marker, if it has one. */
export const reviewedHead = (findings: string | undefined): string | undefined => findings?.match(/\u003C!-- triggerlist-review head=([0-9a-f]+) --\u003E/u)?.[1];

export interface Brief {
  /** Where the rules were read from: `<base>:REVIEW.md`. */
  readonly rules: string;
  readonly rulesText: string;
  readonly range: string;
  readonly fired: readonly Fired[];
  readonly previous: string | undefined;
  /** The author's replies since the previous round, already chosen by {@link repliesSince}. */
  readonly replies?: readonly Reply[] | undefined;
  readonly head: string;
}

/** The brief as the reviewer reads it: four sections, then the marker its summary must end with. */
export const briefText = (brief: Brief): string => {
  const before = reviewedHead(brief.previous);
  const replies = brief.previous === undefined ? [] : (brief.replies ?? []);
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
    ...(replies.length === 0
      ? []
      : [
          '## The author\'s replies since that round',
          '',
          'A finding the author answered here is not repeated unless the new diff changes the facts it rests on. Instead, say in one line that it was answered and why that answer holds or does not.',
          '',
          replies.map(replyText).join('\n\n'),
          '',
        ]),
    '## The commit under review',
    '',
    `${brief.head}. End your one summary comment with this line, exactly:`,
    '',
    markerFor(brief.head),
  ].join('\n');
};
