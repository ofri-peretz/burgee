/**
 * hookset's whole logic: read a repo's lefthook.yml and .claude/, compare them with the presets
 * this package ships, and write the smallest config that pulls them.
 *
 * Builtins only and erasable syntax only, so Node runs this file as it is (type stripping): the
 * reusable `hookset-check` workflow checks a caller repo out beside burgee at the pinned tag and
 * imports `src/core.ts` with no install and no build. `cli.ts` is the burgee program over it.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Hook = 'commit-msg' | 'pre-commit' | 'pre-push';
export type Mode = 'enforce' | 'optional' | 'observe';

export interface Station {
  id: string;
  hook: Hook;
  mode: Mode;
  /** The command name the preset gives this station's step. */
  command: string;
  /** The repo script the step runs, when the repo decides what the station does. */
  script?: string;
  detail: string;
}

export interface ClaudeHook {
  event: string;
  matcher: string;
  file: string;
}

export interface Stations {
  remote: string;
  tagPrefix: string;
  presets: Record<Hook, string>;
  stations: Station[];
  claude: { files: string[]; hooks: ClaudeHook[] };
}

export interface Problem {
  id: string;
  severity: 'error' | 'warning';
  message: string;
  fix: string;
}

export interface Remote {
  gitUrl: string;
  ref: string | undefined;
  configs: string[];
}

export interface Run {
  hook: string;
  command: string;
  run: string;
}

/** The package root: the folder holding stations.json, presets/ and claude/. */
export function packageRoot(from: string = import.meta.url): string {
  return fileURLToPath(new URL('..', from));
}

export function loadStations(pkg: string): Stations {
  return JSON.parse(readFileSync(join(pkg, 'stations.json'), 'utf8')) as Stations;
}

