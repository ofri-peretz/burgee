/**
 * Which results file the docs are generated from, as opposed to which ones the bands read.
 *
 * `benchmarks/results/<suite>/` serves two readers with different needs and, until this
 * module, one filename. The Stage 6 bands want *every* observation, from every machine —
 * a series that stops updating looks perfectly healthy, which is why the workflow lands
 * them at all. The docs want *one* measurement, chosen deliberately, because a published
 * figure is a claim somebody stands behind.
 *
 * Those needs collided on 2026-09-09. The recorder ran on a two-core CI runner, wrote
 * `2026-09-09.json`, and would have republished the project's public cold-start figures as
 * whichever runner happened to pick up the job — `+22.6 ms` becoming `+8.0 ms` not because
 * anything got faster but because the box was different. `perf.ts` says so in its own
 * method line: *absolute ms are a property of the machine recorded above and are not
 * comparable across machines.* The `installed-bytes` rows were byte-identical, which is
 * the point of them, and the ms rows were not, which is also the point of them.
 *
 * So the filename carries the distinction. `YYYY-MM-DD.json` is the published measurement;
 * `YYYY-MM-DD-<sha>.json` is an observation from the run at that commit. The bands glob
 * the directory and see both. The docs read only the first, and a CI run can no longer
 * change a public number without a person choosing to.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** `2026-09-09.json` — a date and nothing else. */
const PUBLISHED = /^\d{4}-\d{2}-\d{2}\.json$/;

/** Every file in a suite's directory, published measurements and CI observations alike. */
export function observations(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
}

/**
 * The newest published measurement of a suite, or nothing if it has never been recorded
 * here. Observations are skipped by name: an unpublished run is data for the bands, and
 * the docs must not pick one up merely because it landed last.
 */
export function publishedResults(dir: string): string | undefined {
  return observations(dir).filter((f) => PUBLISHED.test(f)).toSorted().at(-1);
}
