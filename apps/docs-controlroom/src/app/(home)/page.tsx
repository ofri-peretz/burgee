import { site } from '#/site';
import { source } from '#/source';
import { homeMetadata, PackageHome } from 'docs-chassis/package-home';

const metadata = homeMetadata(site);

export default function HomePage() {
  return <PackageHome site={site} source={source} />;
}

export { metadata };