export function packageVersion(pkg: string): string {
  return (JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8')) as { version: string }).version;
}

const unquote = (text: string): string => {
  const bare = text.trim();
  return bare.length > 1 && (bare[0] === '"' || bare[0] === "'") && bare.endsWith(bare[0]) ? bare.slice(1, -1) : bare;
};

const indentOf = (line: string): number => line.length - line.trimStart().length;

/** Lines of one top-level key's block, `remotes:` included, or [] when the key is absent. */
function topBlock(lines: string[], key: string): { from: number; to: number } | undefined {
  const from = lines.findIndex((l) => l.startsWith(`${key}:`));
  if (from === -1) return undefined;
  let to = from + 1;
  while (to < lines.length && (lines[to] === '' || /^[\s#-]/.test(lines[to] ?? ''))) to++;
  return { from, to };
}

/** `key: value` with a bare word key, from text already trimmed of its indent; else undefined. */
function keyValue(text: string): [string, string] | undefined {
  const at = text.indexOf(':');
  const key = text.slice(0, at);
  return at > 0 && /^[\w-]+$/.test(key) ? [key, text.slice(at + 1).trim()] : undefined;
}

/** The text after a leading `- `, or undefined when the trimmed line is not a list item. */
const listItem = (text: string): string | undefined => (text.startsWith('- ') ? text.slice(2).trim() : undefined);

const stripComment = (line: string): string => {
  const at = line.indexOf(' #');
  return (at === -1 ? line : line.slice(0, at)).trim();
};

const REMOTE_KEYS = new Set(['git_url', 'ref', 'configs', 'refetch', 'refetch_frequency']);

/**
 * The `remotes:` entries of a lefthook.yml. Read line by line: hookset writes this block itself,
 * and a full YAML parser would be this package's only dependency. A remote starts at a list item
 * whose first word is one of its keys; a configs entry is a list item that is a path.
 */
export function parseRemotes(yaml: string): Remote[] {
  const lines = yaml.split(/\r?\n/);
  const block = topBlock(lines, 'remotes');
  const state: { remotes: Remote[]; inConfigs: boolean } = { remotes: [], inConfigs: false };
  for (const raw of block ? lines.slice(block.from + 1, block.to) : []) remoteLine(state, stripComment(raw));
  return state.remotes;
}

/** Fold one trimmed line of the `remotes:` block into `state`. */
function remoteLine(state: { remotes: Remote[]; inConfigs: boolean }, text: string): void {
  if (text === '' || text.startsWith('#')) return;
  const item = listItem(text);
  const pair = keyValue(item ?? text);
  const isKey = pair !== undefined && (item === undefined || REMOTE_KEYS.has(pair[0]));
  if (item !== undefined && isKey) state.remotes.push({ gitUrl: '', ref: undefined, configs: [] });
  const current = state.remotes.at(-1);
  if (!current) return;
  if (isKey) {
    state.inConfigs = pair[0] === 'configs';
    assign(current, pair[0], pair[1]);
  } else if (item !== undefined && state.inConfigs) current.configs.push(unquote(item));
}

function assign(remote: Remote, key: string, value: string): void {
  if (key === 'git_url') remote.gitUrl = unquote(value);
  else if (key === 'ref') remote.ref = unquote(value);
  else if (key === 'configs' && value.startsWith('[')) {
    remote.configs.push(
      ...value
        .slice(1, -1)
        .split(',')
        .map(unquote)
        .filter(Boolean),
    );
  }
}

/** A block scalar's body (`run: |`): the lines after `at` indented deeper than it, trimmed. */
function blockBody(lines: string[], at: number): { text: string; end: number } {
  const indent = indentOf(lines[at] ?? '');
  const body: string[] = [];
  let i = at;
  while (i + 1 < lines.length && ((lines[i + 1] ?? '').trim() === '' || indentOf(lines[i + 1] ?? '') > indent)) body.push((lines[++i] ?? '').trim());
  return { text: body.join('\n').trim(), end: i };
}

const CONTAINERS = new Set(['commands', 'scripts', 'jobs']);

/** Every `run:` a lefthook.yml declares itself, outside `remotes:`, with its hook and command. */
export function localRuns(yaml: string): Run[] {
  const lines = yaml.split(/\r?\n/);
  const runs: Run[] = [];
  const at = { hook: '', command: '' };
  for (let i = 0; i < lines.length; i++) {
    const pair = runLine(at, lines[i] ?? '');
    if (pair?.[0] !== 'run') continue;
    let value = pair[1];
    if (['|', '>', '|-', '>-'].includes(value)) {
      const body = blockBody(lines, i);
      value = body.text;
      i = body.end;
    }
    runs.push({ hook: at.hook, command: at.command, run: unquote(value) });
  }
  return runs;
}

/** Track which hook and command `line` sits under; return its `key: value` when it is inside one. */
function runLine(at: { hook: string; command: string }, line: string): [string, string] | undefined {
  const indented = /^\s/.test(line);
  if (!indented && keyValue(line)) at.hook = line.slice(0, line.indexOf(':'));
  if (at.hook === 'remotes' || !indented) return undefined;
  const text = line.trim();
  const pair = keyValue(listItem(text) ?? text);
  if (pair && pair[1] === '' && !CONTAINERS.has(pair[0])) at.command = pair[0];
  return pair;
}

/** True when a hand-written step repeats what a preset station already runs. */
export function duplicateOf(run: Run, stations: Station[]): Station | undefined {
  const words = run.run.split(/\s+/);
  return stations.find((s) => {
    if (s.id === 'commitlint') return run.hook === 'commit-msg' && words.some((w) => w === 'commitlint' || w.endsWith('/commitlint')) && words.includes('--edit');
    return s.script !== undefined && words.includes(s.script);
  });
}

const sameRemote = (a: string, b: string): boolean => a.replace(/\.git$/, '').replace(/\/$/, '') === b.replace(/\.git$/, '').replace(/\/$/, '');

export interface CheckResult {
  ok: boolean;
  /** The `hookset@…` tag the repo pins, when it pins one. */
  pinned: string | undefined;
  expected: string;
  problems: Problem[];
}

type Report = (id: string, message: string, fix: string) => void;
interface Reporter {
  error: Report;
  warn: Report;
}

/** The lefthook.yml half of the check; returns the pinned tag. */
function checkLefthook(repo: string, stations: Stations, expected: string, { error, warn }: Reporter): string | undefined {
  const file = join(repo, 'lefthook.yml');
  if (!existsSync(file)) {
    error('no-lefthook', 'there is no lefthook.yml', 'run `hookset init`');
    return undefined;
  }
  const yaml = readFileSync(file, 'utf8');
  for (const run of localRuns(yaml)) {
    const dup = duplicateOf(run, stations.stations);
    if (dup) error('duplicate', `${run.hook} → ${run.command} repeats the ${dup.id} station the preset already runs`, `delete ${run.hook}.commands.${run.command} from lefthook.yml`);
  }
  const remote = parseRemotes(yaml).find((r) => sameRemote(r.gitUrl, stations.remote));
  if (!remote) {
    error('no-remote', `lefthook.yml does not pull the presets from ${stations.remote}`, 'run `hookset init --force`');
    return undefined;
  }
  for (const [hook, preset] of Object.entries(stations.presets)) {
    if (!remote.configs.includes(preset)) error('missing-preset', `the ${hook} preset is not pulled (${preset})`, `add \`- ${preset}\` under the remote's configs`);
  }
  const ref = remote.ref ?? '';
  if (!ref.startsWith(stations.tagPrefix)) {
    error('unpinned', `the presets remote is pinned to ${ref || 'the default branch'}, not a ${stations.tagPrefix}<version> tag`, `set \`ref: ${expected}\``);
    return undefined;
  }
  if (ref !== expected) warn('behind', `the presets are pinned to ${ref}; this hookset is ${expected}`, `set \`ref: ${expected}\` (\`hookset init\` does it)`);
  return ref;
}

/** The package.json half: something installs the hooks, and each enforced station has its script. */
function checkScripts(repo: string, stations: Stations, { error, warn }: Reporter): void {
  const manifest = join(repo, 'package.json');
  if (!existsSync(manifest)) {
    error('no-package', 'there is no package.json to declare the station scripts in', 'add a private package.json with lefthook as a devDependency');
    return;
  }
  const scripts = new Map(Object.entries((JSON.parse(readFileSync(manifest, 'utf8')) as { scripts?: Record<string, string> }).scripts ?? {}));
  if (!(scripts.get('prepare') ?? '').includes('lefthook install')) error('not-installed', 'nothing installs the hooks: package.json has no `prepare` running `lefthook install`', 'add `"prepare": "lefthook install || true"`');
  for (const s of stations.stations) {
    if (s.script === undefined || scripts.has(s.script)) continue;
    if (s.mode === 'enforce') error('missing-script', `the ${s.id} station runs \`npm run ${s.script}\`, and package.json does not declare it`, `add "${s.script}" to package.json scripts: ${s.detail}`);
    else warn('station-off', `the ${s.id} station is not declared yet (${s.mode})`, `add "${s.script}" to package.json scripts when the repo has it: ${s.detail}`);
  }
}

/** Everything `hookset check` reports for the repo at `repo`, against the presets in `pkg`. */
export function checkRepo(repo: string, pkg: string): CheckResult {
  const stations = loadStations(pkg);
  const expected = `${stations.tagPrefix}${packageVersion(pkg)}`;
  const problems: Problem[] = [];
  const error: Report = (id, message, fix) => void problems.push({ id, severity: 'error', message, fix });
  const warn: Report = (id, message, fix) => void problems.push({ id, severity: 'warning', message, fix });
  const pinned = checkLefthook(repo, stations, expected, { error, warn });
  checkScripts(repo, stations, { error, warn });
  const claudeDir = join(repo, '.claude');
  if (existsSync(join(claudeDir, 'hookset.json'))) problems.push(...checkClaude(repo, pkg, stations));
  else if (existsSync(claudeDir)) warn('claude-not-adopted', 'the repo has a .claude/ directory without the hookset Claude pack', 'run `hookset init --claude`');
  return { ok: !problems.some((p) => p.severity === 'error'), pinned, expected, problems };
}

function settingsCommands(repo: string): { event: string; matcher: string; command: string }[] {
  const file = join(repo, '.claude', 'settings.json');
  if (!existsSync(file)) return [];
  const settings = JSON.parse(readFileSync(file, 'utf8')) as { hooks?: Record<string, { matcher?: string; hooks?: { command?: string }[] }[]> };
  return Object.entries(settings.hooks ?? {}).flatMap(([event, groups]) =>
    groups.flatMap((g) => (g.hooks ?? []).map((h) => ({ event, matcher: g.matcher ?? '', command: h.command ?? '' }))),
  );
}

const hookCommand = (file: string): string => `node "$CLAUDE_PROJECT_DIR/.claude/hooks/${file}"`;

function checkClaude(repo: string, pkg: string, stations: Stations): Problem[] {
  const problems: Problem[] = [];
  for (const file of stations.claude.files) {
    const vendored = join(repo, '.claude', 'hooks', file);
    if (!existsSync(vendored)) problems.push({ id: 'claude-missing', severity: 'error', message: `.claude/hooks/${file} is missing`, fix: 'run `hookset init --claude`' });
    else if (readFileSync(vendored, 'utf8') !== readFileSync(join(pkg, 'claude', file), 'utf8')) {
      problems.push({ id: 'claude-drift', severity: 'error', message: `.claude/hooks/${file} differs from the hookset copy`, fix: 'run `hookset init --claude`; change the canonical copy in burgee, not the vendored one' });
    }
  }
  const wired = settingsCommands(repo);
  for (const h of expectedClaudeHooks(stations)) {
    if (!wired.some((w) => w.event === h.event && w.matcher === h.matcher && w.command.includes(`.claude/hooks/${h.file}`))) {
      problems.push({ id: 'claude-unwired', severity: 'error', message: `.claude/settings.json does not run ${h.file} on ${h.event} (${h.matcher})`, fix: 'run `hookset init --claude`' });
    }
  }
  return problems;
}

/** The pack's hooks, with stop-after-3 also on PostToolUseFailure (a failed Bash call lands there). */
export function expectedClaudeHooks(stations: Stations): ClaudeHook[] {
  return stations.claude.hooks.flatMap((h) => (h.event === 'PostToolUse' ? [h, { ...h, event: 'PostToolUseFailure' }] : [h]));
}

/** The lefthook.yml `hookset init` writes into a repo with none. */
export function lefthookTemplate(stations: Stations, ref: string): string {
  return `# Git hooks. The stations come from the hookset presets (burgee packages/hookset), pinned by tag:
# bump \`ref\` to take a new preset version. \`hookset check\` (CI) fails on a missing station, an
# unpinned ref, or a step here that repeats one a preset runs.
${remotesBlock(stations, ref)}
# Repo-specific steps go below, under the hook they belong to. The presets call the repo's own
# \`hook:staged\` and \`hook:verify\` scripts (package.json), so most repos need nothing here.
`;
}

function remotesBlock(stations: Stations, ref: string): string {
  return `remotes:
  - git_url: ${stations.remote}
    ref: ${ref}
    configs:
${Object.values(stations.presets)
  .map((p) => `      - ${p}`)
  .join('\n')}
`;
}

export interface InitResult {
  changed: boolean;
  written: string[];
  refused?: string;
}

/**
 * Write or update the hookset wiring in `repo`. A lefthook.yml hookset did not write is refused
 * unless `force`, which puts the remotes block on top and keeps every hand-written step (`check`
 * then names the duplicates to delete). `claude` also vendors the Claude pack.
 */
export function initRepo(repo: string, pkg: string, options: { force?: boolean; claude?: boolean } = {}): InitResult {
  const stations = loadStations(pkg);
  const ref = `${stations.tagPrefix}${packageVersion(pkg)}`;
  const written: string[] = [];
  const write = (rel: string, text: string): void => {
    const file = join(repo, rel);
    if (existsSync(file) && readFileSync(file, 'utf8') === text) return;
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, text);
    written.push(rel);
  };
  const lefthook = nextLefthook(repo, stations, ref, options.force === true);
  if ('refused' in lefthook) return { changed: false, written, refused: lefthook.refused };
  write('lefthook.yml', lefthook.text);
  if (options.claude) {
    for (const file of stations.claude.files) write(`.claude/hooks/${file}`, readFileSync(join(pkg, 'claude', file), 'utf8'));
    if (!existsSync(join(repo, '.claude', 'hookset.json'))) write('.claude/hookset.json', `${JSON.stringify({ ask: [], frozen: [] }, undefined, 2)}\n`);
    write('.claude/settings.json', mergeSettings(repo, stations));
  }
  return { changed: written.length > 0, written };
}

/** The lefthook.yml `init` leaves, or why it will not touch the one there. */
function nextLefthook(repo: string, stations: Stations, ref: string, force: boolean): { text: string } | { refused: string } {
  const file = join(repo, 'lefthook.yml');
  if (!existsSync(file)) return { text: lefthookTemplate(stations, ref) };
  const yaml = readFileSync(file, 'utf8');
  if (parseRemotes(yaml).some((r) => sameRemote(r.gitUrl, stations.remote))) return { text: repin(yaml, ref) };
  if (yaml.split(/\r?\n/).some((l) => l.startsWith('remotes:'))) return { refused: 'lefthook.yml already has a remotes: block; add the hookset remote to it by hand' };
  if (!force) return { refused: 'lefthook.yml was written by hand; pass --force to add the presets on top of it' };
  return { text: `${remotesBlock(stations, ref)}\n${yaml}` };
}

/** Move the first `ref:` inside `remotes:` to `ref`. */
function repin(yaml: string, ref: string): string {
  const lines = yaml.split('\n');
  const block = topBlock(lines, 'remotes');
  const at = lines.findIndex((l, i) => block !== undefined && i > block.from && i < block.to && keyValue(listItem(l.trim()) ?? l.trim())?.[0] === 'ref');
  const line = lines[at];
  if (line === undefined) return yaml;
  lines.splice(at, 1, `${line.slice(0, line.indexOf('ref:'))}ref: ${ref}`);
  return lines.join('\n');
}

type HookGroup = { matcher?: string; hooks: { type: string; command: string }[] };
type Settings = { hooks?: Record<string, HookGroup[]> } & Record<string, unknown>;

function mergeSettings(repo: string, stations: Stations): string {
  const file = join(repo, '.claude', 'settings.json');
  const settings: Settings = existsSync(file)
    ? (JSON.parse(readFileSync(file, 'utf8')) as Settings)
    : { $schema: 'https://json.schemastore.org/claude-code-settings.json' };
  const events = new Map(Object.entries(settings.hooks ?? {}));
  for (const h of expectedClaudeHooks(stations)) {
    const groups = events.get(h.event) ?? [];
    events.set(h.event, groups);
    if (groups.some((g) => (g.matcher ?? '') === h.matcher && g.hooks.some((c) => c.command.includes(`.claude/hooks/${h.file}`)))) continue;
    const group = groups.find((g) => (g.matcher ?? '') === h.matcher);
    if (group) group.hooks.push({ type: 'command', command: hookCommand(h.file) });
    else groups.push({ matcher: h.matcher, hooks: [{ type: 'command', command: hookCommand(h.file) }] });
  }
  settings.hooks = Object.fromEntries(events);
  return `${JSON.stringify(settings, undefined, 2)}\n`;
}

/** The text a person reads for a check result. */
export function checkText(result: CheckResult): string {
  const lines = result.problems.map((p) => `${p.severity === 'error' ? '✗' : '!'} ${p.message}\n  fix: ${p.fix}`);
  const head = result.ok ? `hookset: ok (${result.pinned ?? 'unpinned'})` : `hookset: ${String(result.problems.filter((p) => p.severity === 'error').length)} problem(s)`;
  return [head, ...lines].join('\n');
}
