// Shell check (exits non-zero on the first mismatch) for evals/cases/apicontract-baseline-allocate.json.
import { pathToFileURL } from 'node:url';

const file = process.argv[2] ?? 'evals/results/allocate.mjs';
const { allocateBerth } = await import(pathToFileURL(file).href);

let call;
const fakeFetch = async (url, init = {}) => {
  call = { url: String(url), method: (init.method ?? 'GET').toUpperCase(), body: init.body };
  return new Response(JSON.stringify({ allocationId: 'a1', state: 'held' }), {
    status: 201,
    headers: { 'content-type': 'application/json' },
  });
};

const result = await allocateBerth(fakeFetch, {
  port: 'NLRTM',
  berth: 'EMX-4',
  voyage: 'V2611',
  imo: 'IMO9321483',
  opensAt: '2026-11-10T06:00:00Z',
  closesAt: '2026-11-10T10:00:00Z',
  draughtMetres: 14.5,
});

const fail = (message) => {
  throw new Error(`mismatch: ${message}`);
};
if (!call) fail('fetch was never called');
if (call.method !== 'PUT') fail(`method ${call.method}, contract says PUT`);
const path = new URL(call.url, 'https://harbour.invalid').pathname;
if (path !== '/ports/NLRTM/berths/EMX-4/allocations/V2611') fail(`path ${path}`);
const body = JSON.parse(call.body ?? 'null');
const expected = {
  vesselImo: 'IMO9321483',
  etaWindow: { opensAt: '2026-11-10T06:00:00Z', closesAt: '2026-11-10T10:00:00Z' },
  draughtDm: 145,
};
if (JSON.stringify(body) !== JSON.stringify(expected)) fail(`body ${JSON.stringify(body)}`);
if (result?.state !== 'held') fail(`returned ${JSON.stringify(result)}, expected the Allocation`);
console.log('allocate: ok');
