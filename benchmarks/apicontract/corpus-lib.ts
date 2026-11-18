/**
 * The pure half of the apicontract corpus (`.sdlc/intents/apicontract-corpus/spec.md`): the pin
 * file's shape, seeded sampling, tsc diagnostics attribution and the summary fold. Nothing here
 * touches the network, the disk or a subprocess, so `corpus-lib.test.ts` covers all of it.
 */

/** The contract formats the corpus holds. MCP has none pinned yet: no server publishes a snapshot. */
export type Family = 'openapi' | 'asyncapi' | 'jsonschema' | 'mcp';

/** One pinned source: a GitHub repository at one commit, and the documents it contributes. */
export interface PinnedSource {
  readonly family: Family;
  readonly repo: string;
  readonly commit: string;
  readonly license: string;
  /** Repository path → sha256 (hex) of the bytes at `commit`. */
  readonly documents: Readonly<Record<string, string>>;
}

/** The committed file: `benchmarks/apicontract/corpus/pins.json`. */
export interface PinFile {
  readonly version: 1;
  readonly sources: Readonly<Record<string, PinnedSource>>;
}

/** R1's row: what a run reads, expanded from the compact file. */
export interface Pin {
  readonly id: string;
  readonly source: string;
  readonly family: Family;
  readonly url: string;
  readonly sha256: string;
  readonly license: string;
}

const SHA256 = /^[\da-f]{64}$/;
const COMMIT = /^[\da-f]{40}$/;
const FAMILIES: readonly Family[] = ['openapi', 'asyncapi', 'jsonschema', 'mcp'];

/** The raw URL a pinned document is downloaded from: content-addressed by the commit. */
export const rawUrl = (repo: string, commit: string, path: string): string =>
  `https://raw.githubusercontent.com/${repo}/${commit}/${path.split('/').map(encodeURIComponent).join('/')}`;

/** Reads `pins.json`, refusing anything malformed rather than guessing. */
export function parsePins(text: string): PinFile {
  const value = JSON.parse(text) as Partial<PinFile>;
  if (value.version !== 1 || typeof value.sources !== 'object' || value.sources === null) throw new Error('pins.json: expected { "version": 1, "sources": { … } }');
  for (const [name, source] of Object.entries(value.sources)) {
    if (!FAMILIES.includes(source.family)) throw new Error(`pins.json: ${name} has an unknown family "${String(source.family)}"`);
    if (!COMMIT.test(source.commit)) throw new Error(`pins.json: ${name} is not pinned to a 40-hex commit`);
    if (typeof source.repo !== 'string' || !source.repo.includes('/')) throw new Error(`pins.json: ${name} has no owner/repo`);
    for (const [path, sha] of Object.entries(source.documents)) {
      if (!SHA256.test(sha)) throw new Error(`pins.json: ${name}:${path} has no sha256`);
    }
  }
  return value as PinFile;
}

/** Every document as an R1 row, sorted by id. */
export function expandPins(file: PinFile): Pin[] {
  const pins: Pin[] = [];
  for (const [source, entry] of Object.entries(file.sources)) {
    for (const [path, sha256] of Object.entries(entry.documents)) {
      pins.push({ id: `${source}:${path}`, source, family: entry.family, url: rawUrl(entry.repo, entry.commit, path), sha256, license: entry.license });
    }
  }
  return pins.toSorted((a, b) => (a.id < b.id ? -1 : 1));
}

const byKey = <T>(record: Readonly<Record<string, T>>): Record<string, T> =>
  Object.fromEntries(Object.entries(record).toSorted(([a], [b]) => (a < b ? -1 : 1)));

/** The file as committed: sources and documents in key order, one document per line. */
export function serializePins(file: PinFile): string {
  const sources = byKey(file.sources);
  const sorted = Object.fromEntries(Object.entries(sources).map(([name, s]) => [name, { ...s, documents: byKey(s.documents) }]));
  return `${JSON.stringify({ version: 1, sources: sorted }, undefined, 2)}\n`;
}

export interface PinDiff {
  readonly added: string[];
  readonly removed: string[];
  readonly changed: string[];
}

/** What a refresh of one source changes: ids added, removed, and whose bytes changed. */
export function diffSource(before: PinnedSource | undefined, after: PinnedSource): PinDiff {
  const old = before?.documents ?? {};
  const added = Object.keys(after.documents).filter((p) => !(p in old));
  const removed = Object.keys(old).filter((p) => !(p in after.documents));
  const changed = Object.keys(after.documents).filter((p) => p in old && old[p] !== after.documents[p]);
  return { added: added.toSorted(), removed: removed.toSorted(), changed: changed.toSorted() };
}

