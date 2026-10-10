import { BurgeeMark } from '#/components/burgee-mark';
import { PITCH } from '#/lib/llms';
import { site, SUMMARY } from '#/lib/site';
import { JsonLd } from 'docs-chassis/json-ld';
import { homeMetadata } from 'docs-chassis/package-home';
import Link from 'next/link';

/** Hero burgee: 4× the nav size, the same locked geometry. */
const HERO_MARK_SIZE = 96;

/**
 * The home page's metadata, as every site in the family states it: the title says what burgee
 * does, and `SUMMARY`, the description, names commander and yargs in its closing clause, where a
 * search for either still finds the page (`.sdlc/intents/positioning/` R13,
 * D-20261009-positioning-home-title).
 */
export const metadata = homeMetadata(site, SUMMARY);

/**
 * The front door. Its JSON-LD is the chassis's, as every site in the family states it, with
 * `SUMMARY` as the description: the definition, not the pitch.
 */
export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <JsonLd site={site} description={SUMMARY} />
      <BurgeeMark size={HERO_MARK_SIZE} />
      <h1 className="text-4xl font-bold tracking-tight">
        <span className="font-mono lowercase">burgee</span>
      </h1>
      <p className="max-w-xl text-lg text-fd-muted-foreground">{PITCH}</p>
      <p className="max-w-xl text-fd-muted-foreground">{SUMMARY}</p>
      <Link
        href="/docs"
        className="rounded-md bg-fd-primary px-4 py-2 font-medium text-fd-primary-foreground"
      >
        Read the floor
      </Link>
    </main>
  );
}
