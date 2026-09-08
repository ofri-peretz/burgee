/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The ranking script is the thing that names the wave 2 outreach targets, so the pure
 * parts — the score, the direct-dependency check, the repository normalisation, the
 * ranking — are pinned here. The fetches are not: they hit three public APIs and the
 * committed .sdlc/research/dependents.md is the record of what they returned.
 */

import { describe, it, expect } from 'vitest';

import {
  score,
  directHosts,
  repositoryUrl,
  batches,
  shortlist,
  toCandidates,
  rank,
  parseCount,
  renderMarkdown,
  HOST_WEIGHT,
  type Dependent,
  type Report,
} from './rank-dependents';

describe('score', () => {
  it('is log10 of weekly downloads, weighted by host', () => {
    expect(score(1_000_000, 'commander')).toBeCloseTo(6, 5);
    expect(score(1_000_000, 'yargs')).toBeCloseTo(6 * HOST_WEIGHT.yargs, 5);
  });

  it('weighs yargs above commander at equal downloads', () => {
    expect(score(10_000, 'yargs')).toBeGreaterThan(score(10_000, 'commander'));
  });

  it('scores zero downloads as zero, never -Infinity', () => {
    expect(score(0, 'commander')).toBe(0);
    expect(score(-5, 'yargs')).toBe(0);
  });
});

describe('directHosts', () => {
  it('reports each host named under dependencies with its range', () => {
    expect(directHosts({ commander: '^12.0.0', yargs: '^17.6.2', chalk: '^5' })).toEqual([
      ['commander', '^12.0.0'],
      ['yargs', '^17.6.2'],
    ]);
  });

  it('ignores missing, null and non-string entries', () => {
    expect(directHosts(undefined)).toEqual([]);
    expect(directHosts(null)).toEqual([]);
    expect(directHosts({ commander: 12 })).toEqual([]);
    expect(directHosts({ 'yargs-parser': '^21' })).toEqual([]);
  });
});

describe('repositoryUrl', () => {
  it('normalises the registry shapes to a browsable https URL', () => {
    expect(repositoryUrl({ type: 'git', url: 'git+https://github.com/tj/commander.js.git' })).toBe('https://github.com/tj/commander.js');
    expect(repositoryUrl('git://github.com/yargs/yargs.git')).toBe('https://github.com/yargs/yargs');
    expect(repositoryUrl('git@github.com:owner/repo.git')).toBe('https://github.com/owner/repo');
    expect(repositoryUrl('ssh://git@github.com/owner/repo.git')).toBe('https://github.com/owner/repo');
    expect(repositoryUrl('owner/repo')).toBe('https://github.com/owner/repo');
    // @puppeteer/browsers, 2026-09-08: a branch fragment after `.git`.
    expect(repositoryUrl('git+https://github.com/puppeteer/puppeteer.git#main')).toBe('https://github.com/puppeteer/puppeteer');
  });

  it('returns null when there is nothing browsable', () => {
    expect(repositoryUrl(undefined)).toBeNull();
    expect(repositoryUrl({})).toBeNull();
    expect(repositoryUrl('')).toBeNull();
    expect(repositoryUrl('file:../local')).toBeNull();
  });
});

