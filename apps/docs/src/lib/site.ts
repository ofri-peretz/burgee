/**
 * The facts about the site that more than one route states: where it lives, where its
 * source lives, what it is in one sentence, and which routes are not for search engines.
 *
 * They are here rather than repeated because each has at least three readers — the root
 * metadata, `sitemap.ts`, `robots.ts`, the home page's JSON-LD and the llms.txt projection
 * — and a canonical origin spelled two ways is two sites to a crawler.
 */
import { type Metadata } from 'next';

/** The canonical origin. Every absolute URL the site emits — canonical, sitemap, llms.txt — starts here. */
export const SITE = 'https://burgee.interlace.tools';

/** The source repository, for JSON-LD's `codeRepository` and the links an agent follows out. */
export const REPO = 'https://github.com/ofri-peretz/burgee';

/**
 * The one-sentence pitch, in the words the root README uses: burgee *replaces* commander
 * and yargs. The docs home once said it *delegates* to them — a different product — and a
 * model asked "what is burgee?" quotes whichever sentence it met first.
 */
export const PITCH =
  'A CLI framework that replaces commander and yargs, is drop-in compatible with both, and projects help, --json, --schema, an MCP server and shell completions from one declaration.';

/**
 * Design benches, not documentation: the 3D brand stage and the caique modelling sheets.
 * They stay reachable for the people shaping them and are kept out of every index — by
 * `robots.ts` for crawlers that honour it, and by {@link NOINDEX} on the pages themselves for
 * the ones that arrive by a link and never read robots.txt.
 */
export const LAB_ROUTES = ['/brand-lab', '/caique-lab', '/caique-sheet'] as const;

/** The metadata every {@link LAB_ROUTES} page exports. */
export const NOINDEX: Metadata = { robots: { index: false, follow: false } };
