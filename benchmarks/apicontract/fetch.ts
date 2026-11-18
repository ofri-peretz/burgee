/**
 * R2: downloads pinned documents into `$APICONTRACT_CORPUS_CACHE` (default
 * `~/.cache/apicontract-corpus`), verifying each sha256. Resumable: a cached file that already
 * hashes to its pin is not downloaded again, and a file is written under a temporary name first.
 * A downloaded document whose bytes differ from its pin fails the run (intent: "a changed sha is a
 * failed run, not a silent update").
 *
 *   npx tsx benchmarks/apicontract/fetch.ts [--family openapi] [--source apis-guru] [--sample N --seed S] [--json]
 */
import { expandPins, parseFlags, type Pin, sample } from './corpus-lib.js';
import { cached, cachePath, download, pool, readPins, sha256, writeAtomic } from './net.js';

const CONCURRENCY = 16;

export interface Fetched {
  readonly pin: Pin;
  readonly file: string;
  readonly downloaded: boolean;
}

/** The pins a flag set selects: by family and source, then a seeded sample. */
export function select(pins: readonly Pin[], options: { family?: string | undefined; source?: string | undefined; sample?: number | undefined; seed?: number | undefined }): Pin[] {
  const wanted = pins.filter((p) => (options.family === undefined || p.family === options.family) && (options.source === undefined || options.source.split(',').includes(p.source)));
  return sample(wanted, options.sample, options.seed ?? 1);
}

/** Every pin in the cache, verified; throws listing each mismatch after trying them all. */
export async function fetchAll(pins: readonly Pin[]): Promise<Fetched[]> {
  const mismatched: string[] = [];
  const results = await pool(pins, CONCURRENCY, async (pin): Promise<Fetched> => {
    if (cached(pin) !== undefined) return { pin, file: cachePath(pin), downloaded: false };
    const bytes = await download(pin.url);
    const actual = sha256(bytes);
    if (actual !== pin.sha256) mismatched.push(`${pin.id}: pinned ${pin.sha256}, served ${actual}`);
    else writeAtomic(cachePath(pin), bytes);
    return { pin, file: cachePath(pin), downloaded: true };
  });
  if (mismatched.length > 0) throw new Error(`${mismatched.length} document(s) changed since they were pinned. fix: \`pins.ts --refresh <source>\` in a reviewed PR\n${mismatched.join('\n')}`);
  return results;
}

const isEntry = process.argv[1] === import.meta.filename;
if (isEntry) {
  const { flags } = parseFlags(process.argv.slice(2));
  const str = (name: string): string | undefined => (typeof flags.get(name) === 'string' ? (flags.get(name) as string) : undefined);
  const num = (name: string): number | undefined => (str(name) === undefined ? undefined : Number(str(name)));
  const pins = select(expandPins(readPins()), { family: str('family'), source: str('source'), sample: num('sample'), seed: num('seed') });
  const fetched = await fetchAll(pins);
  const summary = { documents: fetched.length, downloaded: fetched.filter((f) => f.downloaded).length, cached: fetched.filter((f) => !f.downloaded).length };
  process.stdout.write(`${JSON.stringify(flags.has('json') ? { ...summary, files: fetched.map((f) => ({ id: f.pin.id, file: f.file })) } : summary, undefined, 2)}\n`);
}
