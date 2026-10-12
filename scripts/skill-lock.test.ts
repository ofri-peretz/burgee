/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The skill lock — agent-skill R5. The reference demo commits the `SKILL.md` and `AGENTS.md`
 * that `burgee skill` writes in its build, and this regenerates both in memory from the demo's
 * declaration and compares them with the committed files, the pattern the completions locks use.
 *
 * Projected, never authored: a committed copy that drifts from the projection, by a hand edit or
 * by a declaration that changed without a rebuild, fails here. Proven red by editing one
 * character of the committed `SKILL.md` (the last case holds that the comparison sees it).
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line import-next/no-relative-packages -- by path: the demo is a private workspace, and its declaration is what the committed files are projected from
import { program } from '../examples/demo-cli-burgee/src/index.js';
// eslint-disable-next-line import-next/no-relative-packages -- by path, never by name: `skill.ts` is not an export, and a bare `burgee/*` resolves from another checkout's dist/ in an uninstalled worktree
import { renderAgents, renderSkill } from '../packages/burgee/src/skill.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const demo = join(root, 'examples/demo-cli-burgee');

/** The projection, file by file, beside what is committed. */
const files = (): { file: string; committed: string; projected: string }[] => [
  { file: 'SKILL.md', committed: readFileSync(join(demo, 'SKILL.md'), 'utf8'), projected: renderSkill(program) },
  { file: 'AGENTS.md', committed: readFileSync(join(demo, 'AGENTS.md'), 'utf8'), projected: renderAgents(program) },
];

/** The files that differ from the projection, by name. */
const drifted = (pairs: { file: string; committed: string; projected: string }[]): string[] => pairs.filter((p) => p.committed !== p.projected).map((p) => p.file);

describe("the demo's committed skill is its projection (agent-skill R5)", () => {
  it('SKILL.md and AGENTS.md equal what `burgee skill` writes from the declaration', () => {
    expect(drifted(files()), 'run `npm run build -w demo-cli-burgee` and commit SKILL.md and AGENTS.md').toEqual([]);
  });

  it('the demo build writes them, so the committed copies are the build output', () => {
    const pkg = JSON.parse(readFileSync(join(demo, 'package.json'), 'utf8')) as { scripts: { build: string } };
    expect(pkg.scripts.build).toContain('skill dist/index.js --out .');
  });

  it('one character changed in a committed file is drift', () => {
    const [skill, agents] = files() as [{ file: string; committed: string; projected: string }, { file: string; committed: string; projected: string }];
    const edited = { ...skill, committed: skill.committed.replace('Greet someone', 'Greet someonE') };
    expect(edited.committed).not.toBe(skill.committed);
    expect(drifted([edited, agents])).toEqual(['SKILL.md']);
  });
});
