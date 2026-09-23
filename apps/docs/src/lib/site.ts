/**
 * The facts about the site that more than one route states: where it lives, what it is in one
 * sentence, and which routes are not for search engines.
 *
 * Where it lives is not written here. It is the `burgee` row of `.github/vercel-apps.json`,
 * resolved by `docs-chassis/site` — the same way every package's site resolves its own — so
 * the canonical origin in the metadata, the sitemap, robots.txt, the JSON-LD and llms.txt is
 * one value, and the deploy workflow checks the same value after it deploys.
 */
import { defineSite } from 'docs-chassis/site';
import { type Metadata } from 'next';

import manifest from '../../../../packages/burgee/package.json';

/** This app's row in `.github/vercel-apps.json`, and the package it documents. */
export const site = defineSite('burgee', manifest);

/**
 * What burgee is, in one sentence, in the words the root README uses: burgee *replaces*
 * commander and yargs. The docs home once said it *delegates* to them — a different product —
 * and a model asked "what is burgee?" quotes whichever sentence it met first.
 *
 * This is the definition, not the pitch. The pitch — the tagline — is `PITCH` in
 * `#/lib/llms`, and `scripts/pitch-lock.test.ts` holds every copy of it to that one string.
 */
export const SUMMARY =
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
