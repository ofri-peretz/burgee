import { docsNextConfig } from 'docs-chassis/next-config';

// The front door's row is `familyPages: true`, so this config also carries the 301s from every
// URL a package page used to have here to the package's own host — derived from the table.
export default docsNextConfig();
