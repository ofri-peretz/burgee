/**
 * agent-skill R3 — `burgee skill <entry> [--out <dir>] [--check]`: the two files an author
 * ships, written beside the program's binary, and the check an author's own CI runs on them.
 *
 * The entry is loaded the way `burgee dev` loads it (`dev.ts`'s `load`), so a commander or yargs
 * program on the façades gets its skill from the same manifest. `--out` defaults to the
 * directory of the `bin` its owning `package.json` names, so the files land beside the binary
 * and ship in the tarball when the author's `files` includes them.
 *
 * Loaded by the `skill` command only, behind an `await import()`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { load } from './dev.js';
import { ExitCode } from './exit-code.js';
import { owningPackage } from './pkg.js';
import { renderAgents, renderSkill } from './skill.js';
import { shellLine } from './unknown-option.js';

export interface SkillWritten {
  out: string;
  files: string[];
  changed: boolean;
}

export interface SkillStale {
  out: string;
  stale: string[];
  /** Always `false`: `--check` writes nothing (N7). */
  changed: false;
  fix: string;
  exitCode: ExitCode;
}

/** The directory of the entry's `bin`, read from the `package.json` that owns the entry. */
export function binDirOf(entry: string): string {
  const pkg = owningPackage(resolve(entry));
  const bin = pkg?.data['bin'];
  const bins: unknown[] = typeof bin === 'object' && bin !== null ? Object.values(bin as Record<string, unknown>) : [bin];
  const first = bins.find((v) => typeof v === 'string');
  if (pkg === undefined || typeof first !== 'string') throw new Error(`${entry}: no "bin" in the package.json that owns it; pass --out <dir>`);
  return dirname(resolve(dirname(pkg.path), first));
}

export async function writeSkill(entry: string, opts: { out?: string | undefined; check?: boolean | undefined } = {}): Promise<SkillWritten | SkillStale> {
  const out = resolve(opts.out ?? binDirOf(entry));
  const { manifest } = await load(entry, 0);
  const files = { 'SKILL.md': renderSkill(manifest), 'AGENTS.md': renderAgents(manifest) };
  const differs = Object.entries(files).filter(([file, text]) => {
    const at = join(out, file);
    return !existsSync(at) || readFileSync(at, 'utf8') !== text;
  });
  if (opts.check === true) {
    if (differs.length === 0) return { out, files: Object.keys(files), changed: false };
    return { out, stale: differs.map(([file]) => file), changed: false, fix: shellLine(['burgee', 'skill', entry, ...(opts.out === undefined ? [] : ['--out', opts.out])]), exitCode: ExitCode.RUNTIME };
  }
  mkdirSync(out, { recursive: true });
  for (const [file, text] of differs) writeFileSync(join(out, file), text);
  return { out, files: Object.keys(files), changed: differs.length > 0 };
}
