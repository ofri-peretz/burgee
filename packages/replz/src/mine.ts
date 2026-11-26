/**
 * Rule candidates from review history (replz-mine intent): a finding a reviewer keeps writing by
 * hand, in two or more pull requests, is a lint rule or lock test nobody has written yet. This file
 * reads findings and clusters them; `gh` is called by the command, as `propose` calls git. Nothing
 * becomes a rule by itself: the draft is for a person to accept or delete in a pull request.
 */

/** One review comment on a pull request, as the `gh api` queries in `GH_QUERIES` print it. */
export interface Comment {
  readonly pr: number;
  readonly author: string;
  readonly body: string;
  /** A reply in a review thread restates its parent, so it is not a finding of its own. */
  readonly reply: boolean;
  /** Inline: anchored to a diff line, so the whole comment is one finding. */
  readonly inline: boolean;
}

/** One finding: what a reviewer said about one pull request. */
export interface Finding {
  readonly pr: number;
  readonly author: string;
  readonly text: string;
}

/** A pattern seen in two or more pull requests. */
export interface Candidate {
  /** The two content words the findings share, as a reviewer wrote them. */
  readonly phrase: string;
  readonly prs: readonly number[];
  /** One finding per pull request, newest pull request first. */
  readonly examples: readonly Finding[];
}

/**
 * Authors whose comments are a rule already firing (code scanning, dependency and deploy bots), so
 * a repeat of theirs is a rule that works, not one that is missing.
 */
export const RULE_BOTS: ReadonlySet<string> = new Set([
  'github-advanced-security[bot]',
  'dependabot[bot]',
  'vercel[bot]',
  'codecov[bot]',
  'sonarqubecloud[bot]',
  'github-actions[bot]',
]);

/** The `gh api` paths and jq filters whose lines `parseComments` reads, given the repo and a since date. */
export const ghQueries = (slug: string, since: string): readonly (readonly string[])[] => [
  [
    'api',
    '--paginate',
    `repos/${slug}/pulls/comments?per_page=100&since=${since}T00:00:00Z`,
    '--jq',
    '.[] | {pr: (.pull_request_url | split("/") | last | tonumber), author: .user.login, body, reply: (.in_reply_to_id != null), inline: true}',
  ],
  [
    'api',
    '--paginate',
    `repos/${slug}/issues/comments?per_page=100&since=${since}T00:00:00Z`,
    '--jq',
    '.[] | select(.html_url | test("/pull/")) | {pr: (.html_url | capture("/pull/(?<n>[0-9]+)").n | tonumber), author: .user.login, body, reply: false, inline: false}',
  ],
];

/** The lines `gh api --jq` printed, one JSON comment each; a blank line is skipped. */
export const parseComments = (lines: string): Comment[] =>
  lines
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as Comment);

/**
 * A line that opens a finding in a summary comment: a severity tag first, under any heading or bold
 * mark (`#### [Nit] …`, `**[Important]** …`), or a bold rule id followed by one (`` **`rule`** — [Nit] ``).
 */
const TAGGED = /^(?:#+\s*)?(?:\*\*)?(?:`[^`]+`(?:\*\*)?\s*[—-]\s*)?\[(?:Important|Nit|Pre-existing)\]/u;

/**
 * The findings in one comment. An inline comment is one finding. A summary comment holds as many
 * as it has lines that open with a severity tag; its counts line (`0 [Important], 1 [Nit]`) and
 * everything else in it are not findings.
 */
export const findingsOf = (comment: Comment): Finding[] => {
  if (comment.reply || RULE_BOTS.has(comment.author)) return [];
  const { pr, author } = comment;
  if (comment.inline) return [{ pr, author, text: prose(comment.body) }];
  return comment.body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => TAGGED.test(line))
    .map((text) => ({ pr, author, text }));
};

/**
 * `text` with every run from `open` to the first `close` after it replaced by a space, as a lazy
 * `open[\s\S]*?close` would, in one pass: the regular expression is polynomial on a comment that
 * repeats `open` with no `close` (CodeQL js/polynomial-redos), and review comments are anyone's.
 */
export const cut = (text: string, open: string, close: string): string => {
  const parts: string[] = [];
  let at = 0;
  for (let start = text.indexOf(open); start !== -1; start = text.indexOf(open, at)) {
    const end = text.indexOf(close, start + open.length);
    if (end === -1) break;
    parts.push(text.slice(at, start), ' ');
    at = end + close.length;
  }
  parts.push(text.slice(at));
  return parts.join('');
};

/**
 * What a reviewer wrote, without the machinery around it: HTML comments, folded `<details>` (a
 * bot's prompt for an agent), fenced code (a suggested patch), tags, badge lines and status lines.
 */
export const prose = (body: string): string =>
  [
    ['<!--', '-->'],
    ['<details>', '</details>'],
    ['```', '```'],
    ['<', '>'],
  ]
    .reduce((text, [open, close]) => cut(text, open as string, close as string), body)
    .split('\n')
    .filter((line) => !BADGES.test(line.trim()) && !line.trim().startsWith('✅'))
    .join('\n')
    .trim();

