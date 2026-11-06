// Shell check (exits non-zero on the first mismatch) for evals/cases/apicontract-baseline-manifest.json.
import { pathToFileURL } from 'node:url';

const file = process.argv[2] ?? 'evals/results/manifest.mjs';
const { mostDangerousUnNumbers } = await import(pathToFileURL(file).href);

let requested;
const manifest = {
  voyageRef: 'V2611',
  cargoLines: [
    { hsCode: '2710.12', grossKg: 18000, hazmat: { unNumber: 'UN1203', packingGroup: 'II' } },
    { hsCode: '2806.10', grossKg: 900, hazmat: { unNumber: 'UN1789', packingGroup: 'I' } },
    { hsCode: '8471.30', grossKg: 1200 },
    { hsCode: '2812.10', grossKg: 400, hazmat: { unNumber: 'UN1758', packingGroup: 'I' } },
  ],
};
const fakeFetch = async (url) => {
  requested = new URL(String(url), 'https://harbour.invalid').pathname;
  return new Response(JSON.stringify(manifest), { status: 200, headers: { 'content-type': 'application/json' } });
};

const result = await mostDangerousUnNumbers(fakeFetch, 'V2611');
const fail = (message) => {
  throw new Error(`mismatch: ${message}`);
};
if (requested !== '/voyages/V2611/manifest') fail(`path ${requested}`);
if (JSON.stringify([...(result ?? [])].sort()) !== JSON.stringify(['UN1758', 'UN1789'])) {
  fail(`returned ${JSON.stringify(result)}`);
}
console.log('manifest: ok');
