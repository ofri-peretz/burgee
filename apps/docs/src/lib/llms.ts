/**
 * The two agent-readable projections of the docs site: `/llms.txt` and `/llms-full.txt`.
 *
 * The audience for this site is not only people. An agent that lands on it should not have
 * to render nine MDX pages to find out what `burgee` is — the llms.txt convention gives it
 * one URL for the map and one for the whole corpus, in the plain Markdown it reads best.
 *
 * Both are built from `source.getPages()`, the same loader the `/docs/[[...slug]]` route
 * renders from. That is the whole design constraint: a hand-maintained list is a page that
 * goes stale the first time somebody adds an MDX file, silently, because a shorter list
 * still looks like a list. `apps/docs/tests/llms-txt.test.ts` reads the *prerendered*
 * `llms.txt` out of `.next` and fails if a single file under `content/docs/` is missing
 * from it, so the drift cannot survive a build.
 */
import { type PublicPackage } from '#/lib/packages';
import { PITCH, SITE } from '#/lib/site';
import { type DocsPage } from '#/lib/source';

/** A YAML frontmatter block at the head of a file, which the projection re-states itself. */
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

/** One page's row in the index: a resolvable link, and the description as the summary. */
function row(page: DocsPage): string {
  const description = page.data.description ?? '';
  return `- [${page.data.title}](${SITE}${page.url})${description === '' ? '' : `: ${description}`}`;
}

/**
 * One package's row in the map: what it replaces first, because "what is the alternative to
 * commander?" is the question this section is here to answer, then its npm description.
 */
function packageRow(pkg: PublicPackage): string {
  return `- [${pkg.name}](${pkg.url}) — replaces ${pkg.replaces}. ${pkg.description}`;
}

/**
 * `/llms.txt` — the map. The pitch, then the package map (package → what it replaces → its
 * page), then one line per page the loader knows. Every docs page appears exactly once under
 * `## Documentation`; nothing is filtered, ordered, or excerpted by hand. The package pages
 * appear in both sections on purpose — the map answers "which package", the index answers
 * "which page" — and `tests/llms-txt.test.ts` checks each section against its own ground truth.
 */
export function llmsIndex(pages: readonly DocsPage[], packages: readonly PublicPackage[]): string {
  return ['# burgee', '', `> ${PITCH}`, '', '## Packages', '', ...packages.map(packageRow), '', '## Documentation', '', ...pages.map(row), ''].join('\n');
}

/**
 * One page as Markdown: a title, its description, the URL it came from, then its source.
 * It is both a section of `/llms-full.txt` and the whole body of the page's `.md` twin, so
 * the corpus and the per-page file cannot disagree about what a page says.
 */
export async function markdownOf(page: DocsPage): Promise<string> {
  const raw = await page.data.getText('raw');
  const description = page.data.description ?? '';
  return [`# ${page.data.title}`, '', ...(description === '' ? [] : [`> ${description}`, '']), `Source: ${SITE}${page.url}`, '', raw.replace(FRONTMATTER, '').trim(), ''].join('\n');
}

/** `/llms-full.txt` — the whole corpus, in one response, in the order the index lists it. */
export async function llmsFull(pages: readonly DocsPage[]): Promise<string> {
  const sections = await Promise.all(pages.map(markdownOf));
  return sections.join('\n---\n\n');
}
