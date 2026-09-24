import { BurgeeMark } from '#/components/burgee-mark';
import { PITCH } from '#/lib/llms';
import { site, SUMMARY } from '#/lib/site';
import { JsonLd } from 'docs-chassis/json-ld';
import { type Metadata } from 'next';
import Link from 'next/link';

/** Hero burgee: 4× the nav size, the same locked geometry. */
const HERO_MARK_SIZE = 96;

/**
 * The home page's title names the two incumbents, because "commander alternative" and
 * "yargs alternative" are what people and models search for, and a title is the strongest
 * place a page can say it. `absolute` skips the `%s | burgee` template, which would say
 * "burgee" twice.
 */
export const metadata: Metadata = {
  title: { absolute: 'burgee — the CLI framework that replaces commander and yargs' },
  description: SUMMARY,
  alternates: { canonical: '/' },
};

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
