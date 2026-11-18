/**
 * The corpus scripts' network and cache: one place that knows `$APICONTRACT_CORPUS_CACHE`, the
 * GitHub API, and how a download is retried and verified.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

import { type Pin, type PinFile, parsePins } from './corpus-lib.js';

/** The committed pin list (R1). */
export const PINS_FILE = path.join(import.meta.dirname, 'corpus', 'pins.json');

export function readPins(file = PINS_FILE): PinFile {
  return existsSync(file) ? parsePins(readFileSync(file, 'utf8')) : { version: 1, sources: {} };
}

/** Outside the repository: nothing downloaded is ever committed (intent constraint 1). */
export const cacheRoot = (): string => process.env.APICONTRACT_CORPUS_CACHE ?? path.join(homedir(), '.cache', 'apicontract-corpus');

/** Where a pinned document lives in the cache: by source and repository path, so it reads as the repo does. */
export const cachePath = (pin: Pick<Pin, 'id'>): string => {
  const [source, ...rest] = pin.id.split(':');
  return path.join(cacheRoot(), 'documents', source as string, ...rest.join(':').split('/'));
};

export const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

const RETRIES = 3;
/** The largest spec in the corpus is tens of MB; a minute is generous and still ends a stalled socket. */
const REQUEST_TIMEOUT_MS = 60_000;
const HTTP_SERVER_ERROR = 500;
const HTTP_TOO_MANY = 429;
const BACKOFF_MS = 750;
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** GET with retries on network errors and 5xx/429; a 4xx is final. */
export async function download(url: string, headers: Record<string, string> = {}): Promise<Buffer> {
  let last: unknown;
  for (let attempt = 0; attempt < RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { 'user-agent': 'apicontract-corpus', ...headers }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (response.ok) return Buffer.from(await response.arrayBuffer());
      last = new Error(`${url}: HTTP ${response.status}`);
      if (response.status < HTTP_SERVER_ERROR && response.status !== HTTP_TOO_MANY) break;
    } catch (error) {
      last = error;
    }
    await sleep(BACKOFF_MS * 2 ** attempt);
  }
  throw new Error(`download of ${url} failed after ${RETRIES} attempts: ${last instanceof Error ? last.message : String(last)}`, { cause: last });
}

/** The GitHub REST API, authenticated when `GITHUB_TOKEN` is set (sixty calls an hour without). */
export async function github<T>(route: string): Promise<T> {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  const headers: Record<string, string> = { accept: 'application/vnd.github+json', ...(token ? { authorization: `Bearer ${token}` } : {}) };
  return JSON.parse((await download(`https://api.github.com/${route}`, headers)).toString('utf8')) as T;
}

/** Writes through a temporary name, so an interrupted run never leaves a half file that looks cached. */
export function writeAtomic(file: string, bytes: Uint8Array): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const partial = `${file}.partial`;
  writeFileSync(partial, bytes);
  renameSync(partial, file);
}

/** The cached bytes when they hash to the pin, else `undefined`. */
export function cached(pin: Pin): Buffer | undefined {
  const file = cachePath(pin);
  if (!existsSync(file)) return undefined;
  const bytes = readFileSync(file);
  return sha256(bytes) === pin.sha256 ? bytes : undefined;
}

/** Runs `work` over `items`, `limit` at a time, in order of start. */
export async function pool<T, R>(items: readonly T[], limit: number, work: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = Array.from({ length: items.length });
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      // eslint-disable-next-line reliability/no-await-in-loop -- each lane is a sequential worker; `limit` lanes run at once
      results[index] = await work(items[index] as T, index);
    }
  });
  await Promise.all(lanes);
  return results;
}
