import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { checkRepo, checkText, duplicateOf, initRepo, lefthookTemplate, loadStations, localRuns, packageRoot, packageVersion, parseRemotes } from './core.js';

const PKG = packageRoot();
const STATIONS = loadStations(PKG);
const REF = `hookset@${packageVersion(PKG)}`;

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A repo with the given files, written relative to its root. */
function repo(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'hookset-'));
  dirs.push(dir);
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(dir, rel, '..'), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
  return dir;
}

const MANIFEST = JSON.stringify({ scripts: { prepare: 'lefthook install || true', 'hook:staged': 'prettier --check', 'hook:verify': 'turbo run typecheck test build' } });
const ids = (dir: string): string[] => checkRepo(dir, PKG).problems.map((p) => `${p.severity}:${p.id}`);

describe('the presets', () => {
  it('ship one file per hook, each defining the commands the station list names', () => {
    for (const [hook, preset] of Object.entries(STATIONS.presets)) {
      const yaml = readFileSync(join(PKG, preset.replace('packages/hookset/', '')), 'utf8');
      expect(yaml.startsWith('#')).toBe(true);
      expect(yaml).toContain(`\n${hook}:\n`);
      for (const s of STATIONS.stations.filter((x) => x.hook === hook)) expect(yaml).toContain(`    ${s.command}:\n`);
    }
  });

  it('wire every station that is not enforced with --if-present, so an undeclared one passes', () => {
    const yaml = readFileSync(join(PKG, 'presets/lefthook/pre-push.yml'), 'utf8');
    for (const s of STATIONS.stations.filter((x) => x.mode !== 'enforce' && x.script)) expect(yaml).toContain(`--if-present ${String(s.script)}`);
    expect(yaml).toContain('npm run --silent hook:verify\n');
  });
});

describe('parseRemotes', () => {
  it('reads the block hookset writes', () => {
    expect(parseRemotes(lefthookTemplate(STATIONS, REF))).toEqual([{ gitUrl: STATIONS.remote, ref: REF, configs: Object.values(STATIONS.presets) }]);
  });

  it('reads several remotes, quotes, comments, inline lists and configs at the key indent', () => {
    const yaml = [
      'pre-commit:',
      '  commands: {}',
      'remotes:',
      '  - git_url: "https://github.com/a/b.git" # theirs',
      "    ref: 'v1'",
      '    configs: [x.yml, "y.yml"]',
      '',
      '  - ref: hookset@9',
      '    git_url: https://github.com/ofri-peretz/burgee',
      '    configs:',
      '    - one.yml',
      'pre-push:',
      '  commands: {}',
    ].join('\n');
    expect(parseRemotes(yaml)).toEqual([
      { gitUrl: 'https://github.com/a/b.git', ref: 'v1', configs: ['x.yml', 'y.yml'] },
      { gitUrl: 'https://github.com/ofri-peretz/burgee', ref: 'hookset@9', configs: ['one.yml'] },
    ]);
  });

  it('is empty without a remotes block', () => {
    expect(parseRemotes('pre-push:\n  commands: {}\n')).toEqual([]);
  });
});

describe('localRuns and duplicateOf', () => {
  const yaml = `remotes:
  - git_url: x
    configs:
      - a.yml
commit-msg:
  commands:
    commitlint:
      run: sh scripts/x.sh npx --no -- commitlint --edit {1}
pre-push:
  commands:
    verify:
      run: |
        echo scope
        npm run hook:verify
    docs:
      run: "npm run docs:check"
`;

  it('collects each run outside remotes with its hook and command, block scalars joined', () => {
    expect(localRuns(yaml)).toEqual([
      { hook: 'commit-msg', command: 'commitlint', run: 'sh scripts/x.sh npx --no -- commitlint --edit {1}' },
      { hook: 'pre-push', command: 'verify', run: 'echo scope\nnpm run hook:verify' },
      { hook: 'pre-push', command: 'docs', run: 'npm run docs:check' },
    ]);
  });

  it('names the station a hand-written step repeats, and nothing for a repo-specific one', () => {
    expect(localRuns(yaml).map((r) => duplicateOf(r, STATIONS.stations)?.id)).toEqual(['commitlint', 'verify', undefined]);
    expect(duplicateOf({ hook: 'pre-push', command: 'x', run: 'npx commitlint --edit' }, STATIONS.stations)).toBeUndefined();
    expect(duplicateOf({ hook: 'pre-push', command: 'x', run: 'npm run hook:verify-docs' }, STATIONS.stations)).toBeUndefined();
  });
});

