/**
 * A change that edits a gate and the code the gate judges, together (triggerlist spec R6). Each
 * repository names its gates in the checklist; the checklist is read from the base branch, so a
 * change cannot remove a file from the list in the same change that edits it.
 */
import { matchesAny } from './match.js';

export interface Protection {
  readonly gates: readonly string[];
  readonly code: readonly string[];
  /** Both kinds changed together. */
  readonly flagged: boolean;
}

export const protect = (paths: readonly string[], gates: readonly string[]): Protection => {
  const gateFiles = paths.filter((path) => matchesAny(path, gates));
  const code = paths.filter((path) => !gateFiles.includes(path));
  return { gates: gateFiles, code, flagged: gateFiles.length > 0 && code.length > 0 };
};

export const toText = (protection: Protection, range: string, enforce: boolean): string => {
  if (!protection.flagged) return `${range} does not change a gate together with the code it judges`;
  return [
    `${range} changes ${String(protection.gates.length)} gate file(s) together with ${String(protection.code.length)} other file(s)${enforce ? '' : ' (observe mode: not failing)'}:`,
    ...protection.gates.map((path) => `  gate: ${path}`),
    `fix: land the gate change in its own pull request first, so the code is judged by a gate it did not change`,
  ].join('\n');
};
