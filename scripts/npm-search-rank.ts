/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */
/**
 * Where each published package ranks in npm search for the words people type
 * (`.sdlc/intents/npm-search/` spec R1 and R4).
 *
 * `PHRASES` is the one phrase table. `npm-search-opening-lock.test.ts` reads it to hold each
 * description's opening, and this script reads it to measure the rank. Nothing else lists the
 * phrases.
 *
 *   npx tsx scripts/npm-search-rank.ts           # print the reading
 *   npx tsx scripts/npm-search-rank.ts --check   # exit 1 if a primary phrase is stale or outside the top 10
 *
 * It needs the network and is not run in CI. A rank moves with every other package's downloads,
 * so the reading is committed as `.sdlc/research/npm-search-rank-<date>.md` after each publish
 * (spec R7), not held by a band.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PHRASES: Record<string, { primary: string; incumbent: string }> = {
  bellpull: { primary: 'child process', incumbent: 'cross-spawn alternative' },
  burgee: { primary: 'cli framework', incumbent: 'commander alternative' },
  caique: { primary: 'cli prompts', incumbent: 'inquirer alternative' },
  closeout: { primary: 'exit hook', incumbent: 'signal-exit alternative' },
  controlroom: { primary: 'tui framework', incumbent: 'ink alternative' },
  flagstaff: { primary: 'cli spinner', incumbent: 'ora alternative' },
  linegauge: { primary: 'string width', incumbent: 'string-width alternative' },
  oxmutate: { primary: 'mutation testing', incumbent: 'stryker alternative' },
  paratext: { primary: 'terminal hyperlinks', incumbent: 'ansi-escapes alternative' },
  roundel: { primary: 'terminal colors', incumbent: 'chalk alternative' },
  seniority: { primary: 'config loader', incumbent: 'cosmiconfig alternative' },
};

export const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

/** Every package under `packages/` that npm publishes, with its description. */
export function publishedDescriptions(root: string = REPO_ROOT): Map<string, string> {
  const out = new Map<string, string>();
  for (const entry of readdirSync(join(root, 'packages'), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    let pkg: { name?: string; version?: string; private?: boolean; description?: string };
    try {
      pkg = JSON.parse(readFileSync(join(root, 'packages', entry.name, 'package.json'), 'utf8')) as typeof pkg;
    } catch {
      continue;
    }
    if (pkg.private === true || pkg.version === undefined || pkg.name === undefined) continue;
    out.set(pkg.name, pkg.description ?? '');
  }
  return out;
}

/** The words npm matches on: lower-cased, split on anything that is not a letter or digit. No stemming, because npm applies none. */
export const words = (text: string): string[] => text.toLowerCase().split(/[^a-z0-9]+/u).filter(Boolean);

/** Whether `phrase`'s words appear in order and adjacent within the first `limit` words of `text`. */
export function opensWith(text: string, phrase: string, limit = 8): boolean {
  const head = words(text).slice(0, limit);
  const want = words(phrase);
  for (let i = 0; i + want.length <= head.length; i++) if (want.every((w, j) => head[i + j] === w)) return true;
  return false;
}

interface Hit {
  package: { name: string; description?: string };
}

const SIZE = 250;
const PAUSE_MS = 800;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** One search, retried when the API answers a burst with HTML instead of JSON. */
async function search(text: string): Promise<Hit[]> {
  const url = `https://registry.npmjs.org/-/v1/search?size=${SIZE}&text=${encodeURIComponent(text)}`;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url);
    const body = await res.text();
    try {
      return (JSON.parse(body) as { objects: Hit[] }).objects;
    } catch {
      if (attempt === 5) throw new Error(`npm search for "${text}" answered ${res.status} with no JSON after ${attempt} tries`);
      await sleep(PAUSE_MS * 2 ** attempt);
    }
  }
}

interface Row {
  pkg: string;
  kind: 'primary' | 'incumbent';
  phrase: string;
  rank: number | undefined;
  stale: boolean;
}

async function main(): Promise<void> {
  const check = process.argv.includes('--check');
  const local = publishedDescriptions();
  const rows: Row[] = [];
  for (const [pkg, { primary, incumbent }] of Object.entries(PHRASES)) {
    for (const [kind, phrase] of [['primary', primary], ['incumbent', incumbent]] as const) {
      const hits = await search(phrase);
      const at = hits.findIndex((h) => h.package.name === pkg);
      const stale = at !== -1 && hits[at]?.package.description !== local.get(pkg);
      rows.push({ pkg, kind, phrase, rank: at === -1 ? undefined : at + 1, stale });
      await sleep(PAUSE_MS);
    }
  }
  console.log('| Package | Kind | Phrase | Rank |\n| --- | --- | --- | --- |');
  for (const r of rows) console.log(`| ${r.pkg} | ${r.kind} | ${r.phrase} | ${r.stale ? 'stale' : r.rank === undefined ? `>${SIZE}` : `#${r.rank}`} |`);
  if (!check) return;
  const missed = rows.filter((r) => r.kind === 'primary' && (r.stale || r.rank === undefined || r.rank > 10));
  if (missed.length > 0) {
    console.error(`\n${missed.length} primary phrase(s) stale or outside the top 10: ${missed.map((r) => `${r.pkg} "${r.phrase}"`).join(', ')}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
