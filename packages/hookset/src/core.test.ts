import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/scratch-dir.js';
import {
  checkRepo,
  checkText,
  duplicateOf,
  expectedClaudeHooks,
  initRepo,
  lefthookTemplate,
  loadStations,
  localRuns,
  packageRoot,
  packageVersion,
  parseRemotes,
  type Problem,
} from './core.js';

const PKG = packageRoot();
const STATIONS = loadStations(PKG);
const VERSION = packageVersion(PKG);
const REF = `hookset@${VERSION}`;
const REMOTE = 'https://github.com/ofri-peretz/burgee';
const PRESETS = ['packages/hookset/presets/lefthook/commit-msg.yml', 'packages/hookset/presets/lefthook/pre-commit.yml', 'packages/hookset/presets/lefthook/pre-push.yml'];
const scratch = scratchDirs();

/** The head line `checkText` prints for a failing result with these problems. */
const head = (problems: Problem[]): string => String(checkText({ ok: false, pinned: undefined, expected: REF, problems }).split('\n')[0]);

/** The hookset remote as a lefthook.yml list item, pinned to `pin`. */
const ours = (pin: string): string => `  - git_url: ${REMOTE}.git\n    ref: ${pin}\n    configs:\n      - x.yml\n`;

/** A repo with the given files, written relative to its root. */
function repo(files: Record<string, string>): string {
  const dir = scratch('hookset-');
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(dir, rel, '..'), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
  return dir;
}

const read = (dir: string, rel: string): string => readFileSync(join(dir, rel), 'utf8');
const MANIFEST = JSON.stringify({ scripts: { prepare: 'lefthook install || true', 'hook:provedone': 'provedone gate', 'hook:staged': 'prettier --check', 'hook:verify': 'turbo run typecheck test build' } });
const ALL_SCRIPTS = JSON.stringify({
  scripts: Object.fromEntries([['prepare', 'lefthook install'], ...STATIONS.stations.filter((s) => s.script).map((s) => [String(s.script), 'x'])]),
});

const at = (hook: string, run: string): string | undefined => duplicateOf({ hook, command: 'x', run }, STATIONS.stations)?.id;
const unwired = (file: string, event: string, matcher: string): Problem => ({ id: 'claude-unwired', severity: 'error', message: `.claude/settings.json does not run ${file} on ${event} (${matcher})`, fix: 'run `hookset init --claude`' });
const cmd = (file: string): { type: string; command: string } => ({ type: 'command', command: `node .claude/hooks/${file}` });
const command = (file: string): { type: string; command: string }[] => [{ type: 'command', command: `node "$CLAUDE_PROJECT_DIR/.claude/hooks/${file}"` }];

/** A verify skill a repo has filled in: the template's required lines, no placeholder left. */
const FILLED_SKILL = '---\nname: verify\ndescription: run the CLI\n---\n\n## Feature map\n\n| Feature | Reach it by | Working means |\n| --- | --- | --- |\n| help | `x --help` | exit 0 |\n';
/** What check says about a repo that has not wired the codegraph MCP server. */
const CODEGRAPH_UNWIRED: Problem[] = [
  { id: 'codegraph-mcp-missing', severity: 'error', message: '.mcp.json does not run the codegraph server: CodeGraph, a prebuilt symbol graph Claude queries instead of grepping; codegraph.mjs builds its index on SessionStart', fix: 'run `hookset init --claude`' },
  { id: 'codegraph-not-ignored', severity: 'error', message: '.gitignore does not list .codegraph/, the codegraph index', fix: 'add `.codegraph/` to .gitignore (`hookset init --claude` does)' },
  { id: 'codegraph-mcp-disabled', severity: 'error', message: '.claude/settings.json does not enable the codegraph server, so every session asks first', fix: 'add "codegraph" to enabledMcpjsonServers (`hookset init --claude` does)' },
];
const fillSkill = (dir: string): void => writeFileSync(join(dir, '.claude/skills/verify/SKILL.md'), FILLED_SKILL);

const STATION_OFF: Problem[] = [
  { id: 'station-off', severity: 'warning', message: 'the mutation station is not declared yet (optional)', fix: 'add "hook:mutation" to package.json scripts when the repo has it: changed-lines mutation testing' },
  { id: 'station-off', severity: 'warning', message: 'the test-integrity station is not declared yet (observe)', fix: 'add "hook:test-integrity" to package.json scripts when the repo has it: no .only, .skip or weakened assertion in the diff' },
  { id: 'station-off', severity: 'warning', message: 'the proofline station is not declared yet (observe)', fix: 'add "hook:proofline" to package.json scripts when the repo has it: the change carries its Checked line' },
  { id: 'station-off', severity: 'warning', message: 'the triggerlist station is not declared yet (observe)', fix: 'add "hook:triggerlist" to package.json scripts when the repo has it: protected paths changed only with their trigger' },
];

