import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { runBurgee } from 'burgee/testing';
import { describe, expect, it, vi } from 'vitest';

import { scratchDirs } from './__fixtures__/run/scratch-dir.js';
import { type Report } from './run-commit.js';
import { migrateText, reportText, scaffoldText, TEXT, withText } from './run-text.js';

import { program } from './index.js';

const scratch = scratchDirs();

const report = (over: Partial<Report>): Report => ({
  files: [
    { path: 'src/api/types.ts', owner: 'generated', action: 'write', target: 'types' },
    { path: 'src/api/old.ts', owner: 'generated', action: 'delete', target: 'types' },
    { path: 'contractdiff.map.json', owner: 'generated', action: 'unchanged' },
  ],
  changed: true,
  changes: 2,
  unchanged: 1,
  skipped: 0,
  findings: [],
  ...over,
});

const finding = { code: 'keyword-dropped', pointer: '/a', message: 'dropped', fix: 'check it in code', target: 'types' };

describe('reportText', () => {
  it('lists each file a run wrote or deleted, then each finding with its fix', () => {
    expect(reportText(report({ findings: [finding, { ...finding, pointer: '', target: undefined as unknown as string }] }))).toBe(
      ['write src/api/types.ts', 'delete src/api/old.ts', '', 'findings: 2', '  types  keyword-dropped  /a: dropped', '    fix: check it in code', '  keyword-dropped: dropped', '    fix: check it in code'].join('\n'),
    );
  });

  it('says when nothing was written', () => {
    expect(reportText(report({ files: [{ path: 'contractdiff.map.json', owner: 'generated', action: 'unchanged' }] }))).toBe('nothing to write: 1 file(s) up to date');
  });

  it('says what --dry-run would do, and prints its diff', () => {
    expect(reportText(report({ diff: '--- a\n+++ b\n' }))).toBe('would write src/api/types.ts\nwould delete src/api/old.ts\n\n--- a\n+++ b');
    expect(reportText(report({ diff: '', files: [] }))).toBe('nothing to write: 1 file(s) up to date');
  });

  it('lists the stale files under --check, with the fix, or says all is up to date', () => {
    expect(reportText(report({ stale: ['src/api/types.ts'], exitCode: 1, fix: 'run `contractdiff gen` and commit the result' }))).toBe(
      'stale: 1 file(s)\n  src/api/types.ts\nfix: run `contractdiff gen` and commit the result',
    );
    expect(reportText(report({ stale: [], findings: [finding] }))).toBe('up to date: 1 file(s)\n\nfindings: 1\n  types  keyword-dropped  /a: dropped\n    fix: check it in code');
  });
});

describe('migrateText', () => {
  const base = { changed: true, read: ['redocly.yaml', 'package.json'], written: ['contractdiff.config.json'], unchanged: [], kept: [], edited: ['package.json'], findings: [], uninstall: 'npm uninstall openapi-typescript', dryRun: false };

  it('says what it read, wrote and edited, and how to remove the incumbent', () => {
    expect(migrateText(base)).toBe('read: redocly.yaml, package.json\nwrite contractdiff.config.json\nedit package.json\n\nthen remove it: npm uninstall openapi-typescript');
  });

  it('says what a dry run would do, a file it kept or left, and a project with nothing to read', () => {
    expect(migrateText({ ...base, read: [], dryRun: true, kept: ['a'], unchanged: ['b'], findings: [finding] })).toBe(
      [
        'read: nothing (no config file and no package.json)',
        'would write contractdiff.config.json',
        'would edit package.json',
        'kept a: it is already there, and yours',
        'unchanged b',
        '',
        'findings: 1',
        '  types  keyword-dropped  /a: dropped',
        '    fix: check it in code',
        '',
        'then remove it: npm uninstall openapi-typescript',
      ].join('\n'),
    );
  });
});

describe('scaffoldText and withText', () => {
  it('lists the files and the command to run next', () => {
    expect(scaffoldText({ written: ['a.ts'], unchanged: ['b.ts'], kept: ['c.ts'] }, 'node --test a.test.ts')).toBe('write a.ts\nunchanged b.ts\nkept c.ts: it is already there, and yours\n\nnext: node --test a.test.ts');
  });

  it('keeps the data as it is, with the text beside it', () => {
    const data = withText({ a: 1 }, () => 'one');
    expect(Object.keys(data)).toEqual(['a']);
    expect(data.a).toBe(1);
    expect((data[TEXT] as () => string)()).toBe('one');
  });
});

describe('without --json, the writing commands print text, not their fields', () => {
  it('gen, migrate and plugin new', async () => {
    const directory = scratch('contractdiff-text-');
    mkdirSync(join(directory, 'p'));
    writeFileSync(join(directory, 'package.json'), '{\n  "scripts": {\n    "gen": "openapi-typescript openapi.yaml -o src/api/types.ts"\n  }\n}\n');
    writeFileSync(join(directory, 'openapi.yaml'), "openapi: 3.1.0\ninfo: { title: t, version: '1' }\npaths: {}\n");
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(directory);
    try {
      const migrated = await runBurgee(program, { argv: ['migrate', 'openapi-typescript'] });
      expect(migrated.stdout).toBe('read: package.json\nwrite contractdiff.config.json\nedit package.json\n\nthen remove it: npm uninstall openapi-typescript\n');
      const generated = await runBurgee(program, { argv: ['gen'] });
      expect(generated.stdout).toBe('write src/api/types.ts\nwrite contractdiff.map.json\n');
      const scaffolded = await runBurgee(program, { argv: ['plugin', 'new', 'my-target', '--out', 'p'] });
      expect(scaffolded.stdout).toBe('write plugin-my-target.ts\nwrite plugin-my-target.test.ts\nwrite README.md\n\nnext: node --test plugin-my-target.test.ts\n');
    } finally {
      cwd.mockRestore();
    }
  });
});
