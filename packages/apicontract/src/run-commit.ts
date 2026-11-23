/**
 * The tail every writing command shares (`gen`, `extract`): plan what the produced files do to the
 * disk, refuse a hand edit, then print the diff (`--dry-run`), report what is stale (`--check`), or
 * write the files and `contractdiff.map.json`. One place, so the safety rules hold for every target.
 */
import { type ContractFinding } from './core/model.js';
import { type Owner } from './host.js';
import { applyPlan, readDisk } from './run-apply.js';
import { unifiedDiff } from './run-diff.js';
import { MAP_FILE, type MapFile, parseMap, type Produced, recordedFor, serializeMap, updateMap } from './run-map.js';
import { type Action, changes, plan, type Planned } from './run-plan.js';

export interface FileReport {
  readonly path: string;
  readonly owner: Owner;
  readonly action: Action;
  /** The target that produced it; absent for the map itself. */
  readonly target?: string;
}

export interface Report {
  readonly files: readonly FileReport[];
  /** Whether a file was written or deleted, or would be under `--check` and `--dry-run`: what burgee asks of an idempotent command (N7). */
  readonly changed: boolean;
  /** How many files were written or deleted, or would be. */
  readonly changes: number;
  readonly unchanged: number;
  /** User files left as they are. */
  readonly skipped: number;
  readonly findings: readonly (ContractFinding & { readonly target: string })[];
  /** `--dry-run`: the unified diff of every change. */
  readonly diff?: string;
  /** `--check`: the files that are not what a run would write. */
  readonly stale?: readonly string[];
  readonly exitCode?: 1;
  readonly fix?: string;
}

export interface CommitOptions {
  readonly root: string;
  /** The command the generated headers name. */
  readonly command: string;
  readonly produced: readonly Produced[];
  readonly findings: readonly (ContractFinding & { readonly target: string })[];
  readonly check?: boolean | undefined;
  readonly dryRun?: boolean | undefined;
  readonly force?: boolean | undefined;
}

const count = (entries: readonly Planned[], action: Action): number => entries.filter((entry) => entry.action === action).length;

/** Plan, refuse, and write (or only report). Throws on a hand edit in a generated file. */
export const commit = (options: CommitOptions): Report => {
  const { root, command, produced } = options;
  const all = produced.flatMap((entry) => entry.files);
  const seen = new Map<string, string>();
  for (const { target, files } of produced) {
    for (const file of files) {
      const other = seen.get(file.path);
      if (other !== undefined) throw new Error(`targets "${other}" and "${target}" both write "${file.path}". fix: give them different \`out\` folders`);
      seen.set(file.path, target);
    }
  }
  const map = parseMap(readDisk(root, [MAP_FILE]).get(MAP_FILE));
  const recorded = recordedFor(map, produced.map((entry) => entry.target));
  const disk = readDisk(root, [...seen.keys(), ...recorded.keys(), MAP_FILE]);
  const planned = plan(all, disk, { command, recorded, force: options.force });
  const conflicts = planned.filter((entry) => entry.action === 'conflict').map((entry) => entry.path);
  if (conflicts.length > 0) {
    throw new Error(`generated files were edited by hand: ${conflicts.join(', ')}. fix: move the change to a user file, or pass --force`);
  }
  const before = disk.get(MAP_FILE);
  const after = serializeMap(updateMap(map, produced));
  const entries: Planned[] = [...planned, { path: MAP_FILE, owner: 'generated', action: before === after ? 'unchanged' : 'write', before, after }];
  // Every path but the map's is one this run produced, or one the previous map recorded.
  const targetOf = (path: string): string => seen.get(path) ?? (map.files[path] as MapFile).target;
  const changed = changes(entries);
  const report = {
    files: entries.map((entry) => ({ path: entry.path, owner: entry.owner, action: entry.action, ...(entry.path === MAP_FILE ? {} : { target: targetOf(entry.path) }) })),
    changed: changed.length > 0,
    changes: changed.length,
    unchanged: count(entries, 'unchanged'),
    skipped: count(entries, 'skip'),
    findings: options.findings,
  };
  if (options.check === true) {
    const stale = changed.map((entry) => entry.path);
    return stale.length === 0 ? { ...report, stale } : { ...report, stale, exitCode: 1, fix: `run \`${command}\` and commit the result` };
  }
  if (options.dryRun === true) return { ...report, diff: changed.map((entry) => unifiedDiff(entry.path, entry.before, entry.after)).join('') };
  applyPlan(root, entries);
  return report;
};

/** Where a target's file lands: its `out` folder joined to the path the generator returned. */
export const under = (out: string, path: string): string => (out === '.' ? path : `${out}/${path}`);
