/**
 * The only code in apicontract that writes the user's disk (apicontract-gen-command R5). Each file
 * is written to a temporary file beside it and renamed over the old one, so a run killed halfway
 * never leaves half a file. It deletes only what a plan says to, and a plan deletes only files the
 * previous map recorded as generated.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { type Planned } from './run-plan.js';

/** What is on disk at each of `paths` under `root`; a path with no file is left out. */
export const readDisk = (root: string, paths: Iterable<string>): Map<string, string> => {
  const disk = new Map<string, string>();
  for (const path of paths) {
    const file = join(root, path);
    if (existsSync(file)) disk.set(path, readFileSync(file, 'utf8'));
  }
  return disk;
};

/** Write one file atomically: a temporary file in the same folder, then a rename. */
export const writeAtomic = (file: string, content: string): void => {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${String(process.pid)}.apicontract-tmp`;
  writeFileSync(temporary, content);
  renameSync(temporary, file);
};

/** Carry out the writes and the deletes of a plan; every other entry is left alone. */
export const applyPlan = (root: string, planned: readonly Planned[]): void => {
  for (const entry of planned) {
    if (entry.action === 'delete') rmSync(join(root, entry.path));
    else if (entry.action === 'write') writeAtomic(join(root, entry.path), entry.after as string);
  }
};