/**
 * A line of bold badges only, `**Major** · **Security** · **Quick win**`: a bot's labels, not its
 * words. A line opening with ✅ is a bot's status (`✅ Addressed in commit …`), not a finding either.
 */
const BADGES = /^\*\*[^*]*\*\*(?:\s*·\s*\*\*[^*]*\*\*)+$/u;

/** Words that say nothing about the code a finding points at. */
const STOP: ReadonlySet<string> = new Set(
  (
    'the a an and or but not no nor for of on in at to from by with without into onto over under is are was were be been being ' +
    'it its this that these those there here which who whom whose what when where why how than then so as if else also only ' +
    'can could should would will may might must do does did done has have had having one two all any each every some more most ' +
    'other such same own both few very just now new old line lines file files change changes changed diff pull request important ' +
    'nit pre-existing existing finding findings previous round review comment commit commits test tests added adds add uses use used fix fixes repo run runs npm you your want consider either note please addressed though'
  ).split(' '),
);

/**
 * The content words of a finding, in order, lower-cased: code spans and links lose their marks but
 * keep their words, and paths, line numbers and hashes are dropped, because the pattern is what was
 * wrong, not where.
 */
export const wordsOf = (text: string): string[] =>
  cut(text, '](', ')')
    // Stryker disable next-line StringLiteral: equivalent, a URL runs to whitespace, so its replacement always sits beside a separator
    .replace(/https?:\/\/\S+/gu, ' ')
    .toLowerCase()
    // Stryker disable next-line Regex: equivalent, splitting a run one character at a time leaves empty words, which the length filter drops
    .split(/[^a-z0-9_.:/-]+/u)
    .map((word) => word.replace(/^[.:/-]+|[.:/-]+$/gu, ''))
    .filter((word) => word.length > 2 && !STOP.has(word) && !/[/.:]/u.test(word) && !/\d/u.test(word));

/** Neighbouring content words, `a b`, each once per finding. */
const pairsOf = (text: string): Set<string> => {
  const words = wordsOf(text);
  return new Set(words.slice(1).map((word, at) => `${words[at] as string} ${word}`));
};

export interface MineOptions {
  /** Pull requests a pattern needs (default 2). */
  readonly minPrs: number;
  /** The most candidates to draft. */
  readonly limit: number;
}

const isSubset = (small: readonly number[], large: ReadonlySet<number>): boolean => small.every((pr) => large.has(pr));

/**
 * Cluster findings into candidates: every pair of neighbouring content words seen in `minPrs` or
 * more pull requests, most pull requests first. A pair whose pull requests all sit under a pair
 * already drafted is the same pattern again and is dropped, so each cluster is drafted once.
 */
export const mine = (findings: readonly Finding[], options: MineOptions): Candidate[] => {
  const byPair = new Map<string, Map<number, Finding>>();
  for (const finding of findings) {
    for (const pair of pairsOf(finding.text)) {
      const prs = byPair.get(pair) ?? new Map<number, Finding>();
      if (!prs.has(finding.pr)) prs.set(finding.pr, finding);
      byPair.set(pair, prs);
    }
  }
  const ranked = [...byPair.entries()].filter(([, prs]) => prs.size >= options.minPrs).sort(([a, x], [b, y]) => y.size - x.size || a.localeCompare(b));
  const drafted: { candidate: Candidate; prs: Set<number> }[] = [];
  for (const [phrase, prs] of ranked) {
    if (drafted.length >= options.limit) break;
    const numbers = [...prs.keys()].sort((a, b) => b - a);
    if (drafted.some((done) => isSubset(numbers, done.prs))) continue;
    drafted.push({
      candidate: {
        phrase,
        prs: numbers,
        examples: numbers.map((pr) => prs.get(pr) as Finding),
      },
      prs: new Set(numbers),
    });
  }
  return drafted.map((done) => done.candidate);
};

/** A finding cut to one line a person can read in a list. */
const EXAMPLE_CHARS = 200;
const oneLine = (text: string): string => {
  const flat = text.replace(/\s+/gu, ' ').trim();
  return flat.length > EXAMPLE_CHARS ? `${flat.slice(0, EXAMPLE_CHARS - 1)}…` : flat;
};

/** The draft file: each candidate, its pull requests and one finding from each, for a person to accept or delete. */
export const candidatesMarkdown = (
  candidates: readonly Candidate[],
  meta: {
    readonly slug: string;
    readonly since: string;
    readonly findings: number;
  },
): string => {
  const head = [
    `# Rule candidates for ${meta.slug}`,
    '',
    `Drafted by \`replz mine\` from ${String(meta.findings)} review finding(s) since ${meta.since}. Each pattern below was`,
    'written by hand in two or more pull requests. Turn one into a lint rule or lock test in a pull',
    'request, or delete it: nothing here is a rule until a person makes it one.',
  ];
  const body = candidates.flatMap((candidate, at) => [
    '',
    `## ${String(at + 1)}. "${candidate.phrase}": ${String(candidate.prs.length)} pull requests`,
    '',
    ...candidate.examples.map((example) => `- #${String(example.pr)}: ${oneLine(example.text)}`),
  ]);
  return `${[...head, ...body].join('\n')}\n`;
};
