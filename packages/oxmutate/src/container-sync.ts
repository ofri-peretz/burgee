/**
 * What the host remembers between container runs, so a run sends only what changed: per volume, a
 * token the volume also holds, the install key, and each sent file's size and modification time.
 * Kept under the user's cache (`$XDG_CACHE_HOME/oxmutate/sync`, else `~/.cache/oxmutate/sync`).
 * The token is the guard: a volume that was removed or replaced holds another (or none), the delta
 * refuses to apply, and the whole repository is sent again.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

import { env } from './runtime.js';

export interface SyncState {
  token: string;
  install: string;
  /** Repository-relative path → `<size>:<mtimeMs>` when it was last sent. */
  files: Record<string, string>;
}

/** More deletions than this in one run go as a whole sync: each is an argument of the sync script. */
export const MAX_DELETES = 500;

/** Where the host keeps what it last sent to each volume. */
export const syncDir = (): string => path.join(env['XDG_CACHE_HOME'] || path.join(homedir(), '.cache'), 'oxmutate', 'sync');

const stateFile = (volume: string): string => path.join(syncDir(), `${volume.replaceAll(/[^\w.-]/gu, '_')}.json`);

export function readState(volume: string): SyncState | undefined {
  try {
    const s = JSON.parse(readFileSync(stateFile(volume), 'utf8')) as Partial<SyncState>;
    return typeof s.token === 'string' && typeof s.install === 'string' && s.files && typeof s.files === 'object' ? (s as SyncState) : undefined;
  } catch {
    return undefined;
  }
}

export function writeState(volume: string, state: SyncState): void {
  mkdirSync(syncDir(), { recursive: true });
  writeFileSync(stateFile(volume), JSON.stringify(state));
}

export function dropState(volume: string): void {
  rmSync(stateFile(volume), { force: true });
}

/** Each file's `<size>:<mtimeMs>`: a stat, not a read, so the host opens none of them to compare. */
export function signatures(top: string, files: readonly string[]): Record<string, string> {
  return Object.fromEntries(
    files.flatMap((f) => {
      const s = statSync(path.join(top, f), { throwIfNoEntry: false });
      return s?.isFile() ? [[f, `${String(s.size)}:${String(s.mtimeMs)}`]] : [];
    }),
  );
}

export type SyncPlan =
  | { mode: 'whole'; token: string; send: string[] }
  | { mode: 'delta'; token: string; send: string[]; deleted: string[] }
  | { mode: 'skip'; token: string };

/**
 * What this run sends. Whole when there is no state, the volume is new, or too much was deleted;
 * a delta of the changed and deleted files otherwise; nothing (no sync container at all) when
 * nothing changed and the install key holds.
 */
export function planSync(now: Record<string, string>, prior: SyncState | undefined, o: { volumeExisted: boolean; install: string; mustRun: boolean }): SyncPlan {
  const all = Object.keys(now);
  if (!prior || !o.volumeExisted) return { mode: 'whole', token: randomUUID(), send: all };
  const send = all.filter((f) => prior.files[f] !== now[f]);
  const deleted = Object.keys(prior.files).filter((f) => !(f in now));
  if (deleted.length > MAX_DELETES) return { mode: 'whole', token: randomUUID(), send: all };
  if (send.length === 0 && deleted.length === 0 && prior.install === o.install && !o.mustRun) return { mode: 'skip', token: prior.token };
  return { mode: 'delta', token: prior.token, send, deleted };
}

/**
 * Run inside the sync container after a whole sync: deletes every file under the source that the
 * host's listing (argument 2, NUL-separated) does not name, except in `node_modules` and `.git`.
 * The listing is the truth, so a volume that drifted (a file added by an earlier delta, deleted
 * while the state was lost) is brought back in line.
 */
export const PRUNE = [
  "const fs=require('fs'),p=require('path');",
  "const [root,list]=process.argv.slice(1);",
  "const keep=new Set(fs.readFileSync(list,'utf8').split('\\0').filter(Boolean));",
  "const walk=(d)=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){",
  "if(e.name==='node_modules'||e.name==='.git')continue;",
  "const f=p.join(d,e.name);",
  "if(e.isDirectory())walk(f);",
  "else if(!keep.has(p.relative(root,f).split(p.sep).join('/')))fs.rmSync(f,{force:true});",
  "}};",
  'walk(root);',
].join('');

/** A fresh state for what was just sent. */
export const nextState = (plan: SyncPlan, install: string, now: Record<string, string>): SyncState => ({ token: plan.token, install, files: now });

/** Whether the host has any state at all (for `prune`'s report). */
export const hasStates = (): boolean => existsSync(syncDir());
