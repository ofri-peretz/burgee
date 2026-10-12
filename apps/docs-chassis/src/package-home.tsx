/**
 * A package site's home: its mark, its name, its npm description, the way in — every "coming
 * from" page by name, because the incumbent is the search a reader typed to get here — and the
 * family-wide pages on the front door.
 */
import { type Metadata } from 'next';
import Link from 'next/link';

import { homeTitle } from './home-title';
import { incumbentLink } from './incumbent-link';
import { JsonLd } from './json-ld';
import { familyLinks, type Site } from './site';
import { type DocsPage, type DocsSource } from './source';

/** Hero mark: 4× the nav size. */
const HERO_MARK_SIZE = 96;

/**
 * A home page's metadata, for every site in the family — the front door passes its `SUMMARY` as
 * the description. The title says what the package does (`HOME_TITLES`); the incumbents a reader
 * searches for ("chalk alternative") stay in the description's last sentence, the npm
 * description's `Drop-in paths for …` clause (`.sdlc/intents/positioning/` R13). `absolute`
 * skips the `%s | <name>` template, which would say the name twice.
 */
export function homeMetadata(site: Site, description: string = site.description): Metadata {
  return {
    title: { absolute: homeTitle(site.name) },
    description,
    alternates: { canonical: '/' },
  };
}

/** The app's "coming from <incumbent>" pages. */
function comingFrom(source: DocsSource): DocsPage[] {
  return source.allPages().filter((page) => page.url.startsWith('/docs/coming-from/'));
}

export function PackageHome({ site, source }: { readonly site: Site; readonly source: DocsSource }) {
  const [compatibility, gallery] = familyLinks(site);
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <JsonLd site={site} />
      <img src="/icon.svg" alt="" width={HERO_MARK_SIZE} height={HERO_MARK_SIZE} />
      <h1 className="text-4xl font-bold tracking-tight">
        <span className="font-mono lowercase">{site.name}</span>
      </h1>
      <p className="max-w-xl text-lg text-fd-muted-foreground">{site.description}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/docs" data-testid="home-docs" data-slot="home-docs" className="rounded-md bg-fd-primary px-4 py-2 font-medium text-fd-primary-foreground">
          Read the docs
        </Link>
        {comingFrom(source).map(incumbentLink)}
      </div>
      <p className="max-w-xl text-sm text-fd-muted-foreground">
        Part of the{' '}
        <a href={site.family.url} data-testid="home-family" data-slot="home-family" className="underline">
          {site.family.name}
        </a>{' '}
        family, graded against its incumbents on the{' '}
        <a href={compatibility?.url} data-testid="home-compatibility" data-slot="home-compatibility" className="underline">
          compatibility page
        </a>{' '}
        and drawn in the{' '}
        <a href={gallery?.url} data-testid="home-gallery" data-slot="home-gallery" className="underline">
          gallery
        </a>
        .
      </p>
    </main>
  );
}
