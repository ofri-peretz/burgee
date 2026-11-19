/**
 * Roadmap 3.3 (`.sdlc/intents/oxmutate-fastest/dry-reuse.md`): each test file's dry-run results,
 * kept in the incremental file under a key of everything they depend on, so a run under
 * `incremental` dry-runs only the files whose key changed. The coordinator owns the run; this is
 * the data: what is kept, what is merged, and when a kept file is believed.
 */
import { FILE_KEY } from './runtime.js';

type Hits = Record<string, Record<string, number>>;
/** A test as the dry run reports it (the coordinator's `TestInfo` and its state). */
type DryTest = { id: string; file: string; name: string; ms: number; state: string };
/** Several hit maps as one; a later map's test wins, as one run's records are merged. */
const union = (maps: readonly Hits[]): Hits => Object.fromEntries(maps.flatMap((m) => Object.entries(m)));

/** What one dry run reports, as the coordinator reads it. */
export interface DryResult {
  tests: DryTest[];
  perTest: Hits;
  /** Hits with no test current (a setup file loading a source): they cannot be split by file. */
  static: Record<string, number>;
  runOnce: string[];
  modules: Record<string, string[]>;
  reads: { static: Record<string, number>; perTest: Hits };
}

/** One test file's part of a dry run, and the key it was kept under. */
export interface DryEntry {
  key: string;
  tests: DryTest[];
  /** Its tests' coverage, and its collection's (`file:<path>`). */
  perTest: Hits;
  modules: string[];
  runOnce: boolean;
  flaky: string[];
  /** Present when the run that kept it tracked reads (`static.readers`). */
  reads?: Hits | undefined;
}

/** The incremental file's `dry` block. `static`: the last run had hits no file owns, so none is kept. */
export interface DryCache {
  static: boolean;
  files: Record<string, DryEntry>;
}

const pick = (hits: Hits, ids: readonly string[]): Hits => Object.fromEntries(ids.filter((id) => id in hits).map((id) => [id, hits[id] ?? {}]));

/** The run's results, one entry per test file, keyed by `keyOf`. */
export function entriesOf(dry: DryResult, keyOf: (file: string, modules: readonly string[]) => string, flaky: ReadonlySet<string>, reads: Hits | undefined): DryCache {
  if (Object.keys(dry.static).length > 0) return { static: true, files: {} };
  const files = new Set([...Object.keys(dry.modules), ...dry.tests.map((t) => t.file)]);
  const entry = (file: string): DryEntry => {
    const tests = dry.tests.filter((t) => t.file === file);
    const ids = [...tests.map((t) => t.id), `${FILE_KEY}${file}`];
    const modules = dry.modules[file] ?? [];
    return { key: keyOf(file, modules), tests, perTest: pick(dry.perTest, ids), modules, runOnce: dry.runOnce.includes(file), flaky: tests.filter((t) => flaky.has(t.id)).map((t) => t.id), ...(reads && { reads: pick(reads, ids) }) };
  };
  return { static: false, files: Object.fromEntries([...files].map((file) => [file, entry(file)])) };
}

/**
 * The stored files whose key still holds, less the ones `audit` picks to run anyway. A deleted
 * test file's key reads it as missing, so it is never kept; a new one is in no entry, so it runs.
 */
export function keepable(stored: DryCache | undefined, keyOf: (file: string, modules: readonly string[]) => string, audit: () => boolean): { kept: Record<string, DryEntry>; audited: Record<string, DryEntry> } {
  if (!stored || stored.static) return { kept: {}, audited: {} };
  const holding = Object.entries(stored.files).filter(([file, entry]) => entry.key === keyOf(file, entry.modules));
  const picked = holding.map(([file, entry]): [string, DryEntry, boolean] => [file, entry, audit()]);
  // fromEntries defines own keys: a stored file named `__proto__` stays a key, never a prototype.
  const of = (audited: boolean): Record<string, DryEntry> => Object.fromEntries(picked.filter(([, , a]) => a === audited).map(([f, e]) => [f, e]));
  return { kept: of(false), audited: of(true) };
}

/** The fresh run and the kept files, as one dry run over all of them would have reported. */
export function merge(fresh: DryResult, kept: Record<string, DryEntry>): DryResult {
  const entries = Object.entries(kept);
  return {
    tests: [...fresh.tests, ...entries.flatMap(([, e]) => e.tests)],
    perTest: union([fresh.perTest, ...entries.map(([, e]) => e.perTest)]),
    static: fresh.static,
    runOnce: [...fresh.runOnce, ...entries.filter(([, e]) => e.runOnce).map(([f]) => f)],
    modules: Object.fromEntries([...Object.entries(fresh.modules), ...entries.map(([f, e]): [string, string[]] => [f, e.modules])]),
    reads: { static: fresh.reads.static, perTest: union([fresh.reads.perTest, ...entries.map(([, e]) => e.reads ?? {})]) },
  };
}

/** Each test's id, state and the mutants it reached, then the file collection's: what the verdicts are planned from. */
function shape(tests: readonly DryTest[], perTest: Hits, file: string): string {
  const covered = (id: string): string => Object.keys(perTest[id] ?? {}).sort().join(',');
  // Stryker disable next-line StringLiteral: a test is `<Vitest's id>:<one-word state>:<ids>`, so no two lists run together alike without the separator
  return [...tests.map((t) => `${t.id}:${t.state}:${covered(t.id)}`).sort(), `${FILE_KEY}:${covered(`${FILE_KEY}${file}`)}`].join('|');
}

/** Whether a file run afresh reported what was kept for it. Hit counts may differ; what each test reaches may not. */
export function agrees(fresh: DryResult, file: string, entry: DryEntry): boolean {
  return shape(fresh.tests.filter((t) => t.file === file), fresh.perTest, file) === shape(entry.tests, entry.perTest, file);
}
