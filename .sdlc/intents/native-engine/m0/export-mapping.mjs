// Write `migrate`'s MAPPING, from the built dist, as `from<TAB>to` lines: the one table both builds read.
//   node export-mapping.mjs <packages/burgee/dist> <out.tsv>
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
const [dist, out] = process.argv.slice(2);
const { MAPPING } = await import(join(dist, 'migrate.js'));
writeFileSync(out, Object.entries(MAPPING).map(([from, to]) => `${from}\t${to}\n`).join(''));
console.log(`${Object.keys(MAPPING).length} specifiers`);
