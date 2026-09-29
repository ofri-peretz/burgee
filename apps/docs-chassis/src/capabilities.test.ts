/**
 * The matrix's links and its Markdown twin, against the real `packages/flagstaff` data. Whether
 * each claim is *true* is `scripts/capabilities-lock.test.ts`'s job; this pins what a reader is
 * sent to and what an agent reads in place of the component.
 */
import { describe, expect, it } from 'vitest';

import { blobUrl, capabilityMarkdown, expandCapabilityMatrices, packageOfPath, readCapabilities, sourceUrl, themesOf } from './capabilities';

describe('where a cell links', () => {
  it('sends a URL to itself', () => {
    expect(sourceUrl('https://example.com/x@1.0.0/a.js')).toBe('https://example.com/x@1.0.0/a.js');
  });

  it('sends a vendored suite to its file on GitHub', () => {
    expect(sourceUrl('packages/compat-oracle/vendor/ora/test.js')).toBe(blobUrl('packages/compat-oracle/vendor/ora/test.js'));
  });

  it('sends an installed file to the published tarball of the version installed', () => {
    expect(sourceUrl('node_modules/ora/index.js')).toMatch(/^https:\/\/cdn\.jsdelivr\.net\/npm\/ora@\d+\.\d+\.\d+\/index\.js$/u);
  });

  it('reads the package of a nested or scoped path', () => {
    expect(packageOfPath('node_modules/ora/node_modules/chalk/source/index.js')).toEqual({ name: 'chalk', dir: 'node_modules/ora/node_modules/chalk', rest: 'source/index.js' });
    expect(packageOfPath('node_modules/@colors/colors/lib/index.js')).toEqual({ name: '@colors/colors', dir: 'node_modules/@colors/colors', rest: 'lib/index.js' });
    expect(packageOfPath('packages/x/y.js')).toBeUndefined();
  });
});

describe('the Markdown twin', () => {
  const caps = readCapabilities('flagstaff');

  it('has a table per theme, with a column for the package and each incumbent', () => {
    const text = capabilityMarkdown('flagstaff');
    for (const theme of caps.themes) expect(text).toContain(`### ${theme.theme}`);
    expect(text).toContain(`| Capability | **flagstaff** | ${caps.incumbents.join(' | ')} |`);
  });

  it('renders one theme when asked, and refuses one that does not exist', () => {
    const [first] = caps.themes;
    if (first === undefined) throw new Error('flagstaff has no themes');
    const text = capabilityMarkdown('flagstaff', { theme: first.theme });
    expect(text.match(/^### /gmu)).toHaveLength(1);
    expect(() => themesOf(caps, 'Not a theme')).toThrow(/no capability theme "Not a theme"/u);
  });

  it('replaces the component tag in MDX source, and leaves the rest alone', () => {
    const source = 'Before.\n\n<CapabilityMatrix pkg="flagstaff" theme="Compatibility" />\n\nAfter.\n';
    const out = expandCapabilityMatrices(source);
    expect(out).not.toContain('<CapabilityMatrix');
    expect(out).toContain('### Compatibility');
    expect(out.startsWith('Before.\n\n')).toBe(true);
    expect(out.endsWith('\n\nAfter.\n')).toBe(true);
  });

  it('fails the build on a package with no data, rather than rendering an empty table', () => {
    expect(() => expandCapabilityMatrices('<CapabilityMatrix pkg="no-such-package" />')).toThrow(/has no data/u);
    expect(() => expandCapabilityMatrices('<CapabilityMatrix />')).toThrow(/needs a pkg/u);
  });
});