describe('the package', () => {
  it('finds its root from any file in src/ or dist/, and reads its version and stations from there', () => {
    expect(packageRoot(pathToFileURL(join(PKG, 'dist', 'cli.js')).href)).toBe(PKG);
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(STATIONS.remote).toBe(REMOTE);
    expect(STATIONS.tagPrefix).toBe('hookset@');
    expect(Object.values(STATIONS.presets)).toEqual(PRESETS);
  });

  it('ships one preset file per hook, each defining the commands the station list names', () => {
    for (const [hook, preset] of Object.entries(STATIONS.presets)) {
      const yaml = readFileSync(join(PKG, preset.replace('packages/hookset/', '')), 'utf8');
      expect(yaml.startsWith('#')).toBe(true);
      expect(yaml).toContain(`\n${hook}:\n`);
      for (const s of STATIONS.stations.filter((x) => x.hook === hook)) expect(yaml).toContain(`    ${s.command}:\n`);
    }
  });

  it('wires every station that is not enforced with --if-present, so an undeclared one passes', () => {
    const yaml = readFileSync(join(PKG, 'presets/lefthook/pre-push.yml'), 'utf8');
    for (const s of STATIONS.stations.filter((x) => x.mode !== 'enforce' && x.script)) expect(yaml).toContain(`--if-present ${String(s.script)}\n`);
    expect(yaml).toContain('npm run --silent hook:verify\n');
  });

  it('puts stop-after-3 on PostToolUseFailure too, since a failed Bash call lands there', () => {
    expect(expectedClaudeHooks(STATIONS)).toEqual([
      { event: 'PreToolUse', matcher: 'Bash', file: 'guard-bash.mjs' },
      { event: 'PreToolUse', matcher: 'Edit|Write|MultiEdit|NotebookEdit', file: 'guard-bash.mjs' },
      { event: 'PostToolUse', matcher: 'Bash', file: 'stop-after-3.mjs' },
      { event: 'PostToolUseFailure', matcher: 'Bash', file: 'stop-after-3.mjs' },
      { event: 'PostToolUse', matcher: 'Bash', file: 'verify-before-stop.mjs' },
      { event: 'PostToolUseFailure', matcher: 'Bash', file: 'verify-before-stop.mjs' },
      { event: 'Stop', matcher: '', file: 'verify-before-stop.mjs' },
      { event: 'SessionStart', matcher: '', file: 'codegraph.mjs' },
      { event: 'SessionStart', matcher: '', file: 'worktree-sweep.mjs' },
    ]);
  });
});

describe('lefthookTemplate', () => {
  it('is the remotes block between two comments, every preset listed', () => {
    expect(lefthookTemplate(STATIONS, 'hookset@1.2.3')).toBe(`# Git hooks. The stations come from the hookset presets (burgee packages/hookset), pinned by tag:
# bump \`ref\` to take a new preset version. \`hookset check\` (CI) fails on a missing station, an
# unpinned ref, or a step here that repeats one a preset runs.
remotes:
  - git_url: ${REMOTE}
    ref: hookset@1.2.3
    configs:
${PRESETS.map((p) => `      - ${p}`).join('\n')}

# Repo-specific steps go below, under the hook they belong to. The presets call the repo's own
# \`hook:staged\` and \`hook:verify\` scripts (package.json), so most repos need nothing here.
`);
  });
});

