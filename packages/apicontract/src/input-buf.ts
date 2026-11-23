/**
 * Protobuf sources, compiled by the user's own buf (apicontract-protobuf R2): a `.proto` file, or a
 * folder holding `buf.yaml`, is built with `buf build <path> -o -#format=json` and its image read by
 * the `protobuf` adapter. buf runs through bellpull, as git does for `lint`; apicontract never
 * depends on it, and a test passes its own `BufBuild`.
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { ambientRuntime, NotFoundError, run, type Runtime } from 'bellpull';

import { UsageError } from './run-config.js';

/** The image text buf builds for a protobuf source, relative to `cwd`. */
export type BufBuild = (path: string, cwd: string) => Promise<string>;

/** What to do when buf is not there. */
const BUF_INSTALL = 'install buf (https://buf.build/docs/installation), or hand over the image `buf build -o image.json` writes';

/** A `.proto` file, or a folder that is a buf module or workspace. */
export const isBufSource = (path: string, cwd: string): boolean =>
  path.endsWith('.proto') || ['buf.yaml', 'buf.work.yaml'].some((file) => existsSync(join(resolve(cwd, path), file)));

/** buf, found on the runtime's PATH. */
export const bufIn = (runtime: Runtime = ambientRuntime()): BufBuild => async (path, cwd) => {
  // Not found is the one failure with a fix of its own; any other passes through as it is.
  const result = await run('buf', ['build', path, '-o', '-#format=json'], { cwd, runtime }).catch(async (error: unknown) => (error instanceof NotFoundError ? undefined : Promise.reject(error as Error)));
  if (result === undefined) throw new UsageError(`cannot build ${path}: buf is not on the PATH. fix: ${BUF_INSTALL}`);
  if (!result.ok) throw new UsageError(`buf could not build ${path}: ${result.stderr.trim()}. fix: correct what buf reports, then run again`);
  return result.stdout;
};

/** `git:<ref>:<path>`, as `diff` names a contract at a ref. */
const AT_REF = /^git:[^:]+:/;

/** Each spec that is protobuf source, built to its image text; every other spec is read as it is, and an absent one skipped. */
export const builtImages = async (specs: readonly (string | undefined)[], cwd: string, build: BufBuild): Promise<ReadonlyMap<string, string>> => {
  const sources = specs.filter((spec): spec is string => spec !== undefined && isBufSource(spec.replace(AT_REF, ''), cwd));
  const atRef = sources.find((spec) => AT_REF.test(spec));
  if (atRef !== undefined) throw new UsageError(`cannot build ${atRef}: buf builds a ref itself. fix: \`buf build '.git#ref=<ref>' -o old.json\` and pass old.json`);
  const images = await Promise.all(sources.map(async (spec) => [spec, await build(spec, cwd)] as const));
  return new Map(images);
};

/** `diff --level`: the buf breaking category each level names (apicontract-protobuf R3). */
export const LEVELS = ['file', 'package', 'wire-json', 'wire'] as const;
export type Level = (typeof LEVELS)[number];

/** One change buf breaking reports, as `--error-format json` prints it, one per line. */
export interface BufAnnotation {
  readonly path: string;
  readonly line: number;
  readonly type: string;
  readonly message: string;
}

/** What buf breaking reports for `nu` against `old` at `level`, relative to `cwd`. */
export type BufBreaking = (nu: string, old: string, level: Level, cwd: string) => Promise<readonly BufAnnotation[]>;

/** buf's exit status when it found what it checks for, as opposed to failing. */
const FOUND = 100;

/** A line's JSON, or `undefined` when it is not JSON. */
const jsonOf = (line: string): unknown => {
  // Stryker disable next-line BlockStatement: equivalent, an empty handler returns the same undefined
  try { return JSON.parse(line) as unknown; } catch { return undefined; }
};

const annotationOf = (line: string): BufAnnotation => {
  const parsed = jsonOf(line);
  const { path, start_line: start, type, message } = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as Record<string, unknown>;
  if (typeof type !== 'string' || typeof message !== 'string') throw new UsageError(`buf breaking printed what is not an annotation: ${line}. fix: run a buf that has --error-format json, then run again`);
  return { path: typeof path === 'string' ? path : '', line: typeof start === 'number' ? start : 0, type, message };
};

/** buf breaking, found on the runtime's PATH, with a config that uses the level's category alone. */
export const breakingIn = (runtime: Runtime = ambientRuntime()): BufBreaking => async (nu, old, level, cwd) => {
  const config = JSON.stringify({ version: 'v2', breaking: { use: [level.replace('-', '_').toUpperCase()] } });
  const result = await run('buf', ['breaking', nu, '--against', old, '--error-format', 'json', '--config', config], { cwd, runtime }).catch(async (error: unknown) => (error instanceof NotFoundError ? undefined : Promise.reject(error as Error)));
  if (result === undefined) throw new UsageError(`cannot judge ${nu} at --level ${level}: buf is not on the PATH. fix: install buf (https://buf.build/docs/installation), or drop --level`);
  if (!result.ok && result.code !== FOUND) throw new UsageError(`buf breaking could not compare ${nu} with ${old}: ${result.stderr.trim()}. fix: correct what buf reports, then run again`);
  return result.stdout.split('\n').filter((line) => line.trim() !== '').map(annotationOf);
};
