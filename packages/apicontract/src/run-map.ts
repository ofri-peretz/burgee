/**
 * `apicontract.map.json` (apicontract-gen-command R7, spec.md R-BL1): for each operation, the files
 * and symbols generated for it. `check`, `diff` and the contract-test plugins read it.
 *
 * It also records, under `files`, every generated file a run wrote and the hash of its body: that is
 * how a file in a language without comments (JSON) is known to be unedited, and how a file a
 * target stopped producing is known to be apicontract's to delete (R5). Keys are sorted, so the
 * same inputs write the same bytes.
 */
import { type GeneratedFile } from './host.js';
import { ConfigError } from './run-config.js';
import { digest } from './run-header.js';

export const MAP_FILE = 'apicontract.map.json';

export interface MapEntry {
  readonly file: string;
  readonly symbol: string;
  readonly target: string;
  /**
   * `user` for the symbol the user owns that implements the operation (R-BL1): a method of the
   * controller class or a member of the handlers object a target wrote once. Absent for a generated one.
   */
  readonly owner?: 'user';
}

export interface MapFile {
  readonly target: string;
  /** sha256 of the body, 12 hex digits. */
  readonly sha: string;
}

export interface ContractMap {
  readonly version: 1;
  readonly operations: Readonly<Record<string, readonly MapEntry[]>>;
  readonly files: Readonly<Record<string, MapFile>>;
}

/** What one target produced this run, its paths relative to the project root. */
export interface Produced {
  readonly target: string;
  readonly files: readonly GeneratedFile[];
}

export const emptyMap = (): ContractMap => ({ version: 1, operations: {}, files: {} });

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const unreadable = (why: string): never => {
  throw new ConfigError(MAP_FILE, [`it ${why}. fix: delete ${MAP_FILE} and run \`apicontract gen\` again; it is regenerated, never edited`]);
};

const isMap = (value: unknown): value is ContractMap => isRecord(value) && value.version === 1 && isRecord(value.operations) && isRecord(value.files);

/** Read the map a previous run wrote; no file is an empty map. */
export const parseMap = (text: string | undefined): ContractMap => {
  if (text === undefined) return emptyMap();
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return unreadable('is not JSON');
  }
  return isMap(value) ? value : unreadable('is not a version 1 contract map');
};

/** The body hashes the map recorded for files of the given targets, by path. */
export const recordedFor = (map: ContractMap, targets: readonly string[]): Map<string, string> =>
  new Map(Object.entries(map.files).filter(([, entry]) => targets.includes(entry.target)).map(([path, entry]) => [path, entry.sha]));

/** Keys in code-unit order, the same on every OS and locale. */
const sorted = <T>(entries: Iterable<[string, T]>): Record<string, T> => {
  const all = new Map(entries);
  return Object.fromEntries([...all.keys()].toSorted().map((key) => [key, all.get(key) as T]));
};

/**
 * The map after a run: every entry of the targets that ran is replaced by what they produced now,
 * and the entries of the targets that did not run are kept as they were.
 */
/** Map entries in one stable order: target, then file, then symbol. */
const byTargetFileSymbol = (a: MapEntry, b: MapEntry): number =>
  `${a.target}\0${a.file}\0${a.symbol}`.localeCompare(`${b.target}\0${b.file}\0${b.symbol}`, 'en');

export const updateMap = (previous: ContractMap, produced: readonly Produced[]): ContractMap => {
  const ran = new Set(produced.map((entry) => entry.target));
  const operations = new Map<string, MapEntry[]>();
  const add = (id: string, entries: readonly MapEntry[]): void => {
    operations.set(id, [...(operations.get(id) ?? []), ...entries]);
  };
  for (const [id, entries] of Object.entries(previous.operations)) add(id, entries.filter((entry) => !ran.has(entry.target)));
  const files = new Map(Object.entries(previous.files).filter(([, entry]) => !ran.has(entry.target)));
  for (const { target, files: written } of produced) {
    for (const file of written) {
      if (file.owner === 'generated') files.set(file.path, { target, sha: digest(file.content) });
      const owned = file.owner === 'user' ? { owner: 'user' as const } : {};
      for (const { operation, symbol } of file.symbols ?? []) add(operation, [{ file: file.path, symbol, target, ...owned }]);
    }
  }
  const kept = [...operations].filter(([, entries]) => entries.length > 0).map(([id, entries]): [string, MapEntry[]] => [id, entries.toSorted(byTargetFileSymbol)]);
  return { version: 1, operations: sorted(kept), files: sorted(files) };
};

/** The symbols the user owns that implement an operation: what a rule on code reads (apicontract-lint R14). */
export const handlersOf = (map: ContractMap, operation: string): MapEntry[] =>
  Object.entries(map.operations)
    .filter(([id]) => id === operation)
    .flatMap(([, entries]) => entries.filter((entry) => entry.owner === 'user'));

/** The bytes the map is written as. */
export const serializeMap = (map: ContractMap): string => `${JSON.stringify(map, undefined, 2)}\n`;
