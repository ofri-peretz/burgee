/**
 * An app's site, resolved from its row: the one object every route, layout and projection
 * takes its host from.
 *
 * `apps/<app>/src/site.ts` is two lines — its app key and its package manifest — and this
 * turns them into everything else. The canonical origin is the row's `productionUrl` and is
 * never written in an app; `scripts/vercel-apps-lock.test.ts` fails the moment an app's
 * resolved origin is not its own row's (docs-per-package, criterion 4).
 */
import { type App, appConfig, familyApp } from './config';

/** The source repository, for JSON-LD's `codeRepository` and the GitHub nav link. */
export const REPO = 'https://github.com/ofri-peretz/burgee';

/** The slice of a `package.json` a site states about its package. */
export interface Manifest {
  readonly name: string;
  readonly description?: string;
}

export interface Site {
  /** The app key — the row it was resolved from. */
  readonly key: string;
  /** The package the site documents; also its name in the nav, the title and the OG card. */
  readonly name: string;
  /** The canonical origin, no trailing slash. */
  readonly url: string;
  /** The npm description: the one sentence a registry search already shows. */
  readonly description: string;
  /** Whether this app owns compatibility, comparison and gallery. */
  readonly familyPages: boolean;
  /** The family front door, which every other site links to for the family-wide pages. */
  readonly family: { readonly name: string; readonly url: string };
  readonly row: App;
}

/**
 * The site for app `key`. `manifest` is the documented package's own `package.json`,
 * imported by the app so it is inlined at build time; a manifest for a different package
 * than the row names fails the build rather than titling roundel's site "burgee".
 */
export function defineSite(key: string, manifest: Manifest): Site {
  const row = appConfig(key);
  if (manifest.name !== row.package) throw new Error(`${row.dir}/src/site.ts passes the manifest of '${manifest.name}', but row '${key}' documents '${row.package}'`);
  const family = familyApp();
  return {
    key,
    name: row.package,
    url: row.productionUrl,
    description: manifest.description ?? '',
    familyPages: row.familyPages,
    family: { name: family.package, url: family.productionUrl },
    row,
  };
}

/** The three family-wide pages, as absolute URLs on the front door (docs-per-package R14). */
export function familyLinks(site: Site): readonly { readonly title: string; readonly url: string; readonly description: string }[] {
  return [
    { title: 'Compatibility', url: `${site.family.url}/docs/compatibility`, description: 'Every drop-in path in the family, graded by the incumbent’s own test suite.' },
    { title: 'Gallery', url: `${site.family.url}/docs/gallery`, description: 'Every glyph, spinner and border the family has registered, rendered.' },
    { title: 'Comparison', url: `${site.family.url}/docs/comparison`, description: 'The family against its incumbents: weight, speed and surface.' },
  ];
}
