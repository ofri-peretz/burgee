/**
 * What a run would do to each file (apicontract-gen-command R4), decided without touching the
 * disk: the caller reads what is there and writes what this returns. Pure, so every rule of
 * regeneration safety is tested here and nowhere else.
 *
 * - a `user` file is written once: present on disk, it is skipped, whatever it holds;
 * - a `generated` file is rewritten when what is on disk is still what apicontract wrote (its header's
 *   hash matches its body, or, for a language without comments, the map recorded its hash);
 * - anything else at a generated path is a hand edit, or a file apicontract never wrote, and is a
 *   `conflict` that only `--force` overwrites;
 * - a generated file the previous run wrote and this one does not is deleted, on the same terms.
 */
import { type GeneratedFile, type Owner } from './host.js';
import { digest, readHeader, withHeader } from './run-header.js';

export type Action = 'write' | 'skip' | 'unchanged' | 'conflict' | 'delete';

export interface Planned {
  /** Relative to the project root, with `/` separators. */
  readonly path: string;
  readonly owner: Owner;
  readonly action: Action;
  /** What is on disk now, if anything. */
  readonly before: string | undefined;
  /** What a write leaves on disk: the header and the body. `undefined` for a delete. */
  readonly after: string | undefined;
}

export interface PlanOptions {
  /** The command the header names. */
  readonly command: string;
  /** The body hashes the previous map recorded for the targets this run writes, by path. */
  readonly recorded?: ReadonlyMap<string, string>;
  /** Overwrite (or delete) a generated file that was edited by hand. */
  readonly force?: boolean | undefined;
}

/** What is on disk at each path that has a file: its contents. */
export type Disk = ReadonlyMap<string, string>;

/** Whether the bytes on disk are still what apicontract wrote at `path`. */
const intact = (path: string, content: string, recorded: ReadonlyMap<string, string>): boolean => {
  const header = readHeader(content);
  // eslint-disable-next-line secure-coding/no-insecure-comparison, node-security/no-timing-unsafe-compare -- content hashes of files on the user's disk, not secrets
  return header === undefined ? recorded.get(path) === digest(content) : header.hash === digest(header.body);
};

const generated = (file: GeneratedFile, disk: Disk, options: PlanOptions, recorded: ReadonlyMap<string, string>): Planned => {
  const before = disk.get(file.path);
  const after = withHeader(file.path, file.content, options.command);
  const entry = { path: file.path, owner: file.owner, before, after };
  if (before === undefined) return { ...entry, action: 'write' };
  if (before === after) return { ...entry, action: 'unchanged' };
  return { ...entry, action: options.force === true || intact(file.path, before, recorded) ? 'write' : 'conflict' };
};

/** Every path this run touches or refuses, sorted by path. Paths that need nothing done are listed as `unchanged` or `skip`. */
export const plan = (files: readonly GeneratedFile[], disk: Disk, options: PlanOptions): Planned[] => {
  const recorded = options.recorded ?? new Map<string, string>();
  const planned = files.map((file): Planned => {
    if (file.owner === 'generated') return generated(file, disk, options, recorded);
    const before = disk.get(file.path);
    return { path: file.path, owner: 'user', action: before === undefined ? 'write' : 'skip', before, after: before ?? file.content };
  });
  const produced = new Set(files.map((file) => file.path));
  for (const path of recorded.keys()) {
    const before = disk.get(path);
    if (produced.has(path) || before === undefined) continue;
    const action = options.force === true || intact(path, before, recorded) ? 'delete' : 'conflict';
    planned.push({ path, owner: 'generated', action, before, after: undefined });
  }
  const byPath = new Map(planned.map((entry) => [entry.path, entry]));
  return [...byPath.keys()].toSorted().map((path) => byPath.get(path) as Planned);
};

/** The entries that change the disk. */
export const changes = (planned: readonly Planned[]): Planned[] => planned.filter((entry) => entry.action === 'write' || entry.action === 'delete');
