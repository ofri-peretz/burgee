import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ExitCode } from 'burgee';
import { runBurgee } from 'burgee/testing';
import { beforeAll, describe, expect, it } from 'vitest';

import { program } from './cli.js';

describe('hookset', () => {
  // burgee's first run loads its renderers lazily; paying that here keeps each case under 5 s.
  beforeAll(async () => {
    await runBurgee(program, { argv: ['--version'] });
  });

  it('init writes a lefthook.yml, check then passes it, and --json carries the data', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hookset-cli-'));
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts: { prepare: 'lefthook install', 'hook:staged': 'x', 'hook:verify': 'y' } }));
      const init = await runBurgee(program, { argv: ['init', '--cwd', dir, '--json'] });
      expect(init.code).toBe(ExitCode.OK);
      expect(JSON.stringify(init.json)).toContain('lefthook.yml');
      const again = await runBurgee(program, { argv: ['init', '--cwd', dir] });
      expect(again.stdout).toContain('already up to date');
      const check = await runBurgee(program, { argv: ['check', '--cwd', dir] });
      expect(check.code).toBe(ExitCode.OK);
      expect(check.stdout).toContain('hookset: ok (hookset@');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('check exits 1 with a fix line per problem, and init refuses a hand-written file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hookset-cli-'));
    try {
      writeFileSync(join(dir, 'lefthook.yml'), 'pre-push:\n  commands: {}\n');
      const check = await runBurgee(program, { argv: ['check', '--cwd', dir, '--json'] });
      expect(check.code).toBe(ExitCode.RUNTIME);
      expect(JSON.stringify(check.json)).toContain('no-remote');
      const init = await runBurgee(program, { argv: ['init', '--cwd', dir] });
      expect(init.code).toBe(ExitCode.RUNTIME);
      expect(`${init.stdout}${init.stderr}`).toMatch(/--force/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
