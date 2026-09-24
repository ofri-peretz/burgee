import { LAB_ROUTES, site } from '#/lib/site';
import { robotsOf } from 'docs-chassis/routes';

/**
 * `/robots.txt`: everything is crawlable except the design benches. The lab pages also carry
 * `noindex` themselves, because a disallow only stops a crawl.
 */
export default robotsOf(site, LAB_ROUTES);
