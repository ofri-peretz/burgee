/**
 * The issue miner's four rules, and the lock that every layer has a measured file.
 *
 * Proven red first (rule 4): before `scripts/mine-issues.ts` ran, the lock failed with
 * `9 layer(s) with no issues.md: agent-native-cli-layer, bellpull, caique, closeout,
 * flagstaff, linegauge, paratext, roundel, seniority`.
 *
 * The rules the unit tests hold are the ones the measurement of 2026-09-13 changed, and
 * each would have shipped a wrong number without them: closed issues have to be mined at
 * all; the floor has to be 10 and not 50; an empty result has to read as a measurement
 * rather than as a gap; and a close reason has to survive into the table, because "refused"
 * and "shipped" are opposite signals wearing the same word, `closed`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  citations,
  fromSearchItem,
  isCovered,
  isIssue,
  LAYERS,
  type MinedIssue,
  noSignal,
  REACTION_FLOOR,
  renderIssuesPage,
  searchQuery,
  type Section,
} from './demand.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const INTENTS = join(REPO_ROOT, '.sdlc', 'intents');

const issue = (over: Partial<MinedIssue> = {}): MinedIssue => ({
  number: 89,
  title: 'Importing dotenv in ES6',
  url: 'https://github.com/motdotla/dotenv/issues/89',
  state: 'closed',
  reactions: 165,
  closeReason: 'completed',
  created: '2016-11-14',
  ...over,
});

const section = (over: Partial<Section> = {}): Section => ({
  incumbent: 'dotenv',
  repo: 'motdotla/dotenv',
  open: [],
  closed: [issue()],
  ...over,
});

describe('the two queries', () => {
  it('asks for every open issue and puts no reaction floor on it', () => {
    expect(searchQuery('chalk/chalk', 'open')).toBe('repo:chalk/chalk is:issue is:open');
  });

  /**
   * The measurement that rewrote the step: chalk has 0 open issues and ora 1, so an
   * open-only mine reports nine incumbents with nothing to say. The closed query is where
   * dotenv#89's 165 reactions live.
   */
  it('asks for closed issues too, at the floor that was measured rather than guessed', () => {
    expect(REACTION_FLOOR).toBe(10);
    expect(searchQuery('motdotla/dotenv', 'closed')).toBe('repo:motdotla/dotenv is:issue is:closed reactions:>=10');
  });

  it('never counts a pull request as demand', () => {
    expect(isIssue({ number: 1, title: 'x', html_url: 'u', state: 'open', created_at: '2020-01-01T00:00:00Z' })).toBe(true);
    expect(isIssue({ number: 1, title: 'x', html_url: 'u', state: 'open', created_at: '2020-01-01T00:00:00Z', pull_request: {} })).toBe(false);
  });

  it('reads the reaction total off the item, and zero when GitHub omits it', () => {
    const base = { number: 7, title: 't', html_url: 'u', state: 'closed', created_at: '2021-02-03T10:00:00Z' };
    expect(fromSearchItem({ ...base, reactions: { total_count: 42 }, state_reason: 'not_planned' })).toMatchObject({
      reactions: 42,
      closeReason: 'not_planned',
      state: 'closed',
      created: '2021-02-03',
    });
    expect(fromSearchItem(base).reactions).toBe(0);
  });
});

describe('the page', () => {
  const meta = { measured: '2026-09-14', citationCount: 0 };
  const layer = { pkg: 'seniority', intent: 'seniority', incumbents: ['dotenv'] };

  /**
   * "Refused with 165 reactions" and "shipped" are opposite signals and GitHub spells both
   * `closed`. Dropping `state_reason` would make an argument for building something look
   * identical to an argument that it already exists.
   */
  it('carries the close reason into the row', () => {
    const page = renderIssuesPage(layer, [section()], meta, new Set());
    expect(page).toContain('| closed | 165 | [#89](https://github.com/motdotla/dotenv/issues/89) | Importing dotenv in ES6 | completed | 2016-11-14 | no |');
  });

  it('records an empty result as a measurement, with both counts', () => {
    const empty = section({ incumbent: 'terminal-link', repo: 'sindresorhus/terminal-link', closed: [] });
    expect(noSignal(empty)).toBe('no demand signal (0 open, 0 >=10 closed)');
    expect(renderIssuesPage(layer, [empty], meta, new Set())).toContain('no demand signal (0 open, 0 >=10 closed)');
  });

  /** An unreachable tracker must never be indistinguishable from a tracker with nothing on it. */
  it('says a query failed rather than calling the outage "no demand"', () => {
    const page = renderIssuesPage(layer, [section({ error: 'rate limited' })], meta, new Set());
    expect(page).toContain('**Not measured:** rate limited');
    expect(page).not.toContain('no demand signal');
  });

  it('escapes a pipe in an upstream title so it cannot end the cell it sits in', () => {
    const page = renderIssuesPage(layer, [section({ closed: [issue({ title: 'a | b' })] })], meta, new Set());
    expect(page).toContain('a \\| b');
  });

  it('marks an issue covered only when our own source cites it by name and number', () => {
    const cited = citations(["// closes the gap dotenv#89 left open", 'const x = 1; // ora#12']);
    expect(cited.has('dotenv#89')).toBe(true);
    expect(isCovered('dotenv', issue(), cited)).toBe(true);
    expect(isCovered('rc', issue(), cited)).toBe(false);
    expect(renderIssuesPage(layer, [section()], meta, cited)).toContain('| 2016-11-14 | yes |');
  });
});

describe('every layer has a measured demand file', () => {
  it('covers the nine layers of the plan', () => {
    expect(LAYERS).toHaveLength(9);
    expect(new Set(LAYERS.flatMap((l) => l.incumbents)).size).toBe(25);
  });

  it('has an issues.md beside every layer intent', () => {
    const missing = LAYERS.filter((l) => !existsSync(join(INTENTS, l.intent, 'issues.md'))).map((l) => l.intent);
    expect(missing, `${missing.length} layer(s) with no issues.md: ${missing.join(', ')}`).toEqual([]);
  });

  /**
   * paratext's incumbents have no demand signal at any threshold, and that file has to
   * exist and say so. A layer that quietly went unmined would look the same as one with
   * nothing to mine, which is the whole defect this step exists to close.
   */
  it('records paratext as measured-and-empty rather than leaving it unwritten', () => {
    const at = join(INTENTS, 'paratext', 'issues.md');
    expect(existsSync(at)).toBe(true);
    expect(readFileSync(at, 'utf8')).toContain('no demand signal');
  });
});
