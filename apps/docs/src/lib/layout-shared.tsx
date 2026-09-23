import { BurgeeMark } from '#/components/burgee-mark';
import { site } from '#/lib/site';
import { NAV_MARK_SIZE } from 'docs-chassis/brand-logo';
import { baseOptions as chassisOptions } from 'docs-chassis/nav';
import { type BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

/**
 * The front door's nav: the chassis nav every site shares, with burgee's own mark — the
 * generated component, not the favicon — and the two family-wide reading paths only this site
 * has.
 */
export function baseOptions(): BaseLayoutProps {
  return chassisOptions(site, {
    mark: <BurgeeMark size={NAV_MARK_SIZE} />,
    links: [
      { text: 'The floor', url: '/docs/the-floor' },
      { text: 'Research', url: '/docs/research' },
    ],
  });
}
