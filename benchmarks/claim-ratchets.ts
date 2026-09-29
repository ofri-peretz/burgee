/**
 * The three published claims that are downward-only ratchets rather than their original ≤ 1 bar
 * (D-157), read from `.sdlc/bands/claim-ratchets.json`.
 *
 * One reader, because three places need the same number and must never disagree: the claim in
 * `claims.ts` (what the README row says is met), the B4 ratio gate in `axes/weight.ts` and the B2
 * cold-start gate in `axes/perf.ts` (what makes `--check` exit 1). A claim that read 2.35 beside a
 * gate that read 2.9 would publish a ceiling nothing enforces.
 *
 * `scripts/claim-ratchets-lock.test.ts` holds the file to "down only"; `scripts/claim-ratchets.ts`
 * (`npm run ratchets:propose`) prints how far each can come down.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const RATCHETS_FILE = '.sdlc/bands/claim-ratchets.json';

export interface RatchetStep {
  ceiling: number;
  setOn: string;
  /** The D-row that set this step. A step up must cite a newer one than the step before it. */
  decision: string;
  measured: number;
  why: string;
}

export interface Ratchet {
  ceiling: number;
  unit: 'ratio';
  /** The bar this claim carried before it became a ratchet, so the page can say what moved. */
  was: string;
  derive:
    | { source: 'bundle'; headroomBytes: number; step: number; rule: string }
    | { source: 'ci'; observations: number; sigmas: number; step: number; rule: string };
  history: RatchetStep[];
}

export interface RatchetsDoc {
  $comment: string;
  ratchets: Record<string, Ratchet>;
}

export function readRatchets(root: string = REPO_ROOT): RatchetsDoc {
  return JSON.parse(readFileSync(resolve(root, RATCHETS_FILE), 'utf8')) as RatchetsDoc;
}

const doc = readRatchets();

/**
 * The ceiling for one claim id. Throws rather than defaulting, for the reason `releaseBudget` in
 * `axes/weight.ts` does: a missing ceiling must fail loudly, not run a gate at `Infinity`.
 */
export function claimRatchet(id: string): number {
  const ratchet = doc.ratchets[id];
  if (ratchet === undefined) throw new Error(`no ratchet "${id}" in ${RATCHETS_FILE} — a gate with no ceiling is not a gate`);
  return ratchet.ceiling;
}

/** Every claim id that is a ratchet, so `claims.ts` can word those rows as what they gate. */
export const RATCHETED: ReadonlySet<string> = new Set(Object.keys(doc.ratchets));

/** Digits kept before rounding up, so `2.35 / 0.05` reads 47 and not 47.00000000000001. */
const FLOAT_GUARD_PLACES = 9;

/** Round up to the next multiple of `step`, without float residue deciding the answer. */
export function ceilToStep(value: number, step: number): number {
  const places = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  const units = Math.ceil(Number((value / step).toFixed(FLOAT_GUARD_PLACES)));
  return Number((units * step).toFixed(places));
}
