import { BurgeeMark } from '#/components/burgee-mark';
import { PITCH, REPO, SITE } from '#/lib/site';
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
  description: PITCH,
  alternates: { canonical: '/' },
};

/**
 * `SoftwareSourceCode` JSON-LD: the structured statement of what this site documents — a
 * TypeScript codebase, where its source is, and its licence — for a search engine or a
 * model that reads schema.org before prose. Every value is a fact the repository states
 * elsewhere: the licence is `packages/burgee/package.json`'s, the pitch is `PITCH`.
 */
const JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareSourceCode',
  name: 'burgee',
  description: PITCH,
  url: SITE,
  codeRepository: REPO,
  programmingLanguage: 'TypeScript',
  runtimePlatform: 'Node.js',
  license: 'https://opensource.org/licenses/MIT',
};

/**
 * Serialised as Next's JSON-LD guide does it — `JSON.stringify`, then every `<` written as
 * the JSON escape `\u003c` so no string value can close the `<script>` early — but passed as
 * the element's text child rather than through `dangerouslySetInnerHTML`: React 19 writes a
 * `<script>`'s text verbatim, so the JSON arrives unmangled and there is no raw-HTML sink.
 * The object above is a constant of this module; nothing a visitor sends reaches it.
 */
const JSON_LD_TEXT = JSON.stringify(JSON_LD).replaceAll('<', String.raw`\u003c`);

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <script type="application/ld+json">{JSON_LD_TEXT}</script>
      <BurgeeMark size={HERO_MARK_SIZE} />
      <h1 className="text-4xl font-bold tracking-tight">
        <span className="font-mono lowercase">burgee</span>
      </h1>
      <p className="max-w-xl text-lg text-fd-muted-foreground">
        Everything a CLI needs that isn&apos;t your CLI: help, structured output, a typed
        schema, an MCP server, completions, types and docs — every one of them projected
        from a single declaration. You write the commands; humans and agents both get a
        first-class interface to them.
      </p>
      <Link
        href="/docs"
        className="rounded-md bg-fd-primary px-4 py-2 font-medium text-fd-primary-foreground"
      >
        Read the floor
      </Link>
    </main>
  );
}
