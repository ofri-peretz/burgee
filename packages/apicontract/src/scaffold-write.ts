/**
 * Write a scaffold under the owner rule (testing-owner.ts, the in-lane copy of the spine's writer
 * until PR #1619 lands): a file that is not there is written, one that is there with the same
 * bytes is left, and a user file that is there with other bytes is never touched.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { type GeneratedFile } from './host.js';
import { plan } from './testing-owner.js';

export interface Written {
  readonly written: readonly string[];
  readonly unchanged: readonly string[];
  /** There already, with other bytes: kept as they are. */
  readonly kept: readonly string[];
}

/** What a read of a file that is not there gives: nothing. */
const missing = (): undefined => undefined;

const current = async (path: string): Promise<string | undefined> => readFile(path, 'utf8').catch(missing);

/** Write `files` under `directory`, as the owner rule allows, and say what happened to each. */
export const writeFiles = async (directory: string, files: readonly GeneratedFile[]): Promise<Written> => {
  const found = await Promise.all(files.map(async (file) => [file.path, await current(join(directory, file.path))] as const));
  const planned = plan(files, new Map(found));
  const writes = planned.flatMap((entry, index) => (entry.action === 'write' ? [files[index] as GeneratedFile] : []));
  await Promise.all(
    writes.map(async (file) => {
      const target = join(directory, file.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.content);
    }),
  );
  const paths = (action: string): string[] => planned.filter((entry) => entry.action === action).map((entry) => entry.path);
  return { written: paths('write'), unchanged: paths('unchanged'), kept: paths('skip') };
};