describe('parseRemotes', () => {
  it('reads the block hookset writes', () => {
    expect(parseRemotes(lefthookTemplate(STATIONS, REF))).toEqual([{ gitUrl: REMOTE, ref: REF, configs: PRESETS }]);
  });

  it('reads several remotes, quotes, comments, inline lists, CRLF and configs at the key indent', () => {
    const yaml = [
      'pre-commit:',
      '  commands: {}',
      'remotes:',
      '# a comment at the margin stays in the block',
      '  - git_url: "https://github.com/a/b.git" # theirs',
      "    ref: 'v1'",
      '    configs: [x.yml, "y.yml", ]',
      '',
      '    # an indented comment',
      '  - ref: hookset@9',
      '    refetch: true',
      '    git_url: https://github.com/ofri-peretz/burgee',
      '    configs:',
      '    - one.yml',
      "    - 'two.yml'",
      '- git_url: margin',
      'pre-push:',
      '  - ref: not-a-remote',
    ].join('\r\n');
    expect(parseRemotes(yaml)).toEqual([
      { gitUrl: 'https://github.com/a/b.git', ref: 'v1', configs: ['x.yml', 'y.yml'] },
      { gitUrl: 'https://github.com/ofri-peretz/burgee', ref: 'hookset@9', configs: ['one.yml', 'two.yml'] },
      { gitUrl: 'margin', ref: undefined, configs: [] },
    ]);
  });

  it('keeps a lone quote as written, and ignores fields before any remote starts', () => {
    expect(parseRemotes('remotes:\n  ref: orphan\n  - git_url: "\n    ref: x\n')).toEqual([{ gitUrl: '"', ref: 'x', configs: [] }]);
  });

  it('takes list items as configs only under configs:', () => {
    expect(parseRemotes('remotes:\n  - git_url: u\n    ref: r\n    - stray.yml\n    configs:\n      - a.yml\n    ref: r2\n      - late.yml\n')).toEqual([{ gitUrl: 'u', ref: 'r2', configs: ['a.yml'] }]);
  });

  it('is empty without a remotes block, and when the word only starts another key', () => {
    expect(parseRemotes('pre-push:\n  commands: {}\n')).toEqual([]);
    expect(parseRemotes('remotes_extra:\n  - git_url: x\n')).toEqual([]);
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
  parallel: true
  commands:
    verify:
      run: |
        echo scope

        npm run hook:verify
    folded:
      run: >-
        npm run a
      fail_text: x
    docs:
      run: "npm run docs:check"
  scripts:
    "x.sh":
      runner: bash
  jobs:
    - name: one
      run: 'echo job'
`;

  it('collects each run outside remotes with its hook and command, block scalars joined', () => {
    expect(localRuns(yaml)).toEqual([
      { hook: 'commit-msg', command: 'commitlint', run: 'sh scripts/x.sh npx --no -- commitlint --edit {1}' },
      { hook: 'pre-push', command: 'verify', run: 'echo scope\n\nnpm run hook:verify' },
      { hook: 'pre-push', command: 'folded', run: 'npm run a' },
      { hook: 'pre-push', command: 'docs', run: 'npm run docs:check' },
      { hook: 'pre-push', command: 'docs', run: 'echo job' },
    ]);
  });

  it('reads a block scalar at the end of the file, and a plain run at the margin as no run', () => {
    expect(localRuns('pre-push:\n  commands:\n    a:\n      run: |\n        one\n        two')).toEqual([{ hook: 'pre-push', command: 'a', run: 'one\ntwo' }]);
    expect(localRuns('run: x\n')).toEqual([]);
  });

  it('names the station a hand-written step repeats, and nothing for a repo-specific one', () => {
    expect(localRuns(yaml).map((r) => duplicateOf(r, STATIONS.stations)?.id)).toEqual(['commitlint', 'verify', undefined, undefined, undefined]);
    expect(at('commit-msg', './node_modules/.bin/commitlint --edit "$1"')).toBe('commitlint');
    expect(at('commit-msg', 'commitlint --from HEAD~1')).toBeUndefined();
    expect(at('commit-msg', 'my-commitlint --edit')).toBeUndefined();
    expect(at('pre-push', 'npx commitlint --edit')).toBeUndefined();
    expect(at('pre-push', 'npm run hook:verify-docs')).toBeUndefined();
    expect(at('pre-commit', 'npm run hook:staged -- {staged_files}')).toBe('staged');
    expect(at('pre-push', 'npm run --if-present hook:triggerlist')).toBe('triggerlist');
  });
});

describe('checkRepo', () => {
  it('passes a repo hookset initialised, listing the stations not declared yet as warnings', () => {
    const dir = repo({ 'package.json': MANIFEST });
    expect(initRepo(dir, PKG)).toEqual({ changed: true, written: ['lefthook.yml'] });
    expect(checkRepo(dir, PKG)).toEqual({ ok: true, pinned: REF, expected: REF, problems: STATION_OFF });
  });

  it('has nothing to say about a repo with every station declared', () => {
    const dir = repo({ 'package.json': ALL_SCRIPTS, 'lefthook.yml': lefthookTemplate(STATIONS, REF) });
    expect(checkRepo(dir, PKG)).toEqual({ ok: true, pinned: REF, expected: REF, problems: [] });
  });

  it('fails a repo with no lefthook.yml and no package.json', () => {
    expect(checkRepo(repo({}), PKG)).toEqual({
      ok: false,
      pinned: undefined,
      expected: REF,
      problems: [
        { id: 'no-lefthook', severity: 'error', message: 'there is no lefthook.yml', fix: 'run `hookset init`' },
        { id: 'no-package', severity: 'error', message: 'there is no package.json to declare the station scripts in', fix: 'add a private package.json with lefthook as a devDependency' },
      ],
    });
  });

  it('fails a hand-written lefthook.yml with no remote, and each step that repeats a preset', () => {
    const dir = repo({ 'package.json': ALL_SCRIPTS, 'lefthook.yml': 'commit-msg:\n  commands:\n    lint:\n      run: npx --no -- commitlint --edit {1}\n' });
    const result = checkRepo(dir, PKG);
    expect(result).toEqual({
      ok: false,
      pinned: undefined,
      expected: REF,
      problems: [
        { id: 'duplicate', severity: 'error', message: 'commit-msg → lint repeats the commitlint station the preset already runs', fix: 'delete commit-msg.commands.lint from lefthook.yml' },
        { id: 'no-remote', severity: 'error', message: `lefthook.yml does not pull the presets from ${REMOTE}`, fix: 'run `hookset init --force`' },
      ],
    });
    expect(checkText(result)).toBe(
      [
        'hookset: 2 errors',
        '✗ commit-msg → lint repeats the commitlint station the preset already runs',
        '  fix: delete commit-msg.commands.lint from lefthook.yml',
        `✗ lefthook.yml does not pull the presets from ${REMOTE}`,
        '  fix: run `hookset init --force`',
      ].join('\n'),
    );
  });

  it('matches the remote with or without .git and a trailing slash', () => {
    for (const url of [`${REMOTE}.git`, `${REMOTE}/`]) {
      const dir = repo({ 'package.json': ALL_SCRIPTS, 'lefthook.yml': lefthookTemplate(STATIONS, REF).replace(REMOTE, url) });
      expect(checkRepo(dir, PKG).problems).toEqual([]);
    }
  });

  it('fails an unpinned remote and a missing preset', () => {
    const yaml = lefthookTemplate(STATIONS, 'main').replace(`\n      - ${String(PRESETS[2])}`, '');
    expect(checkRepo(repo({ 'package.json': ALL_SCRIPTS, 'lefthook.yml': yaml }), PKG)).toEqual({
      ok: false,
      pinned: undefined,
      expected: REF,
      problems: [
        { id: 'missing-preset', severity: 'error', message: `the pre-push preset is not pulled (${String(PRESETS[2])})`, fix: `add \`- ${String(PRESETS[2])}\` under the remote's configs` },
        { id: 'unpinned', severity: 'error', message: 'the presets remote is pinned to main, not a hookset@<version> tag', fix: `set \`ref: ${REF}\`` },
      ],
    });
    const noRef = lefthookTemplate(STATIONS, REF).replace(`    ref: ${REF}\n`, '');
    expect(checkRepo(repo({ 'package.json': ALL_SCRIPTS, 'lefthook.yml': noRef }), PKG).problems).toEqual([
      { id: 'unpinned', severity: 'error', message: 'the presets remote is pinned to the default branch, not a hookset@<version> tag', fix: `set \`ref: ${REF}\`` },
    ]);
  });

  it('warns on an older pin and still passes', () => {
    const result = checkRepo(repo({ 'package.json': ALL_SCRIPTS, 'lefthook.yml': lefthookTemplate(STATIONS, 'hookset@0.0.1') }), PKG);
    expect(result).toEqual({
      ok: true,
      pinned: 'hookset@0.0.1',
      expected: REF,
      problems: [{ id: 'behind', severity: 'warning', message: `the presets are pinned to hookset@0.0.1; this hookset is ${REF}`, fix: `set \`ref: ${REF}\` (\`hookset init\` does it)` }],
    });
    expect(checkText(result)).toBe(`hookset: ok (hookset@0.0.1)\n! the presets are pinned to hookset@0.0.1; this hookset is ${REF}\n  fix: set \`ref: ${REF}\` (\`hookset init\` does it)`);
    expect(checkText({ ok: true, pinned: undefined, expected: REF, problems: [] })).toBe('hookset: ok (unpinned)');
  });

  it('fails when nothing installs the hooks or an enforced station has no script', () => {
    const dir = repo({ 'package.json': JSON.stringify({ scripts: { prepare: 'husky' } }), 'lefthook.yml': lefthookTemplate(STATIONS, REF) });
    expect(checkRepo(dir, PKG).problems.filter((p) => p.severity === 'error')).toEqual([
      { id: 'not-installed', severity: 'error', message: 'nothing installs the hooks: package.json has no `prepare` running `lefthook install`', fix: 'add `"prepare": "lefthook install || true"`' },
      { id: 'missing-script', severity: 'error', message: 'the provedone station runs `npm run hook:provedone`, and package.json does not declare it', fix: 'add "hook:provedone" to package.json scripts: the commit carries a Verified-by receipt, or none with a reason' },
      { id: 'missing-script', severity: 'error', message: 'the staged station runs `npm run hook:staged`, and package.json does not declare it', fix: 'add "hook:staged" to package.json scripts: lint and format the staged files only, under 10 s' },
      { id: 'missing-script', severity: 'error', message: 'the verify station runs `npm run hook:verify`, and package.json does not declare it', fix: 'add "hook:verify" to package.json scripts: typecheck, the affected tests and the build' },
    ]);
    expect(checkRepo(repo({ 'package.json': '{}', 'lefthook.yml': lefthookTemplate(STATIONS, REF) }), PKG).problems[0]?.id).toBe('not-installed');
  });

  it('warns on a .claude/ directory without the pack, and checks the pack once it is adopted', () => {
    const dir = repo({ 'package.json': ALL_SCRIPTS, 'lefthook.yml': lefthookTemplate(STATIONS, REF), '.claude/notes.md': '' });
    expect(checkRepo(dir, PKG).problems).toEqual([{ id: 'claude-not-adopted', severity: 'warning', message: 'the repo has a .claude/ directory without the hookset Claude pack', fix: 'run `hookset init --claude`' }]);
    writeFileSync(join(dir, '.claude/hookset.json'), '{}');
    expect(checkRepo(dir, PKG)).toEqual({
      ok: false,
      pinned: REF,
      expected: REF,
      problems: [
        { id: 'claude-missing', severity: 'error', message: '.claude/hooks/guard-bash.mjs is missing', fix: 'run `hookset init --claude`' },
        { id: 'claude-missing', severity: 'error', message: '.claude/hooks/stop-after-3.mjs is missing', fix: 'run `hookset init --claude`' },
        { id: 'claude-missing', severity: 'error', message: '.claude/hooks/verify-before-stop.mjs is missing', fix: 'run `hookset init --claude`' },
        { id: 'claude-missing', severity: 'error', message: '.claude/hooks/codegraph.mjs is missing', fix: 'run `hookset init --claude`' },
        { id: 'claude-missing', severity: 'error', message: '.claude/hooks/worktree-sweep.mjs is missing', fix: 'run `hookset init --claude`' },
        unwired('guard-bash.mjs', 'PreToolUse', 'Bash'),
        unwired('guard-bash.mjs', 'PreToolUse', 'Edit|Write|MultiEdit|NotebookEdit'),
        unwired('stop-after-3.mjs', 'PostToolUse', 'Bash'),
        unwired('stop-after-3.mjs', 'PostToolUseFailure', 'Bash'),
        unwired('verify-before-stop.mjs', 'PostToolUse', 'Bash'),
        unwired('verify-before-stop.mjs', 'PostToolUseFailure', 'Bash'),
        unwired('verify-before-stop.mjs', 'Stop', ''),
        unwired('codegraph.mjs', 'SessionStart', ''),
        unwired('worktree-sweep.mjs', 'SessionStart', ''),
        {
          id: 'verify-skill-missing',
          severity: 'error',
          message: '.claude/skills/verify/SKILL.md is missing: the skill that boots the app, drives the change and checks what it shows, with a feature map',
          fix: 'run `hookset init --claude`, then fill in every TODO(verify) line',
        },
        ...CODEGRAPH_UNWIRED,
      ],
    });
    initRepo(dir, PKG, { claude: true });
    // The template is written, and is not done until the repo replaces its placeholders.
    expect(checkRepo(dir, PKG).problems).toEqual([
      { id: 'verify-skill-unfilled', severity: 'error', message: '.claude/skills/verify/SKILL.md still has 5 TODO(verify) lines', fix: "replace each TODO(verify) line with this repo's real steps" },
    ]);
    fillSkill(dir);
    expect(checkRepo(dir, PKG)).toEqual({ ok: true, pinned: REF, expected: REF, problems: [] });
    writeFileSync(join(dir, '.claude/hooks/guard-bash.mjs'), '// edited by hand\n');
    expect(checkRepo(dir, PKG).problems).toEqual([
      { id: 'claude-drift', severity: 'error', message: '.claude/hooks/guard-bash.mjs differs from the hookset copy', fix: 'run `hookset init --claude`; change the canonical copy in burgee, not the vendored one' },
    ]);
  });

  it('wants each pack hook under its own event and matcher, by its file name', () => {
    const dir = repo({ 'package.json': ALL_SCRIPTS, 'lefthook.yml': lefthookTemplate(STATIONS, REF), '.claude/hookset.json': '{}' });
    initRepo(dir, PKG, { claude: true });
    fillSkill(dir);
    writeFileSync(
      join(dir, '.claude/settings.json'),
      JSON.stringify({
        hooks: {
          PreToolUse: [{ matcher: 'Bash', hooks: [cmd('guard-bash.mjs')] }, { hooks: [cmd('guard-bash.mjs')] }],
          PostToolUse: [{ matcher: 'Bash', hooks: [cmd('guard-bash.mjs'), {}] }],
          PostToolUseFailure: [{ matcher: 'Bash' }],
        },
      }),
    );
    expect(checkRepo(dir, PKG).problems.map((p) => p.message)).toEqual([
      '.claude/settings.json does not run guard-bash.mjs on PreToolUse (Edit|Write|MultiEdit|NotebookEdit)',
      '.claude/settings.json does not run stop-after-3.mjs on PostToolUse (Bash)',
      '.claude/settings.json does not run stop-after-3.mjs on PostToolUseFailure (Bash)',
      '.claude/settings.json does not run verify-before-stop.mjs on PostToolUse (Bash)',
      '.claude/settings.json does not run verify-before-stop.mjs on PostToolUseFailure (Bash)',
      '.claude/settings.json does not run verify-before-stop.mjs on Stop ()',
      '.claude/settings.json does not run codegraph.mjs on SessionStart ()',
      '.claude/settings.json does not run worktree-sweep.mjs on SessionStart ()',
      '.claude/settings.json does not enable the codegraph server, so every session asks first',
    ]);
    writeFileSync(join(dir, '.claude/settings.json'), '{}');
    expect(checkRepo(dir, PKG).problems).toHaveLength(10);
  });

  it('wants the codegraph server pinned in .mcp.json, its index gitignored, and the server enabled', () => {
    const dir = repo({ 'package.json': ALL_SCRIPTS, 'lefthook.yml': lefthookTemplate(STATIONS, REF), '.claude/hookset.json': '{}', '.gitignore': 'node_modules' });
    initRepo(dir, PKG, { claude: true });
    fillSkill(dir);
    expect(read(dir, '.gitignore')).toBe('node_modules\n# MCP server indexes, rebuilt per session by .claude/hooks (hookset)\n.codegraph/\n');
    expect(JSON.parse(read(dir, '.mcp.json'))).toEqual({ mcpServers: { codegraph: STATIONS.claude.mcp[0]?.server } });
    expect(checkRepo(dir, PKG).problems).toEqual([]);
    const mcp = { mcpServers: { mine: { command: 'x' }, codegraph: { command: 'codegraph', args: ['serve', '--mcp'] } } };
    writeFileSync(join(dir, '.mcp.json'), JSON.stringify(mcp));
    expect(checkRepo(dir, PKG).problems.map((p) => p.id)).toEqual(['codegraph-mcp-drift']);
    // init puts the pin back and keeps the repo's own servers.
    initRepo(dir, PKG, { claude: true });
    expect(Object.keys((JSON.parse(read(dir, '.mcp.json')) as { mcpServers: object }).mcpServers)).toEqual(['mine', 'codegraph']);
    expect(read(dir, '.gitignore').match(/\.codegraph\//g)).toHaveLength(1);
    expect(checkRepo(dir, PKG).problems).toEqual([]);
  });

  it('wants the verify skill to keep its name and its feature map', () => {
    const dir = repo({ 'package.json': ALL_SCRIPTS, 'lefthook.yml': lefthookTemplate(STATIONS, REF), '.claude/hookset.json': '{}' });
    initRepo(dir, PKG, { claude: true });
    writeFileSync(join(dir, '.claude/skills/verify/SKILL.md'), '---\nname: smoke\n---\n\nRun it. TODO(verify)\n');
    expect(checkRepo(dir, PKG).problems).toEqual([
      { id: 'verify-skill-unfilled', severity: 'error', message: '.claude/skills/verify/SKILL.md still has 1 TODO(verify) line', fix: "replace each TODO(verify) line with this repo's real steps" },
      { id: 'verify-skill-incomplete', severity: 'error', message: '.claude/skills/verify/SKILL.md has no `name: verify`', fix: 'put `name: verify` back; the template shows where it goes' },
      { id: 'verify-skill-incomplete', severity: 'error', message: '.claude/skills/verify/SKILL.md has no `## Feature map`', fix: 'put `## Feature map` back; the template shows where it goes' },
    ]);
  });

  it('never overwrites a verify skill the repo wrote', () => {
    const dir = repo({ 'lefthook.yml': lefthookTemplate(STATIONS, REF), '.claude/skills/verify/SKILL.md': FILLED_SKILL });
    expect(initRepo(dir, PKG, { claude: true }).written).not.toContain('.claude/skills/verify/SKILL.md');
    expect(read(dir, '.claude/skills/verify/SKILL.md')).toBe(FILLED_SKILL);
  });
});