/* eslint-disable conventions/no-magic-numbers -- mulberry32's published constants and shifts */
/** mulberry32: a 32-bit seeded generator, so `--seed S` picks the same documents on every machine. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}
/* eslint-enable conventions/no-magic-numbers */

/** `n` of `items` chosen by a seeded shuffle, returned in id order; all of them when `n` is absent or larger. */
export function sample<T extends { readonly id: string }>(items: readonly T[], n: number | undefined, seed: number): T[] {
  const ordered = items.toSorted((a, b) => (a.id < b.id ? -1 : 1));
  if (n === undefined || n >= ordered.length) return ordered;
  const random = seeded(seed);
  const pool = [...ordered];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j] as T, pool[i] as T];
  }
  return pool.slice(0, n).toSorted((a, b) => (a.id < b.id ? -1 : 1));
}

/** The TypeScript compilers every output is checked under (metrics.md G5). */
export const TYPESCRIPTS = { ts59: '5.9.3', ts60: '6.0.3', ts70: '7.0.2' } as const;
export type TsKey = keyof typeof TYPESCRIPTS;

/** R3's row, one per document and tool. `null` is "not reached" or "not measured", never a pass. */
export interface Row {
  readonly id: string;
  readonly tool: string;
  /** Our adapter recognised and read the document. `null` for an incumbent, whose CLI reads and generates in one step. */
  readonly read: boolean | null;
  readonly generate: boolean;
  readonly typecheck: Record<TsKey, boolean | null>;
  /** `extract(gen(spec))` equals `spec` (metrics.md B1). `null` until a target has an extractor. */
  readonly roundtrip: boolean | null;
  /** Wall-clock of the generating process, start to exit. */
  readonly ms: number;
  readonly error: string | null;
}

