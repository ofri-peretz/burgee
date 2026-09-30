/**
 * B5's ceilings — one downward-only ratchet per (package, incumbent) pair, read from
 * `.sdlc/bands/runtime-ratchets.json`.
 *
 * Same discipline as the D-157 claim ratchets (`claim-ratchets.ts`), and the same lock rules
 * (`scripts/ratchet-steps.ts`): the file holds each ceiling *and its history*, a step may only
 * go down unless it cites a newer decision, and the history is append-only. The difference is
 * the target. A claim ratchet replaced a bar that was structurally out of reach; every B5 pair
 * has the same bar, **at or below the incumbent (≤ 1.0)**, and a pair that starts above it gets
 * a ceiling just above today's CI measurement that each fix PR lowers.
 *
 * `scripts/runtime-ratchets-lock.test.ts` holds the file to that; `npm run ratchets:propose`
 * prints how far each ceiling can come down from the CI observations on main.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { type RatchetStep } from './claim-ratchets.js';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const RUNTIME_RATCHETS_FILE = '.sdlc/bands/runtime-ratchets.json';

export interface RuntimeRatchet {
  ceiling: number;
  unit: 'ratio';
  /** The bar the pair is held to in the end: at or below the incumbent. */
  target: number;
  /**
   * How a ceiling is derived from CI: the largest median of the last `observations` CI runs,
   * times `headroom` for the runner's noise, rounded up to `step`.
   */
  derive: { source: 'ci'; observations: number; headroom: number; step: number; rule: string };
  history: RatchetStep[];
}

export interface RuntimeRatchetsDoc {
  $comment: string;
  ratchets: Record<string, RuntimeRatchet>;
}

export function readRuntimeRatchets(root: string = REPO_ROOT): RuntimeRatchetsDoc {
  return JSON.parse(readFileSync(resolve(root, RUNTIME_RATCHETS_FILE), 'utf8')) as RuntimeRatchetsDoc;
}

const doc = readRuntimeRatchets();

/** The ratchet for one pair id. Throws rather than defaulting: a gate with no ceiling is not a gate. */
export function runtimeRatchet(id: string): RuntimeRatchet {
  const ratchet = doc.ratchets[id];
  if (ratchet === undefined) throw new Error(`no ratchet "${id}" in ${RUNTIME_RATCHETS_FILE} — a gate with no ceiling is not a gate`);
  return ratchet;
}