describe('initRepo', () => {
  it('is idempotent and moves an existing pin to this version, leaving the rest byte for byte', () => {
    const before = `${lefthookTemplate(STATIONS, 'hookset@0.0.1')}pre-push:\n  commands:\n    docs:\n      run: npm run docs\n      ref: not-the-remote\n`;
    const dir = repo({ 'lefthook.yml': before });
    expect(initRepo(dir, PKG)).toEqual({ changed: true, written: ['lefthook.yml'] });
    expect(read(dir, 'lefthook.yml')).toBe(before.replace('ref: hookset@0.0.1', `ref: ${REF}`));
    expect(initRepo(dir, PKG)).toEqual({ changed: false, written: [] });
  });

  it('moves only the hookset remote\'s pin when another remote is listed first', () => {
    const other = 'remotes:\n  - git_url: https://github.com/a/b\n    ref: v1.2.3 # theirs\n    configs:\n      - lefthook.yml\n';
    const dir = repo({ 'lefthook.yml': `${other}${ours('hookset@0.0.1')}pre-push:\n  commands: {}\n` });
    expect(initRepo(dir, PKG)).toEqual({ changed: true, written: ['lefthook.yml'] });
    expect(read(dir, 'lefthook.yml')).toBe(`${other}${ours(REF)}pre-push:\n  commands: {}\n`);
    expect(parseRemotes(read(dir, 'lefthook.yml')).map((r) => r.ref)).toEqual(['v1.2.3', REF]);
  });

  it('leaves another remote\'s pin alone when the hookset remote has none of its own', () => {
    const yaml = `remotes:\n  - git_url: https://github.com/a/b\n    ref: v1\n  - git_url: ${REMOTE}\n`;
    const dir = repo({ 'lefthook.yml': yaml });
    expect(initRepo(dir, PKG)).toEqual({ changed: false, written: [] });
    expect(read(dir, 'lefthook.yml')).toBe(yaml);
  });

  it('keeps CRLF line endings when it moves the pin', () => {
    const before = lefthookTemplate(STATIONS, 'hookset@0.0.1').replaceAll('\n', '\r\n');
    const dir = repo({ 'lefthook.yml': before });
    initRepo(dir, PKG);
    expect(read(dir, 'lefthook.yml')).toBe(before.replace('ref: hookset@0.0.1', `ref: ${REF}`));
  });

  it('moves the ref of the hookset remote where it is a list item, and leaves a remote with no ref', () => {
    const dir = repo({ 'lefthook.yml': `remotes:\n  - ref: old\n    git_url: ${REMOTE}\n` });
    initRepo(dir, PKG);
    expect(read(dir, 'lefthook.yml')).toBe(`remotes:\n  - ref: ${REF}\n    git_url: ${REMOTE}\n`);
    const bare = repo({ 'lefthook.yml': `remotes:\n  - git_url: ${REMOTE}\n` });
    expect(initRepo(bare, PKG)).toEqual({ changed: false, written: [] });
  });

  it('refuses a hand-written lefthook.yml without --force, and keeps its steps under the remotes with it', () => {
    const hand = 'pre-push:\n  commands:\n    docs:\n      run: npm run docs\n';
    const dir = repo({ 'lefthook.yml': hand });
    expect(initRepo(dir, PKG)).toEqual({ changed: false, written: [], refused: 'lefthook.yml was written by hand; pass --force to add the presets on top of it' });
    expect(initRepo(dir, PKG, { claude: true })).toEqual({ changed: false, written: [], refused: 'lefthook.yml was written by hand; pass --force to add the presets on top of it' });
    expect(initRepo(dir, PKG, { force: true })).toEqual({ changed: true, written: ['lefthook.yml'] });
    expect(read(dir, 'lefthook.yml')).toBe(`remotes:\n  - git_url: ${REMOTE}\n    ref: ${REF}\n    configs:\n${PRESETS.map((p) => `      - ${p}`).join('\n')}\n\n${hand}`);
  });

  it('refuses to edit a remotes block someone else wrote', () => {
    const dir = repo({ 'lefthook.yml': 'pre-push:\n  commands: {}\nremotes:\n  - git_url: https://github.com/a/b\n' });
    expect(initRepo(dir, PKG, { force: true })).toEqual({ changed: false, written: [], refused: 'lefthook.yml already has a remotes: block; add the hookset remote to it by hand' });
  });

  it('vendors the pack and writes settings and hookset.json into a repo with no .claude/', () => {
    const dir = repo({ 'lefthook.yml': lefthookTemplate(STATIONS, REF) });
    expect(initRepo(dir, PKG, { claude: true })).toEqual({
      changed: true,
      written: [
        '.claude/hooks/guard-bash.mjs',
        '.claude/hooks/stop-after-3.mjs',
        '.claude/hooks/verify-before-stop.mjs',
        '.claude/hooks/codegraph.mjs',
        '.claude/hooks/worktree-sweep.mjs',
        '.claude/hookset.json',
        '.claude/skills/verify/SKILL.md',
        '.claude/settings.json',
        '.mcp.json',
        '.gitignore',
      ],
    });
    expect(read(dir, '.claude/skills/verify/SKILL.md')).toBe(readFileSync(join(PKG, 'claude/skills/verify/SKILL.md'), 'utf8'));
    expect(read(dir, '.claude/hooks/stop-after-3.mjs')).toBe(readFileSync(join(PKG, 'claude/stop-after-3.mjs'), 'utf8'));
    expect(read(dir, '.claude/hookset.json')).toBe('{\n  "ask": [],\n  "frozen": []\n}\n');
    expect(read(dir, '.claude/settings.json')).toBe(
      `${JSON.stringify(
        {
          $schema: 'https://json.schemastore.org/claude-code-settings.json',
          hooks: {
            PreToolUse: [
              { matcher: 'Bash', hooks: command('guard-bash.mjs') },
              { matcher: 'Edit|Write|MultiEdit|NotebookEdit', hooks: command('guard-bash.mjs') },
            ],
            PostToolUse: [{ matcher: 'Bash', hooks: [...command('stop-after-3.mjs'), ...command('verify-before-stop.mjs')] }],
            PostToolUseFailure: [{ matcher: 'Bash', hooks: [...command('stop-after-3.mjs'), ...command('verify-before-stop.mjs')] }],
            Stop: [{ matcher: '', hooks: command('verify-before-stop.mjs') }],
            SessionStart: [{ matcher: '', hooks: [...command('codegraph.mjs'), ...command('worktree-sweep.mjs')] }],
          },
          enabledMcpjsonServers: ['codegraph'],
          permissions: { allow: ['mcp__codegraph__codegraph_explore'] },
        },
        undefined,
        2,
      )}\n`,
    );
  });

  it('merges the pack into existing settings, keeps a repo hookset.json, and adds to a group with the same matcher', () => {
    const settings = {
      permissions: { allow: ['Bash(ls)'] },
      hooks: {
        PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/guard-bash.mjs"' }] }],
        PostToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node other.mjs' }] }, { hooks: [{ type: 'command', command: 'node any.mjs' }] }],
      },
    };
    const dir = repo({ 'lefthook.yml': lefthookTemplate(STATIONS, REF), '.claude/settings.json': JSON.stringify(settings), '.claude/hookset.json': '{"frozen":["a/**"]}' });
    expect(initRepo(dir, PKG, { claude: true }).written).toEqual([
      '.claude/hooks/guard-bash.mjs',
      '.claude/hooks/stop-after-3.mjs',
      '.claude/hooks/verify-before-stop.mjs',
      '.claude/hooks/codegraph.mjs',
      '.claude/hooks/worktree-sweep.mjs',
      '.claude/skills/verify/SKILL.md',
      '.claude/settings.json',
      '.mcp.json',
      '.gitignore',
    ]);
    expect(read(dir, '.claude/hookset.json')).toBe('{"frozen":["a/**"]}');
    const merged = JSON.parse(read(dir, '.claude/settings.json')) as { permissions: unknown; hooks: Record<string, { matcher?: string; hooks: { command: string }[] }[]> };
    expect(merged.permissions).toEqual({ allow: ['Bash(ls)', 'mcp__codegraph__codegraph_explore'] });
    expect(Object.keys(merged.hooks)).toEqual(['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'Stop', 'SessionStart']);
    expect(merged.hooks['PreToolUse']?.map((g) => [g.matcher, g.hooks.length])).toEqual([
      ['Bash', 1],
      ['Edit|Write|MultiEdit|NotebookEdit', 1],
    ]);
    expect(merged.hooks['PostToolUse']?.map((g) => [g.matcher, g.hooks.map((h) => h.command)])).toEqual([
      ['Bash', ['node other.mjs', 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/stop-after-3.mjs"', 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/verify-before-stop.mjs"']],
      [undefined, ['node any.mjs']],
    ]);
    expect(initRepo(dir, PKG, { claude: true })).toEqual({ changed: false, written: [] });
  });
  it('passes over a group with no matcher when it looks for the pack hook\'s group, and adds its own after it', () => {
    const settings = { hooks: { PostToolUseFailure: [{ hooks: [{ type: 'command', command: 'node log.mjs' }] }] } };
    const dir = repo({ 'lefthook.yml': lefthookTemplate(STATIONS, REF), '.claude/settings.json': JSON.stringify(settings) });
    initRepo(dir, PKG, { claude: true });
    const merged = JSON.parse(read(dir, '.claude/settings.json')) as { hooks: Record<string, { matcher?: string; hooks: { command: string }[] }[]> };
    expect(merged.hooks['PostToolUseFailure']?.map((g) => [g.matcher, g.hooks.map((h) => h.command)])).toEqual([
      [undefined, ['node log.mjs']],
      ['Bash', ['node "$CLAUDE_PROJECT_DIR/.claude/hooks/stop-after-3.mjs"', 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/verify-before-stop.mjs"']],
    ]);
  });
});

describe('the line readers, at their edges', () => {
  it('keeps an unbalanced quote, and reads a remotes key with a comment after it', () => {
    expect(parseRemotes('remotes: # pinned\n  - git_url: "abc\n    ref: \'v2\n')).toEqual([{ gitUrl: '"abc', ref: "'v2", configs: [] }]);
  });

  it('finds no remotes block in a file that opens indented', () => {
    expect(parseRemotes('  - git_url: x\n    ref: y\npre-push:\n')).toEqual([]);
  });

  it('starts a remote at any of its keys, with extra blanks after the dash, and an empty git_url when none is given', () => {
    const yaml = ['remotes:', '  - configs:', '      - a.yml', '  - refetch: true', '  - refetch_frequency: 24h', '  -   git_url: spaced', '  - ref: only'].join('\n');
    expect(parseRemotes(yaml)).toEqual([
      { gitUrl: '', ref: undefined, configs: ['a.yml'] },
      { gitUrl: '', ref: undefined, configs: [] },
      { gitUrl: '', ref: undefined, configs: [] },
      { gitUrl: 'spaced', ref: undefined, configs: [] },
      { gitUrl: '', ref: 'only', configs: [] },
    ]);
  });

  it('takes a config path with a colon as a path, and a bare word under configs as nothing', () => {
    expect(parseRemotes('remotes:\n  - git_url: u\n    configs:\n      - c:/presets/a.yml\n      notakey\n      - b.yml\n')).toEqual([{ gitUrl: 'u', ref: undefined, configs: ['c:/presets/a.yml', 'b.yml'] }]);
  });

  it('names a command only by a bare key, and a hook only by a key at the margin', () => {
    const yaml = ['  run: early', 'pre-push:', '  commands:', '    good:', '      run: a', '    weird name:', '      run: b', '    x.sh:', '      run: c', '---', '      run: d'].join('\n');
    expect(localRuns(yaml)).toEqual([
      { hook: '', command: '', run: 'early' },
      { hook: 'pre-push', command: 'good', run: 'a' },
      { hook: 'pre-push', command: 'good', run: 'b' },
      { hook: 'pre-push', command: 'good', run: 'c' },
      { hook: 'pre-push', command: 'good', run: 'd' },
    ]);
  });

  it('reads every block scalar indicator', () => {
    for (const indicator of ['|', '>', '|-', '>-']) {
      expect(localRuns(`pre-push:\n  commands:\n    a:\n      run: ${indicator}\n        one\n    b:\n      run: two\n`)).toEqual([
        { hook: 'pre-push', command: 'a', run: 'one' },
        { hook: 'pre-push', command: 'b', run: 'two' },
      ]);
    }
  });
});

describe('the checks, at their edges', () => {
  it('reports only the step that repeats a preset, beside one that does not', () => {
    const yaml = `${lefthookTemplate(STATIONS, REF)}pre-push:\n  commands:\n    docs:\n      run: npm run docs\n    again:\n      run: npm run hook:verify\n`;
    expect(checkRepo(repo({ 'package.json': ALL_SCRIPTS, 'lefthook.yml': yaml }), PKG).problems).toEqual([
      { id: 'duplicate', severity: 'error', message: 'pre-push → again repeats the verify station the preset already runs', fix: 'delete pre-push.commands.again from lefthook.yml' },
    ]);
  });

  it('does not take another remote for the hookset one', () => {
    const yaml = lefthookTemplate(STATIONS, REF).replace(REMOTE, 'https://github.com/ofri-peretz/bur.gitgee');
    expect(checkRepo(repo({ 'package.json': ALL_SCRIPTS, 'lefthook.yml': yaml }), PKG).problems.map((p) => p.id)).toEqual(['no-remote']);
  });

  it('wants stop-after-3 on its own events, not on the event guard-bash runs on', () => {
    const dir = repo({ 'package.json': ALL_SCRIPTS, 'lefthook.yml': lefthookTemplate(STATIONS, REF), '.claude/hookset.json': '{}' });
    initRepo(dir, PKG, { claude: true });
    fillSkill(dir);
    writeFileSync(
      join(dir, '.claude/settings.json'),
      JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [cmd('guard-bash.mjs'), cmd('stop-after-3.mjs')] }, { matcher: 'Edit|Write|MultiEdit|NotebookEdit', hooks: [cmd('guard-bash.mjs')] }] } }),
    );
    expect(checkRepo(dir, PKG).problems.map((p) => p.message)).toEqual([
      '.claude/settings.json does not run stop-after-3.mjs on PostToolUse (Bash)',
      '.claude/settings.json does not run stop-after-3.mjs on PostToolUseFailure (Bash)',
      '.claude/settings.json does not run verify-before-stop.mjs on PostToolUse (Bash)',
      '.claude/settings.json does not run verify-before-stop.mjs on PostToolUseFailure (Bash)',
      '.claude/settings.json does not run verify-before-stop.mjs on Stop ()',
      '.claude/settings.json does not run codegraph.mjs on SessionStart ()',
      '.claude/settings.json does not run worktree-sweep.mjs on SessionStart ()',
      '.claude/settings.json does not enable the codegraph server, so every session asks first',
    ]);
  });

  it('counts the errors and the warnings it lists in the head line of a failing result', () => {
    const warning: Problem = { id: 'w', severity: 'warning', message: 'm', fix: 'f' };
    const error: Problem = { id: 'e', severity: 'error', message: 'n', fix: 'g' };
    expect(checkText({ ok: false, pinned: undefined, expected: REF, problems: [warning, error, warning] })).toBe('hookset: 1 error, 2 warnings\n! m\n  fix: f\n✗ n\n  fix: g\n! m\n  fix: f');
    expect(head([error, warning])).toBe('hookset: 1 error, 1 warning');
    expect(head([error, error, warning, warning, warning])).toBe('hookset: 2 errors, 3 warnings');
    expect(head([error])).toBe('hookset: 1 error');
  });
});

describe('init, at its edges', () => {
  it('moves only the ref inside the remotes block', () => {
    const before = `pre-push:\n  commands:\n    a:\n      ref: before\nremotes:\n  - git_url: ${REMOTE}\n    configs: []\npost:\n  ref: after\n`;
    const dir = repo({ 'lefthook.yml': before });
    expect(initRepo(dir, PKG)).toEqual({ changed: false, written: [] });
    const pinned = repo({ 'lefthook.yml': before.replace('    configs: []', '    ref: old\n    configs: []') });
    initRepo(pinned, PKG);
    expect(read(pinned, 'lefthook.yml')).toBe(before.replace('    configs: []', `    ref: ${REF}\n    configs: []`));
  });

  it('refuses a remotes block with a comment on its key line', () => {
    const dir = repo({ 'lefthook.yml': 'remotes: # theirs\n  - git_url: https://github.com/a/b\n' });
    expect(initRepo(dir, PKG, { force: true }).refused).toBe('lefthook.yml already has a remotes: block; add the hookset remote to it by hand');
  });

  it('adds a pack hook to an existing group as a command hook', () => {
    const dir = repo({ 'lefthook.yml': lefthookTemplate(STATIONS, REF), '.claude/settings.json': JSON.stringify({ hooks: { PostToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node x.mjs' }] }] } }) });
    initRepo(dir, PKG, { claude: true });
    const merged = JSON.parse(read(dir, '.claude/settings.json')) as { hooks: { PostToolUse: { hooks: unknown[] }[] } };
    expect(merged.hooks.PostToolUse[0]?.hooks).toEqual([
      { type: 'command', command: 'node x.mjs' },
      { type: 'command', command: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/stop-after-3.mjs"' },
      { type: 'command', command: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/verify-before-stop.mjs"' },
    ]);
  });
});

describe('the readers, at the last edges', () => {
  it('ends a configs list at another key, and reads only an inline list as one', () => {
    expect(parseRemotes('remotes:\n  - git_url: u\n    configs:\n      - a.yml\n    foo: bar\n      - late.yml\n')).toEqual([{ gitUrl: 'u', ref: undefined, configs: ['a.yml'] }]);
    expect(parseRemotes('remotes:\n  - git_url: u\n    configs: one.yml\n    refetch: [true]\n')).toEqual([{ gitUrl: 'u', ref: undefined, configs: [] }]);
  });

  it('keeps a whitespace-only line inside a block scalar, and drops blank lines at its end', () => {
    expect(localRuns('pre-push:\n  commands:\n    a:\n      run: |\n        one\n  \n        two\n\n    b:\n      run: three\n')).toEqual([
      { hook: 'pre-push', command: 'a', run: 'one\n\ntwo' },
      { hook: 'pre-push', command: 'b', run: 'three' },
    ]);
  });

  it('does not carry a key from the remotes block into the next hook', () => {
    expect(localRuns('remotes:\n  - git_url: x\n    configs:\n      - a.yml\npre-push:\n  run: npm run hook:verify\n')).toEqual([{ hook: 'pre-push', command: '', run: 'npm run hook:verify' }]);
  });

  it('leaves a ref at the margin after the remotes block alone', () => {
    const before = `remotes:\n  - git_url: ${REMOTE}\nref: top\n`;
    const dir = repo({ 'lefthook.yml': before });
    expect(initRepo(dir, PKG)).toEqual({ changed: false, written: [] });
  });
});