describe('checkRepo', () => {
  it('passes a repo hookset initialised, listing the stations not declared yet as warnings', () => {
    const dir = repo({ 'package.json': MANIFEST });
    expect(initRepo(dir, PKG)).toEqual({ changed: true, written: ['lefthook.yml'] });
    const result = checkRepo(dir, PKG);
    expect(result.ok).toBe(true);
    expect(result.pinned).toBe(REF);
    expect(result.problems.every((p) => p.severity === 'warning' && p.id === 'station-off')).toBe(true);
    expect(checkText(result)).toContain(`hookset: ok (${REF})`);
  });

  it('fails a repo with no lefthook.yml and no package.json', () => {
    expect(ids(repo({}))).toEqual(['error:no-lefthook', 'error:no-package']);
  });

  it('fails a hand-written lefthook.yml with no remote, and each step that repeats a preset', () => {
    const dir = repo({ 'package.json': MANIFEST, 'lefthook.yml': 'commit-msg:\n  commands:\n    lint:\n      run: npx --no -- commitlint --edit {1}\n' });
    const result = checkRepo(dir, PKG);
    expect(result.ok).toBe(false);
    expect(ids(dir).filter((i) => i.startsWith('error'))).toEqual(['error:duplicate', 'error:no-remote']);
    expect(checkText(result)).toMatch(/^hookset: 2 problem\(s\)\n✗ commit-msg → lint repeats the commitlint station/);
  });

  it('fails an unpinned remote, a missing preset, and warns on an older pin', () => {
    const unpinned = repo({ 'package.json': MANIFEST, 'lefthook.yml': lefthookTemplate(STATIONS, 'main').replace(/\n {6}- packages\/hookset\/presets\/lefthook\/pre-push.yml/, '') });
    expect(ids(unpinned)).toContain('error:unpinned');
    expect(ids(unpinned)).toContain('error:missing-preset');
    const old = repo({ 'package.json': MANIFEST, 'lefthook.yml': lefthookTemplate(STATIONS, 'hookset@0.0.1') });
    expect(checkRepo(old, PKG).ok).toBe(true);
    expect(ids(old)).toContain('warning:behind');
  });

  it('fails when nothing installs the hooks or an enforced station has no script', () => {
    const dir = repo({ 'package.json': '{}', 'lefthook.yml': lefthookTemplate(STATIONS, REF) });
    expect(ids(dir)).toEqual(expect.arrayContaining(['error:not-installed', 'error:missing-script']));
  });

  it('warns on a .claude/ directory without the pack, and checks the pack once it is adopted', () => {
    const dir = repo({ 'package.json': MANIFEST, 'lefthook.yml': lefthookTemplate(STATIONS, REF), '.claude/settings.json': '{}' });
    expect(ids(dir)).toContain('warning:claude-not-adopted');
    writeFileSync(join(dir, '.claude/hookset.json'), '{}');
    expect(ids(dir)).toEqual(expect.arrayContaining(['error:claude-missing', 'error:claude-unwired']));
    initRepo(dir, PKG, { claude: true });
    expect(checkRepo(dir, PKG).ok).toBe(true);
    writeFileSync(join(dir, '.claude/hooks/guard-bash.mjs'), '// edited by hand\n');
    expect(ids(dir)).toContain('error:claude-drift');
  });
});

describe('initRepo', () => {
  it('is idempotent and moves an existing pin to this version', () => {
    const dir = repo({ 'lefthook.yml': lefthookTemplate(STATIONS, 'hookset@0.0.1') });
    expect(initRepo(dir, PKG).written).toEqual(['lefthook.yml']);
    expect(parseRemotes(readFileSync(join(dir, 'lefthook.yml'), 'utf8'))[0]?.ref).toBe(REF);
    expect(initRepo(dir, PKG)).toEqual({ changed: false, written: [] });
  });

  it('refuses a hand-written lefthook.yml without --force, and keeps its steps under the remotes with it', () => {
    const hand = 'pre-push:\n  commands:\n    docs:\n      run: npm run docs\n';
    const dir = repo({ 'lefthook.yml': hand });
    expect(initRepo(dir, PKG).refused).toMatch(/--force/);
    expect(initRepo(dir, PKG, { force: true }).written).toEqual(['lefthook.yml']);
    const yaml = readFileSync(join(dir, 'lefthook.yml'), 'utf8');
    expect(yaml.startsWith('remotes:\n')).toBe(true);
    expect(yaml.endsWith(hand)).toBe(true);
  });

  it('refuses to edit a remotes block someone else wrote', () => {
    const dir = repo({ 'lefthook.yml': 'remotes:\n  - git_url: https://github.com/a/b\n' });
    expect(initRepo(dir, PKG, { force: true }).refused).toMatch(/by hand/);
  });

  it('merges the Claude pack into existing settings without duplicating a hook', () => {
    const settings = { permissions: { allow: ['Bash(ls)'] }, hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/guard-bash.mjs"' }] }] } };
    const dir = repo({ 'lefthook.yml': lefthookTemplate(STATIONS, REF), '.claude/settings.json': JSON.stringify(settings) });
    initRepo(dir, PKG, { claude: true });
    const merged = JSON.parse(readFileSync(join(dir, '.claude/settings.json'), 'utf8')) as typeof settings & { hooks: Record<string, { matcher: string; hooks: unknown[] }[]> };
    expect(merged.permissions).toEqual(settings.permissions);
    expect(merged.hooks['PreToolUse']?.map((g) => [g.matcher, g.hooks.length])).toEqual([
      ['Bash', 1],
      ['Edit|Write|MultiEdit|NotebookEdit', 1],
    ]);
    expect(Object.keys(merged.hooks)).toEqual(['PreToolUse', 'PostToolUse', 'PostToolUseFailure']);
    expect(initRepo(dir, PKG, { claude: true })).toEqual({ changed: false, written: [] });
  });
});
