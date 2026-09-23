/**
 * The two agent-readable projections of a docs site: `/llms.txt` and `/llms-full.txt`.
 *
 * The audience for these sites is not only people. An agent that lands on one should not
 * have to render its MDX to find out what the package is — the llms.txt convention gives it
 * one URL for the map and one for the whole corpus, in the plain Markdown it reads best.
 *
 * Both are built from the loader's page list, the same one the `/docs/[[...slug]]` route
 * renders from: a hand-maintained list goes stale the first time somebody adds a file,
 * silently, because a shorter list still looks like a list. Every absolute URL starts with
 * the site's own origin — its row's `productionUrl` — except the family links, which point
 * at the front door on purpose: one scoreboard, one gallery, on one host.
 */
import { type PublicPackage } from './packages';
import { familyLinks, type Site } from './site';
import { type DocsPage } from './source';

/** A YAML frontmatter block at the head of a file, which the projection re-states itself. */
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/u;

/** One page's row in the index: a resolvable link, and the description as the summary. */
function row(site: Site, page: DocsPage): string {
  const description = page.data.description ?? '';
  return `- [${page.data.title}](${site.url}${page.url})${description === '' ? '' : `: ${description}`}`;
}

/**
 * One package's row in the map: what it replaces first, because "what is the alternative to
 * commander?" is the question the map is there to answer, then its npm description.
 */
function packageRow(pkg: PublicPackage): string {
  return `- [${pkg.name}](${pkg.url}) — replaces ${pkg.replaces}. ${pkg.description}`;
}

export interface LlmsIndexOptions {
  readonly site: Site;
  readonly pages: readonly DocsPage[];
  /** The lines under the title. Defaults to the package's npm description as a quote. */
  readonly intro?: readonly string[];
  /** The family's package map; the front door prints it, a package site does not. */
  readonly packages?: readonly PublicPackage[];
}

/**
 * `/llms.txt` — the map. The title and intro, then the package map when there is one, then one
 * line per page the loader knows, then — on every site but the front door — the family-wide
 * pages, as absolute links to the host that owns them. Every docs page appears exactly once
 * under `## Documentation`; nothing is filtered, ordered, or excerpted by hand.
 */
export function llmsIndex({ site, pages, intro = [`> ${site.description}`], packages = [] }: LlmsIndexOptions): string {
  const map = packages.length === 0 ? [] : ['## Packages', '', ...packages.map(packageRow), ''];
  const family = site.familyPages ? [] : ['## Family', '', `- [${site.family.name}](${site.family.url}): the family front door`, ...familyLinks(site).map((link) => `- [${link.title}](${link.url}): ${link.description}`), ''];
  return [`# ${site.name}`, '', ...intro, '', ...map, '## Documentation', '', ...pages.map((page) => row(site, page)), '', ...family].join('\n');
}

/**
 * One page as Markdown: a title, its description, the URL it came from, then its source.
 * It is both a section of `/llms-full.txt` and the whole body of the page's `.md` twin, so
 * the corpus and the per-page file cannot disagree about what a page says.
 */
export async function markdownOf(site: Site, page: DocsPage): Promise<string> {
  const raw = await page.data.getText('raw');
  const description = page.data.description ?? '';
  return [`# ${page.data.title}`, '', ...(description === '' ? [] : [`> ${description}`, '']), `Source: ${site.url}${page.url}`, '', raw.replace(FRONTMATTER, '').trim(), ''].join('\n');
}

/** `/llms-full.txt` — the whole corpus, in one response, in the order the index lists it. */
export async function llmsFull(site: Site, pages: readonly DocsPage[]): Promise<string> {
  const sections = await Promise.all(pages.map(async (page) => markdownOf(site, page)));
  return sections.join('\n---\n\n');
}
