/**
 * Phase 0 baseline for charterparty metric A1 (`.sdlc/intents/charterparty/metrics.md`): the bytes
 * an agent reads to understand one operation without `explain` — the operation object from the raw
 * spec with every local `$ref` inlined (a cycle keeps its `$ref`). Reports the distribution over
 * every operation in the spec.
 *
 *   node benchmarks/charterparty/explain-baseline.ts <spec.json> > reading.json
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** Deeper than any schema in the bench specs; past it a node is kept as written. */
const MAX_DEPTH = 64;
const P50 = 0.5;
const P90 = 0.9;
const P99 = 0.99;
const METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);

function lookUp(root: Json, pointer: string): Json {
  return pointer
    .slice(2)
    .split('/')
    .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce<Json>((node, key) => (node as Record<string, Json>)[key] ?? null, root);
}

function inline(root: Json, node: Json, open: ReadonlySet<string>, depth = 0): Json {
  if (depth > MAX_DEPTH) return node;
  // eslint-disable-next-line secure-coding/no-unchecked-loop-condition -- bounded by MAX_DEPTH on the line above
  if (Array.isArray(node)) return node.map((item) => inline(root, item, open, depth + 1));
  if (node === null || typeof node !== 'object') return node;
  const ref = node['$ref'];
  if (typeof ref === 'string' && ref.startsWith('#/')) {
    if (open.has(ref)) return node;
    return inline(root, lookUp(root, ref), new Set([...open, ref]), depth + 1);
  }
  return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, inline(root, value, open, depth + 1)]));
}

function quantile(sorted: number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? Number.NaN;
}

const argument = process.argv[2];
if (!argument) throw new Error('usage: explain-baseline.ts <spec.json>');
// eslint-disable-next-line node-security/no-arbitrary-file-access -- a local bench script; the path is the operator's own argument
const text = readFileSync(path.resolve(argument), 'utf8');
const root = JSON.parse(text) as Json;
const spec = root as { paths: Record<string, Record<string, Json>> };

const sizes: number[] = [];
for (const item of Object.values(spec.paths)) {
  for (const [method, operation] of Object.entries(item)) {
    if (!METHODS.has(method)) continue;
    const resolved = inline(root, { parameters: item['parameters'] ?? [], ...(operation as object) }, new Set());
    sizes.push(Buffer.byteLength(JSON.stringify(resolved)));
  }
}
sizes.sort((x, y) => x - y);

process.stdout.write(
  `${JSON.stringify(
    {
      date: new Date().toISOString(),
      metric: 'A1 baseline: raw operation bytes, local $refs inlined',
      operations: sizes.length,
      bytes: {
        p50: quantile(sizes, P50),
        p90: quantile(sizes, P90),
        p99: quantile(sizes, P99),
        max: sizes.at(-1),
      },
      wholeSpecBytes: Buffer.byteLength(text),
    },
    null,
    2,
  )}\n`,
);
