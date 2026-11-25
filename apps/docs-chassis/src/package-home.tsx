/**
 * A package site's home: its mark, its name, its npm description, the way in (the docs and the
 * install command), the pages to start from, every "coming from" guide — because the incumbent
 * is the search a reader typed to get here — and the family-wide pages on the front door.
 */
import { type Metadata } from 'next';
import { type ReactNode } from 'react';

import { homeHero } from './home-hero';
import { homeSection } from './home-section';
import { homeStats } from './home-stats';
import { homeStatsView } from './home-stats-view';
import { homeTitle } from './home-title';
import { JsonLd } from './json-ld';
import { cardGrid, linkCard } from './link-card';
import { familyLinks, type Site } from './site';
import { type DocsPage, type DocsSource } from './source';

/**
 * A home page's metadata, for every site in the family — the front door passes its `SUMMARY` as
 * the description. The title says what the package does (`HOME_TITLES`); the incumbents a reader
 * searches for ("chalk alternative") stay in the description's last sentence, the npm
 * description's `Drop-in alternative to …` clause (`.sdlc/intents/positioning/` R13). `absolute`
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

/**
 * The pages a first-time reader starts from, in reading order, by slug. A label replaces the
 * page's own title where that title only makes sense inside the sidebar (the API index is
 * titled with the package name; the drop-ins page with the family's word for the grade). A
 * slug the site has no page for is skipped, so a site with a different outline loses a card,
 * not its build.
 */
function startHere(site: Site, source: DocsSource): { readonly page: DocsPage; readonly title: string }[] {
  const wanted: readonly { readonly slug: string; readonly label?: string }[] = [
    { slug: 'getting-started' },
    { slug: `why-${site.name}` },
    { slug: 'drop-ins', label: 'Drop-in compatibility' },
    { slug: 'api', label: 'API reference' },
  ];
  return wanted.flatMap(({ slug, label }) => {
    const page = source.findPage([slug]);
    return page === undefined ? [] : [{ page, title: label ?? page.data.title }];
  });
}

/** A docs page as a card: its own title (or a label) and the description its frontmatter states. */
function pageCard(page: DocsPage, title: string = page.data.title): ReactNode {
  return linkCard({ id: `home-${page.slugs.join('-')}`, href: page.url, title, description: page.data.description });
}

/** The bands below the hero, each skipped when the site has nothing to put in it. */
function bands(site: Site, source: DocsSource): ReactNode[] {
  const start = startHere(site, source);
  const guides = comingFrom(source);
  const family = (
    <>
      {site.name} is one of the{' '}
      <a href={site.family.url} data-testid="home-family" data-slot="home-family" className="font-medium text-fd-foreground underline underline-offset-4">
        {site.family.name}
      </a>{' '}
      packages. These pages cover all of them.
    </>
  );
  const stats = homeStats(site.name);
  return [
    stats.length === 0 ? null : homeSection({ id: 'numbers', eyebrow: 'By the numbers', title: 'Measured, with the file each number comes from' }, homeStatsView(stats)),
    start.length === 0 ? null : homeSection({ id: 'start', eyebrow: 'Start here', title: `Learn ${site.name} in this order` }, cardGrid(start.map(({ page, title }) => pageCard(page, title)))),
    guides.length === 0
      ? null
      : homeSection(
          { id: 'coming-from', eyebrow: 'Migrate', title: 'Coming from another package', tagline: 'Each guide maps the package you use today onto this one, call by call, and says what is different on purpose.' },
          cardGrid(guides.map((page) => pageCard(page))),
        ),
    homeSection(
      { id: 'family', eyebrow: 'The family', title: `Part of ${site.family.name}`, tagline: family },
      cardGrid(familyLinks(site).map((link) => linkCard({ id: `home-${link.title.toLowerCase()}`, href: link.url, title: link.title, description: link.description, external: true }))),
    ),
  ].filter((band) => band !== null);
}

/**
 * The home, as Interlace lays out a page: a hero with the one action and the one command a
 * reader came for, then sections, each opened by a small header and holding a grid of cards
 * that carry the description the page itself states. Every card's text comes from the docs'
 * own frontmatter, so the home never says something the page it links to does not.
 */
export function PackageHome({ site, source }: { readonly site: Site; readonly source: DocsSource }) {
  return (
    <main className="flex flex-1 flex-col">
      <JsonLd site={site} />
      {homeHero(site)}
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-16 px-4 pb-20 sm:px-6">{bands(site, source)}</div>
    </main>
  );
}
