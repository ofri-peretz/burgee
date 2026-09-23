/**
 * `SoftwareSourceCode` JSON-LD — the structured statement of what a site documents, for a
 * search engine or a model that reads schema.org before prose. Serialised as Next's JSON-LD
 * guide does it — `JSON.stringify`, then every `<` written as `<` so no value can close the
 * `<script>` early — and passed as the element's text child: React 19 writes a `<script>`'s text
 * verbatim, so there is no raw-HTML sink. Every value is a constant of the build.
 */
import { REPO, type Site } from './site';

/** The JSON-LD for `site`, as script text. */
export function jsonLdText(site: Site, description: string = site.description): string {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareSourceCode',
    name: site.name,
    description,
    url: site.url,
    codeRepository: REPO,
    programmingLanguage: 'TypeScript',
    runtimePlatform: 'Node.js',
    license: 'https://opensource.org/licenses/MIT',
  };
  return JSON.stringify(data).replaceAll('<', String.raw`<`);
}

export function JsonLd({ site, description }: { readonly site: Site; readonly description?: string }) {
  return <script type="application/ld+json">{jsonLdText(site, description)}</script>;
}