describe('batches', () => {
  it('splits into consecutive chunks of at most size', () => {
    expect(batches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(batches([], 128)).toEqual([]);
  });
});

describe('shortlist', () => {
  it('keeps the limit most-downloaded names by the feed figure, ties by name', () => {
    const feed = [
      { name: 'tiny', monthlyDownloads: 12 },
      { name: 'jest-cli', monthlyDownloads: 170_262_701 },
      { name: 'b', monthlyDownloads: 1_000 },
      { name: 'a', monthlyDownloads: 1_000 },
    ];
    expect(shortlist(feed, 3)).toEqual(['jest-cli', 'a', 'b']);
    expect(shortlist(feed, 10)).toHaveLength(4);
  });
});

describe('toCandidates', () => {
  it('keeps named rows and reads a missing download figure as zero', () => {
    expect(toCandidates([{ name: 'a', downloads: 5 }, { name: 'b', downloads: null }, { downloads: 9 }, 'junk'])).toEqual([
      { name: 'a', monthlyDownloads: 5 },
      { name: 'b', monthlyDownloads: 0 },
    ]);
  });
});

describe('parseCount', () => {
  it('reads <flag> N and falls back when absent or invalid', () => {
    expect(parseCount(['--limit', '200'], '--limit', 500)).toBe(200);
    expect(parseCount(['--json'], '--limit', 500)).toBe(500);
    expect(parseCount(['--top', 'lots'], '--top', 7)).toBe(7);
    expect(parseCount(['--top', '0'], '--top', 7)).toBe(7);
  });
});

const row = (name: string, host: Dependent['host'], weeklyDownloads: number): Dependent => ({
  name,
  host,
  weeklyDownloads,
  range: '^1.0.0',
  repository: `https://github.com/x/${name}`,
  score: score(weeklyDownloads, host),
});

describe('rank', () => {
  it('filters to the host, sorts by score, ties by name, and caps at n', () => {
    const rows = [row('b', 'yargs', 100), row('a', 'yargs', 100), row('c', 'yargs', 1_000_000), row('d', 'commander', 1e9)];
    expect(rank(rows, 'yargs').map((r) => r.name)).toEqual(['c', 'a', 'b']);
    expect(rank(rows, 'yargs', 1).map((r) => r.name)).toEqual(['c']);
    expect(rank(rows, 'commander').map((r) => r.name)).toEqual(['d']);
  });
});

describe('renderMarkdown', () => {
  it('writes the date, the commands, a table per host and the undetermined section', () => {
    const report: Report = {
      generatedAt: '2026-09-08',
      commands: ['npm run rank:dependents -- --limit 500 --top 10000 --json'],
      source: 'ecosyste.ms',
      notes: [],
      scanned: { commander: 74_942, yargs: 42_638 },
      candidates: { commander: 1, yargs: 1 },
      sweep: { count: 10_000, floorMonthly: 4_169_038 },
      top: { commander: [row('webpack-cli', 'commander', 40_000_000)], yargs: [row('jest-cli', 'yargs', 30_000_000)] },
      notDirect: ['html2canvas'],
      undetermined: [{ name: 'ghost', reason: 'no latest release on registry.npmjs.org (unpublished or deprecated)' }],
    };
    const md = renderMarkdown(report);
    expect(md).toContain('Generated 2026-09-08');
    expect(md).toContain('npm run rank:dependents -- --limit 500 --top 10000 --json');
    expect(md).toContain('74,942 commander and 42,638 yargs rows scanned');
    expect(md).toContain('10,000 most-downloaded packages on npm (floor: 4,169,038 downloads/month)');
    expect(md).toContain('## commander — top 1');
    expect(md).toContain('| 1 | `webpack-cli` | 40,000,000 | commander | `^1.0.0` | <https://github.com/x/webpack-cli> |');
    expect(md).toContain('## yargs — top 1');
    expect(md).toContain('## Could not determine');
    expect(md).toContain('1 candidate(s) listed by the source do not name commander or yargs');
    expect(md).toContain('- `ghost`: no latest release');
  });

  it('surfaces the seed fallback note as a blockquote', () => {
    const report: Report = {
      generatedAt: '2026-09-08',
      commands: [],
      source: 'seed',
      notes: ['ecosyste.ms was unavailable'],
      scanned: { commander: 0, yargs: 0 },
      candidates: { commander: 0, yargs: 0 },
      sweep: { count: 0, floorMonthly: 0 },
      top: { commander: [], yargs: [] },
      notDirect: [],
      undetermined: [],
    };
    const md = renderMarkdown(report);
    expect(md).toContain('> ecosyste.ms was unavailable');
    expect(md).toContain('from the hand-verified seed list');
    expect(md).not.toContain('most-downloaded packages on npm');
    expect(md).toContain('- none');
  });
});
