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
import { type DocsPage } from '#/lib/source';

/** The canonical origin, so an agent that pulled the file elsewhere can still resolve a link. */
export const SITE = 'https://burgee.interlace.tools';

/** A YAML frontmatter block at the head of a file, which the projection re-states itself. */
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

/** One page's row in the index: a resolvable link, and the description as the summary. */
function row(page: DocsPage): string {
  const description = page.data.description ?? '';
  return `- [${page.data.title}](${SITE}${page.url})${description === '' ? '' : `: ${description}`}`;
}

/**
 * `/llms.txt` — the map. One heading, then one line per page the loader knows.
 * Every page appears exactly once; nothing is filtered, ordered, or excerpted by hand.
 */
export function llmsIndex(pages: readonly DocsPage[]): string {
  return ['# burgee', '', '> Everything a CLI needs that is not your CLI, projected from one declaration.', '', '## Documentation', '', ...pages.map(row), ''].join('\n');
}

/** One page's section of the corpus: a title, the URL it came from, then its Markdown. */
async function section(page: DocsPage): Promise<string> {
  const raw = await page.data.getText('raw');
  return [`# ${page.data.title}`, '', `Source: ${SITE}${page.url}`, '', raw.replace(FRONTMATTER, '').trim(), ''].join('\n');
}

/** `/llms-full.txt` — the whole corpus, in one response, in the order the index lists it. */
export async function llmsFull(pages: readonly DocsPage[]): Promise<string> {
  const sections = await Promise.all(pages.map(section));
  return sections.join('\n---\n\n');
}
