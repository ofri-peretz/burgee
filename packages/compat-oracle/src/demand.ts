/**
 * What an incumbent's own users asked it for, and what it refused.
 *
 * `upstream.ts` measures what a release *changed*. This measures what the community
 * *wants* — from the only source that is not our opinion: the issues the incumbent's own
 * users opened on the incumbent's own tracker.
 *
 * ## The measurement that rewrote this step
 *
 * The plan said "top 20 open issues by reactions". Measured across nine incumbents on
 * 2026-09-13, that returns almost nothing: **chalk has 0 open issues, ora 1, ansi-escapes
 * 1, dotenv 1.** These maintainers close aggressively, and an empty open tracker is a
 * statement about the maintainer's habits, not about demand.
 *
 * The signal is in the **closed** ones. A feature closed with 165 reactions still on it
 * (`dotenv#89`, "Importing dotenv in ES6") is a *stronger* signal than an open one,
 * because the incumbent has already refused it — nobody is going to ship it there, and a
 * replacement that does ship it takes those users. So both states are mined, and the close
 * reason is carried into the table rather than thrown away.
 *
 * The floor moved with it. `reactions:>=50` yielded **5** issues across nine repos;
 * `>=10` yields **86**. Fifty was a guess that measured nothing.
 *
 * ## Reading a file this produces
 *
 * An empty file is a measurement, not a failure. paratext's incumbents genuinely have no
 * demand signal at any threshold, and the honest record of that is a row saying so — which
 * is itself a finding about the layer: there is no community pain to relieve there, so a
 * claim against it can only be weight or consolidation, never "we fixed what they would
 * not".
 */

/** A package in the family and the incumbents it names, from `.sdlc/PLAN.md`'s layer table. */
export interface Layer {
  /** The workspace package. */
  pkg: string;
  /** Its intent directory under `.sdlc/intents/`, which is not always the package name. */
  intent: string;
  incumbents: string[];
}

/**
 * The nine layers and their twenty-five incumbents, as the plan's own table names them.
 *
 * Written out rather than derived: four packages declare a `competitors.json` and five do
 * not, so deriving would silently mine four layers and call it nine. `burgee`'s intent is
 * still filed under its legacy slug — PLAN step 0.1 renames it, and this follows the tree.
 */
export const LAYERS: Layer[] = [
  { pkg: 'burgee', intent: 'agent-native-cli-layer', incumbents: ['commander', 'yargs'] },
  { pkg: 'roundel', intent: 'roundel', incumbents: ['chalk'] },
  { pkg: 'flagstaff', intent: 'flagstaff', incumbents: ['ora', 'log-update', 'boxen', 'cli-table3'] },
  { pkg: 'caique', intent: 'caique', incumbents: ['inquirer', 'clack'] },
  { pkg: 'linegauge', intent: 'linegauge', incumbents: ['string-width', 'wrap-ansi', 'strip-ansi', 'slice-ansi'] },
  { pkg: 'paratext', intent: 'paratext', incumbents: ['ansi-escapes', 'terminal-link', 'term-img'] },
  { pkg: 'seniority', intent: 'seniority', incumbents: ['cosmiconfig', 'dotenv', 'rc'] },
  { pkg: 'closeout', intent: 'closeout', incumbents: ['signal-exit', 'exit-hook', 'restore-cursor'] },
  { pkg: 'bellpull', intent: 'bellpull', incumbents: ['execa', 'cross-spawn', 'which'] },
];

/**
 * The reaction floor for a closed issue, measured rather than chosen: 50 yielded 5 issues
 * across nine repos and 10 yields 86. Open issues carry no floor — there are so few that
 * every one is worth reading.
 */
export const REACTION_FLOOR = 10;

/** Issues per query. GitHub's search caps a page at 100; twenty is the plan's ask. */
export const TOP_N = 20;

export type IssueState = 'open' | 'closed';

/** The search string for one query. Two per incumbent: everything open, and the loud closed ones. */
export const searchQuery = (repo: string, state: IssueState, floor = REACTION_FLOOR): string =>
  state === 'open' ? `repo:${repo} is:issue is:open` : `repo:${repo} is:issue is:closed reactions:>=${floor}`;

export interface MinedIssue {
  number: number;
  title: string;
  url: string;
  state: IssueState;
  reactions: number;
  /** GitHub's own `state_reason`: `completed`, `not_planned`, `duplicate`, or null. */
  closeReason: string | null;
  created: string;
}

/** One item of a `search/issues` response, narrowed to what a row needs. */
export interface SearchItem {
  number: number;
  title: string;
  html_url: string;
  state: string;
  state_reason?: string | null;
  created_at: string;
  reactions?: { total_count?: number };
  pull_request?: unknown;
}

/**
 * `search/issues` answers with pull requests too when a query does not exclude them, and a
 * PR is not a request for a feature. `is:issue` handles it; this is the belt to that brace,
 * because a PR counted as demand would be demand for something already written.
 */
export const isIssue = (item: SearchItem): boolean => item.pull_request === undefined;

