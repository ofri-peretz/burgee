/**
 * The owner rule, as the spine's writer applies it (apicontract-gen-command R4): an in-lane copy
 * for the `regeneration` rule until `run-plan.ts` lands on main (PR #1619), then replaced by it.
 *
 * A `generated` file is rewritten when its bytes change; a `user` file that is already on disk is
 * never written again. So a spec change is safe only when every file the user owns comes out of
 * the generator byte for byte as it went in.
 */
import { type GeneratedFile } from './host.js';

export type Action = 'write' | 'skip' | 'unchanged';

export interface Planned {
  readonly path: string;
  readonly action: Action;
}

/** What the writer does with each file, given what is on disk, by path. */
export const plan = (files: readonly GeneratedFile[], disk: ReadonlyMap<string, string>): Planned[] =>
  files.map((file) => {
    const current = disk.get(file.path);
    if (current === file.content) return { path: file.path, action: 'unchanged' };
    return { path: file.path, action: current !== undefined && file.owner === 'user' ? 'skip' : 'write' };
  });

/** A user file a spec change would lose: one the writer would skip with other bytes, or overwrite. */
export interface Unsafe {
  readonly path: string;
  readonly problem: 'user file changes' | 'user file becomes generated';
}

/**
 * Regenerate `before` as `after` on a disk that holds `before`, and name every user file that
 * would not survive it. A user file the generator stops producing is left alone by the writer,
 * so it is not reported.
 */
export const unsafe = (before: readonly GeneratedFile[], after: readonly GeneratedFile[]): Unsafe[] => {
  const disk = new Map(before.map((file) => [file.path, file.content]));
  const owners = new Map(before.map((file) => [file.path, file.owner]));
  return plan(after, disk).flatMap(({ path, action }): Unsafe[] => {
    if (action === 'skip') return [{ path, problem: 'user file changes' }];
    if (action === 'write' && owners.get(path) === 'user') return [{ path, problem: 'user file becomes generated' }];
    return [];
  });
};
