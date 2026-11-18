/**
 * R1: regenerates the entries of one source in `corpus/pins.json` and prints the diff.
 *
 *   npx tsx benchmarks/apicontract/pins.ts --refresh <source|all> [--json]
 *   npx tsx benchmarks/apicontract/pins.ts --list            # counts per source and family
 *
 * A refresh resolves the source's ref to a commit, lists its folder at that commit, downloads each
 * matching document from the commit's raw URL, hashes it, and leaves the bytes in the cache so the
 * first `fetch.ts` after a refresh downloads nothing.
 */
import { writeFileSync } from 'node:fs';

import { diffSource, expandPins, parseFlags, type PinnedSource, rawUrl, serializePins } from './corpus-lib.js';
import { SOURCES } from './corpus/sources.js';
import { cachePath, download, github, PINS_FILE, pool, readPins, sha256, writeAtomic } from './net.js';

const CONCURRENCY = 16;
const PROGRESS_EVERY = 250;

interface Tree {
  truncated: boolean;
  tree: { path: string; type: string }[];
}

async function refresh(name: string): Promise<PinnedSource> {
  const source = SOURCES[name];
  if (source === undefined) throw new Error(`no source is named "${name}". fix: use one of ${Object.keys(SOURCES).join(', ')}, or all`);
  const commit = (await github<{ sha: string }>(`repos/${source.repo}/commits/${encodeURIComponent(source.ref)}`)).sha;
  const repo = await github<{ license: { spdx_id: string } | null }>(`repos/${source.repo}`);
  const tree = await github<Tree>(`repos/${source.repo}/git/trees/${commit}:${source.dir}?recursive=1`);
  if (tree.truncated) throw new Error(`${source.repo}:${source.dir} lists more entries than one tree call returns`);
  const paths = tree.tree
    .filter((entry) => entry.type === 'blob')
    .map((entry) => `${source.dir}/${entry.path}`)
    .filter((p) => source.include.test(p));
  let done = 0;
  const hashes = await pool(paths, CONCURRENCY, async (p) => {
    const bytes = await download(rawUrl(source.repo, commit, p));
    writeAtomic(cachePath({ id: `${name}:${p}` }), bytes);
    done += 1;
    if (done % PROGRESS_EVERY === 0) process.stderr.write(`${name}: ${done}/${paths.length}\n`);
    return [p, sha256(bytes)] as const;
  });
  return { family: source.family, repo: source.repo, commit, license: repo.license?.spdx_id ?? 'NOASSERTION', documents: Object.fromEntries(hashes) };
}

async function main(): Promise<void> {
  const { flags } = parseFlags(process.argv.slice(2));
  const pins = readPins();
  if (flags.has('list')) {
    const rows = expandPins(pins);
    const by = (key: 'source' | 'family'): Record<string, number> => Object.fromEntries(Object.entries(Object.groupBy(rows, (r) => r[key])).map(([k, v]) => [k, v?.length ?? 0]));
    process.stdout.write(`${JSON.stringify({ documents: rows.length, bySource: by('source'), byFamily: by('family') }, undefined, 2)}\n`);
    return;
  }
  const wanted = flags.get('refresh');
  if (typeof wanted !== 'string') throw new Error('usage: pins.ts --refresh <source|all> [--json] | --list');
  const names = wanted === 'all' ? Object.keys(SOURCES) : [wanted];
  let sources = { ...pins.sources };
  const diffs = new Map<string, unknown>();
  for (const name of names) {
    // eslint-disable-next-line reliability/no-await-in-loop -- one source at a time: each refresh already downloads 16 documents at once
    const after = await refresh(name);
    const diff = diffSource(sources[name], after);
    diffs.set(name, { commit: after.commit, documents: Object.keys(after.documents).length, ...(flags.has('json') ? diff : { added: diff.added.length, removed: diff.removed.length, changed: diff.changed.length }) });
    sources = { ...sources, [name]: after };
    // Written after each source, so a failure in a later one keeps the earlier refreshes.
    writeFileSync(PINS_FILE, serializePins({ version: 1, sources }));
  }
  process.stdout.write(`${JSON.stringify(Object.fromEntries(diffs), undefined, 2)}\n`);
}

await main();