export const fromSearchItem = (item: SearchItem): MinedIssue => ({
  number: item.number,
  title: item.title,
  url: item.html_url,
  state: item.state === 'open' ? 'open' : 'closed',
  reactions: item.reactions?.total_count ?? 0,
  closeReason: item.state_reason ?? null,
  created: item.created_at.slice(0, 'YYYY-MM-DD'.length),
});

export interface Section {
  incumbent: string;
  /** `owner/name`, resolved from the registry; absent when the package declares no repo. */
  repo: string | null;
  open: MinedIssue[];
  closed: MinedIssue[];
  /** Set when a query could not be run at all, so an outage never reads as "no demand". */
  error?: string;
}

/** What a row with nothing in it says. An empty result is a measurement, so it gets words. */
export const noSignal = (section: Section): string =>
  `no demand signal (${section.open.length} open, ${section.closed.length} >=${REACTION_FLOOR} closed)`;

const CITATION = /([A-Za-z0-9@/._-]+)#(\d+)/g;

/**
 * Every `<incumbent>#<number>` written anywhere in our own sources. That is the form PLAN
 * step 4.2 counts, and it is what makes `covered:` a fact rather than an opinion: an issue
 * is covered when a file in the package that replaces the incumbent names it.
 */
export function citations(sources: string[]): Set<string> {
  const found = new Set<string>();
  for (const source of sources) for (const m of source.matchAll(CITATION)) found.add(`${m[1]}#${m[2]}`);
  return found;
}

export const isCovered = (incumbent: string, issue: MinedIssue, cited: Set<string>): boolean =>
  cited.has(`${incumbent}#${issue.number}`);

/** Pipes inside an upstream title would end the table cell they sit in. */
const cell = (text: string): string => text.replaceAll('|', '\\|').replaceAll('\n', ' ').trim();

const closedAs = (issue: MinedIssue): string =>
  issue.state === 'open' ? '—' : (issue.closeReason ?? 'closed, no reason recorded');

function table(section: Section, cited: Set<string>): string[] {
  const rows = [...section.closed, ...section.open]
    .sort((a, b) => b.reactions - a.reactions)
    .map((i) => {
      const covered = isCovered(section.incumbent, i, cited) ? 'yes' : 'no';
      return `| ${i.state} | ${i.reactions} | [#${i.number}](${i.url}) | ${cell(i.title)} | ${closedAs(i)} | ${i.created} | ${covered} |`;
    });
  return ['| state | reactions | issue | title | closed as | opened | covered |', '| :-- | --: | :-- | :-- | :-- | :-- | :-- |', ...rows];
}

/**
 * A query that came back full was truncated by the page size, so its count is a floor and
 * not a total. Saying so matters: `cross-spawn 20 open` reads as a complete tracker and is
 * in fact the top twenty of an unknown number.
 */
export function capNotes(section: Section): string[] {
  const full = (['open', 'closed'] as const).filter((state) => section[state].length >= TOP_N);
  return full.length === 0 ? [] : [`*Top ${TOP_N} by reactions; the ${full.join(' and ')} count is a floor, not a total.*`, ''];
}

export interface PageMeta {
  /** ISO date the queries ran. */
  measured: string;
  /** Distinct `<name>#<n>` citations across the package's own sources, today. PLAN 4.2's baseline. */
  citationCount: number;
}

/** The whole `.sdlc/intents/<slug>/issues.md`. Generated: a hand edit is lost on the next run. */
export function renderIssuesPage(layer: Layer, sections: Section[], meta: PageMeta, cited: Set<string>): string {
  const open = sections.reduce((n, s) => n + s.open.length, 0);
  const closed = sections.reduce((n, s) => n + s.closed.length, 0);
  const head = [
    `# ${layer.pkg} — demand signal from its incumbents' trackers`,
    '',
    `Generated by \`scripts/mine-issues.ts\` on ${meta.measured}. **Do not hand-edit** — the next run overwrites it.`,
    '',
    `Two queries per incumbent, both \`sort=reactions order=desc\`: every **open** issue, and every **closed** issue`,
    `carrying at least ${REACTION_FLOOR} reactions. Closed is where the signal is: these maintainers close aggressively, and a`,
    `feature the incumbent has already refused is a stronger opening than one it might still ship. \`covered:\` is \`yes\``,
    `when a file under \`packages/${layer.pkg}/\` cites the issue as \`<incumbent>#<number>\`; today ${layer.pkg} carries`,
    `${meta.citationCount} such citation(s) in total.`,
    '',
    `**${sections.length} incumbent(s) · ${open} open · ${closed} closed at >=${REACTION_FLOOR} reactions.**`,
    '',
  ];
  const body = sections.flatMap((section) => {
    const title = `## ${section.incumbent}${section.repo === null ? '' : ` — \`${section.repo}\``}`;
    if (section.error !== undefined) return [title, '', `**Not measured:** ${section.error}`, ''];
    if (section.open.length === 0 && section.closed.length === 0) return [title, '', noSignal(section), ''];
    return [title, '', ...capNotes(section), ...table(section, cited), ''];
  });
  return `${[...head, ...body].join('\n')}`;
}