/** `tsc --pretty false` prints `file(line,col): error TS…`; this returns the files that have one. */
export function filesWithErrors(output: string, root: string): Set<string> {
  const files = new Set<string>();
  for (const line of output.split('\n')) {
    const match = /^(.+?)\(\d+,\d+\): error TS\d+/.exec(line.trim());
    const found = match?.[1];
    if (found === undefined) continue;
    const file = found.replaceAll('\\', '/');
    files.add(file.startsWith(root) ? file.slice(root.length).replace(/^\//, '') : file);
  }
  return files;
}

/** The first line of an error worth keeping in a row: trimmed, and short. */
export function firstLine(text: string, max = 300): string {
  const line = text.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? '';
  return line.length > max ? `${line.slice(0, max)}…` : line;
}

/** The line of a CLI's failure output that says what went wrong: an `Error:` line before a stack frame or a banner. */
export function errorLine(text: string): string {
  const plain = text.replaceAll(/\u001B\[[\d;]*m/g, '');
  const lines = plain.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const pick = lines.find((l) => /^\w*Error\b|✘|❌|^\[?error\]?\b/i.test(l)) ?? lines.find((l) => /error/i.test(l) && !l.startsWith('at ')) ?? lines[0] ?? '';
  return firstLine(pick);
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = values.toSorted((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? (sorted[mid] as number) : Math.round(((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2);
}

/** A share over the rows where it was measured: passed / measured, and how many were measured. */
export interface Share {
  readonly passed: number;
  readonly of: number;
}

export interface ToolSummary {
  readonly tool: string;
  readonly documents: number;
  readonly read: Share;
  readonly generate: Share;
  readonly typecheck: Record<TsKey, Share>;
  /** Generated and type-checked under every TypeScript: the row a user would call "works". */
  readonly usable: Share;
  readonly roundtrip: Share;
  readonly medianMs: number | null;
  readonly p90Ms: number | null;
}

const share = (values: readonly (boolean | null)[]): Share => ({ passed: values.filter((v) => v === true).length, of: values.filter((v) => v !== null).length });

const P90 = 0.9;

/** R6: the jsonl rows of one tool folded into its line of the summary. Unmeasured cells stay out of the denominator. */
export function foldTool(tool: string, rows: readonly Row[]): ToolSummary {
  const keys = Object.keys(TYPESCRIPTS) as TsKey[];
  const ms = rows.filter((r) => r.generate).map((r) => r.ms).toSorted((a, b) => a - b);
  return {
    tool,
    documents: rows.length,
    read: share(rows.map((r) => r.read)),
    generate: share(rows.map((r) => r.generate)),
    typecheck: Object.fromEntries(keys.map((k) => [k, share(rows.map((r) => (r.generate ? r.typecheck[k] : false)))])) as Record<TsKey, Share>,
    usable: share(rows.map((r) => r.generate && keys.every((k) => r.typecheck[k] === true))),
    roundtrip: share(rows.map((r) => r.roundtrip)),
    medianMs: median(ms),
    p90Ms: ms.length === 0 ? null : (ms[Math.min(ms.length - 1, Math.floor(ms.length * P90))] ?? null),
  };
}

/** Generated, and type-checked under every TypeScript. */
const usable = (r: Row): boolean => r.generate && Object.values(r.typecheck).every((v) => v === true);

/** Documents where one tool is usable and another is not, both ways: the losing rows the intent asks to publish. */
export function disagreements(a: readonly Row[], b: readonly Row[]): { onlyA: string[]; onlyB: string[] } {
  const other = new Map(b.map((r) => [r.id, r]));
  const onlyA: string[] = [];
  const onlyB: string[] = [];
  for (const row of a) {
    const peer = other.get(row.id);
    if (peer === undefined) continue;
    if (usable(row) && !usable(peer)) onlyA.push(row.id);
    if (!usable(row) && usable(peer)) onlyB.push(row.id);
  }
  return { onlyA, onlyB };
}

const PERCENT = 100;
const pct = (s: Share): string => (s.of === 0 ? '—' : `${((s.passed / s.of) * PERCENT).toFixed(1)}% (${s.passed}/${s.of})`);

export interface SummaryInput {
  readonly run: string;
  readonly tools: readonly ToolSummary[];
  readonly rows: Readonly<Record<string, readonly Row[]>>;
  /** The tool every other one is compared with for losing rows, usually `ours:types`. */
  readonly subject?: string | undefined;
  /** At most this many losing ids are listed per pair. */
  readonly listed?: number | undefined;
}

const LISTED = 25;

/** R6: `summary.md`, the table the docs page renders and the losing rows beneath it. */
export function renderSummary({ run, tools, rows, subject, listed = LISTED }: SummaryInput): string {
  const lines = [
    `# apicontract corpus — ${run}`,
    '',
    'One row per tool over the same sampled documents. A share counts only the documents where the step was reached and measured;',
    '"read" is ours alone (an incumbent reads and generates in one step). "Usable" = generated and type-checked under TS 5.9, 6.0 and 7.0.',
    '',
    '| Tool | Docs | Read | Generate | TS 5.9 | TS 6.0 | TS 7.0 | Usable | Median ms | p90 ms |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...tools.map((t) =>
      `| ${t.tool} | ${t.documents} | ${pct(t.read)} | ${pct(t.generate)} | ${pct(t.typecheck.ts59)} | ${pct(t.typecheck.ts60)} | ${pct(t.typecheck.ts70)} | ${pct(t.usable)} | ${t.medianMs ?? '—'} | ${t.p90Ms ?? '—'} |`,
    ),
  ];
  const mine = subject === undefined ? undefined : rows[subject];
  if (subject !== undefined && mine !== undefined) {
    for (const t of tools) {
      if (t.tool === subject) continue;
      const { onlyA, onlyB } = disagreements(mine, rows[t.tool] ?? []);
      const list = (ids: string[]): string[] => [...ids.slice(0, listed).map((id) => `- \`${id}\``), ...(ids.length > listed ? [`- … and ${ids.length - listed} more (see the jsonl)`] : [])];
      lines.push('', `## ${subject} vs ${t.tool}`, '', `Usable for ${t.tool} only (where we lose): ${onlyB.length}`, '', ...(onlyB.length === 0 ? ['- none'] : list(onlyB)));
      lines.push('', `Usable for ${subject} only: ${onlyA.length}`, '', ...(onlyA.length === 0 ? ['- none'] : list(onlyA)));
    }
  }
  return `${lines.join('\n')}\n`;
}

const ERROR_KEY_CHARS = 160;

/** The first error each tool reported, grouped: what to fix first. */
export function topErrors(rows: readonly Row[], n = 5): { error: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.error === null) continue;
    const key = row.error.replaceAll(/\/\S+/g, '<path>').replaceAll(/"[^"]{0,80}"/g, '"…"').slice(0, ERROR_KEY_CHARS);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].map(([error, count]) => ({ error, count })).toSorted((a, b) => b.count - a.count).slice(0, n);
}

/** `--name value` and `--flag` arguments, as the other bench scripts read them. */
export function parseFlags(argv: readonly string[]): { flags: Map<string, string | true>; positional: string[] } {
  const flags = new Map<string, string | true>();
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string;
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const [name, inline] = arg.slice(2).split('=', 2) as [string, string | undefined];
    const next = argv[i + 1];
    if (inline !== undefined) flags.set(name, inline);
    else if (next !== undefined && !next.startsWith('--')) {
      flags.set(name, next);
      i += 1;
    } else flags.set(name, true);
  }
  return { flags, positional };
}
