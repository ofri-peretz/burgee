/**
 * The projection's shape, against a stub loader: what a package site's `/llms.txt` says about
 * its own pages and about the family's. The built sites are checked end to end by
 * `docsSiteSuite`; this pins the pieces that have no build to read.
 */
import { describe, expect, it } from 'vitest';

import { APPS, familyApp, packageDocsUrl } from './config';
import { llmsIndex, markdownOf } from './llms';
import { defineSite } from './site';
import { type DocsPage } from './source';

const page = (url: string, title: string): DocsPage => ({
  url,
  slugs: url.split('/').slice(2),
  data: { title, description: `${title}, described.`, body: () => {
    throw new Error('a projection never renders the body');
  }, toc: [], getText: async () => `---\ntitle: ${title}\n---\n\n# body of ${title}\n` },
});

const sibling = APPS.find((app) => !app.familyPages);
if (sibling === undefined) throw new Error('the table has no package site to test against');

describe('the table reader', () => {
  it('finds the one front door', () => {
    expect(familyApp().familyPages).toBe(true);
  });

  it('sends a package with its own app to that app, and the front door’s own package to a section', () => {
    expect(packageDocsUrl(sibling.package)).toBe(`${sibling.productionUrl}/docs`);
    expect(packageDocsUrl(familyApp().package)).toBe(`${familyApp().productionUrl}/docs/packages/${familyApp().package}`);
  });

  it('refuses a site whose manifest is another package’s', () => {
    expect(() => defineSite(sibling.key, { name: familyApp().package })).toThrow(/documents/u);
  });
});

describe('a package site’s llms.txt', () => {
  const site = defineSite(sibling.key, { name: sibling.package, description: 'What it is.' });
  const text = llmsIndex({ site, pages: [page('/docs', sibling.package), page('/docs/coming-from/x', 'Coming from x')] });

  it('lists its own pages on its own host', () => {
    expect(text).toContain(`- [Coming from x](${sibling.productionUrl}/docs/coming-from/x): Coming from x, described.`);
    expect(text.startsWith(`# ${sibling.package}\n\n> What it is.\n`)).toBe(true);
  });

  it('sends a reader to the front door for compatibility and gallery', () => {
    expect(text).toContain(`(${familyApp().productionUrl}/docs/compatibility)`);
    expect(text).toContain(`(${familyApp().productionUrl}/docs/gallery)`);
    expect(text).not.toContain(`(${sibling.productionUrl}/docs/compatibility)`);
  });

  it('writes each page’s Markdown twin with its source URL and without frontmatter', async () => {
    const md = await markdownOf(site, page('/docs/coming-from/x', 'Coming from x'));
    expect(md).toContain(`Source: ${sibling.productionUrl}/docs/coming-from/x`);
    expect(md).not.toContain('title: Coming from x');
  });
});
