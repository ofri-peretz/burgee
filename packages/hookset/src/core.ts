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
  /** Seconds before Claude Code kills the hook. Required: a pack hook never runs unbounded. */
  timeout: number;
}

/** A skill every repo carries, such as `verify`: written from a template, then filled in by the repo. */
export interface ClaudeSkill {
  id: string;
  /** Where the repo keeps it, relative to the repo root. */
  path: string;
  /** The template `init --claude` writes, relative to the package root. */
  template: string;
  /** Text the filled-in skill still has to contain. */
  requires: string[];
  /** The marker the template puts on every line the repo has to replace. */
  placeholder: string;
  detail: string;
}

/** An MCP server every repo runs: written into .mcp.json, its index folder gitignored, its tools allowed. */
export interface ClaudeMcp {
  id: string;
  detail: string;
  /** The `.mcp.json` entry, written as is under `mcpServers.<id>`. */
  server: { type: string; command: string; args: string[]; env?: Record<string, string> };
  /** What the server puts in every session (its instructions and tool definitions), in characters. */
  contextChars: number;
  contextSource: string;
  /** The folder the server writes into the repo, which .gitignore must list. */
  ignore: string;
  /** The tool names settings.json allows without a prompt. */
  allow: string[];
}

export interface Stations {
  remote: string;
  tagPrefix: string;
  presets: Record<Hook, string>;
  stations: Station[];
  claude: { files: string[]; hooks: ClaudeHook[]; skills: ClaudeSkill[]; mcp: ClaudeMcp[] };
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

/** A file's text. One place names the encoding: every comparison of two reads goes through it. */
const readText = (file: string): string => readFileSync(file, 'utf8');

export function loadStations(pkg: string): Stations {
  return JSON.parse(readText(join(pkg, 'stations.json'))) as Stations;
}

export function packageVersion(pkg: string): string {
  return (JSON.parse(readText(join(pkg, 'package.json'))) as { version: string }).version;
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
  // The block runs to the next line at the margin that is not a comment or a list item.
  const next = lines.findIndex((l, i) => i > from && /^[^\s#-]/.test(l));
  return { from, to: next === -1 ? lines.length : next };
}

/** `key: value` with a bare word key, from text already trimmed of its indent; else undefined. */
function keyValue(text: string): [string, string] | undefined {
  // Stryker disable next-line Regex: equivalent, `.*` already runs to the end of one line
  const m = /^([\w-]+):(.*)$/.exec(text);
  return m ? [String(m[1]), String(m[2]).trim()] : undefined;
}

/** The text after a leading `- `, or undefined when the trimmed line is not a list item. */
const listItem = (text: string): string | undefined => (text.startsWith('- ') ? text.slice(2).trim() : undefined);

const stripComment = (line: string): string => String(line.split(' #', 1)[0]).trim();

const REMOTE_KEYS = new Set(['git_url', 'ref', 'configs', 'refetch', 'refetch_frequency']);

/**
 * The `remotes:` entries of a lefthook.yml. Read line by line: hookset writes this block itself,
 * and a full YAML parser would be this package's only dependency. A remote starts at a list item
 * whose first word is one of its keys; a configs entry is a list item that is a path.
 */
export function parseRemotes(yaml: string): Remote[] {
  return scanRemotes(yaml.split(/\r?\n/)).map(({ refAt: _, ...remote }) => remote);
}

/** A remote as `parseRemotes` reads it, and the index of the line that holds its `ref:`, so `init` re-pins that one. */
type Scanned = Remote & { refAt?: number };

function scanRemotes(lines: string[]): Scanned[] {
  const block = topBlock(lines, 'remotes');
  if (!block) return [];
  // Stryker disable next-line BooleanLiteral: equivalent, a configs entry before any remote has no remote to join
  const state: { remotes: Scanned[]; inConfigs: boolean } = { remotes: [], inConfigs: false };
  // Stryker disable next-line ArithmeticOperator,NumericLiteral: equivalent, the `remotes:` line itself starts no remote
  const from = block.from + 1;
  lines.slice(from, block.to).forEach((raw, i) => remoteLine(state, stripComment(raw), from + i));
  return state.remotes;
}

/** Fold one trimmed line of the `remotes:` block, line `at` of the file, into `state`. */
function remoteLine(state: { remotes: Scanned[]; inConfigs: boolean }, text: string, at: number): void {
  const item = listItem(text);
  const pair = keyValue(item ?? text);
  const isKey = pair !== undefined && (item === undefined || REMOTE_KEYS.has(pair[0]));
  if (item !== undefined && isKey) state.remotes.push({ gitUrl: '', ref: undefined, configs: [] });
  const current = state.remotes.at(-1);
  if (!current) return;
  if (isKey) {
    state.inConfigs = pair[0] === 'configs';
    if (pair[0] === 'ref') current.refAt = at;
    assign(current, pair[0], pair[1]);
  } else if (item !== undefined && state.inConfigs) current.configs.push(unquote(item));
}

function assign(remote: Remote, key: string, value: string): void {
  if (key === 'git_url') remote.gitUrl = unquote(value);
  else if (key === 'ref') remote.ref = unquote(value);
  else if (key === 'configs' && value.startsWith('[')) remote.configs.push(...value.slice(1, -1).split(',').map(unquote).filter(Boolean));
}

/** A block scalar's body (`run: |`): the lines after `at` indented deeper than it, each trimmed (the caller trims the whole). */
function blockBody(lines: string[], at: number): { text: string; end: number } {
  const indent = indentOf(String(lines[at]));
  const next = lines.findIndex((l, i) => i > at && l.trim() !== '' && indentOf(l) <= indent);
  const end = (next === -1 ? lines.length : next) - 1;
  return { text: lines.slice(at + 1, end + 1).map((l) => l.trim()).join('\n'), end };
}

// Stryker disable next-line StringLiteral: equivalent for `commands`, whose children rename the command before any run
const CONTAINERS = new Set(['commands', 'scripts', 'jobs']);

/** Every `run:` a lefthook.yml declares itself, outside `remotes:`, with its hook and command. */
export function localRuns(yaml: string): Run[] {
  const lines = yaml.split(/\r?\n/);
  const runs: Run[] = [];
  const at = { hook: '', command: '' };
  // Stryker disable next-line EqualityOperator: equivalent, one past the end reads `undefined`, which is no key
  for (let i = 0; i < lines.length; i++) {
    const pair = runLine(at, String(lines[i]));
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
  if (!/^\s/.test(line)) {
    at.hook = keyValue(line)?.[0] ?? at.hook;
    return undefined;
  }
  if (at.hook === 'remotes') return undefined;
  const text = line.trim();
  const pair = keyValue(listItem(text) ?? text);
  if (pair && pair[1] === '' && !CONTAINERS.has(pair[0])) at.command = pair[0];
  return pair;
}

/** True when a hand-written step repeats what a preset station already runs. */
export function duplicateOf(run: Run, stations: Station[]): Station | undefined {
  // Stryker disable next-line Regex: equivalent, a run of blanks splits into empty words no station is named
  const words = run.run.split(/\s+/);
  return stations.find((s) => {
    if (s.id === 'commitlint') return run.hook === 'commit-msg' && words.some((w) => w === 'commitlint' || w.endsWith('/commitlint')) && words.includes('--edit');
    // Every station but commitlint runs a script.
    return words.includes(String(s.script));
  });
}

/** A git URL without a trailing `.git` or `/`, the way two spellings of one remote compare equal. */
// Stryker disable next-line Regex: equivalent for the slash, which both sides lose the same way
const bareRemote = (url: string): string => url.replace(/\/$/, '').replace(/\.git$/, '');
const sameRemote = (a: string, b: string): boolean => bareRemote(a) === bareRemote(b);

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

/** Hooks whose preset is `piped: true` (stop at the first failure). A lock keeps this equal to the presets. */
export const PIPED_HOOKS = ['pre-push'];

/** True when the repo's own `<hook>:` block sets `parallel: true`, which lefthook refuses beside `piped`. */
export function setsParallel(yaml: string, hook: string): boolean {
  const lines = yaml.split('\n');
  const start = lines.indexOf(`${hook}:`);
  if (start === -1) return false;
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) return false;
    if (/^ {2}parallel:\s*true\s*(#.*)?$/.test(line)) return true;
  }
  return false;
}

/** The lefthook.yml half of the check; returns the pinned tag. */
function checkLefthook(repo: string, stations: Stations, expected: string, { error, warn }: Reporter): string | undefined {
  const file = join(repo, 'lefthook.yml');
  if (!existsSync(file)) {
    error('no-lefthook', 'there is no lefthook.yml', 'run `hookset init`');
    return undefined;
  }
  const yaml = readText(file);
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
  for (const hook of PIPED_HOOKS) {
    if (setsParallel(yaml, hook)) error('parallel-with-piped', `${hook} sets \`parallel: true\`, and the ${hook} preset is \`piped\`: lefthook refuses both, so the hook cannot run`, `delete \`parallel: true\` from ${hook} in lefthook.yml`);
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
  const scripts = new Map(Object.entries((JSON.parse(readText(manifest)) as { scripts?: Record<string, string> }).scripts ?? {}));
  // Stryker disable next-line StringLiteral: equivalent, no fallback text says `lefthook install`
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
  // Stryker disable next-line ArrayDeclaration: equivalent, a stray entry names no event, so it wires nothing
  if (!existsSync(file)) return [];
  const settings = JSON.parse(readText(file)) as { hooks?: Record<string, { matcher?: string; hooks?: { command?: string }[] }[]> };
  return Object.entries(settings.hooks ?? {}).flatMap(([event, groups]) =>
    // Stryker disable next-line ArrayDeclaration,StringLiteral: equivalent, a missing matcher or command never names a pack hook
    groups.flatMap((g) => (g.hooks ?? []).map((h) => ({ event, matcher: g.matcher ?? '', command: h.command ?? '' }))),
  );
}

const hookCommand = (file: string): string => `node "$CLAUDE_PROJECT_DIR/.claude/hooks/${file}"`;

function checkClaude(repo: string, pkg: string, stations: Stations): Problem[] {
  const problems: Problem[] = [];
  for (const file of stations.claude.files) {
    const vendored = join(repo, '.claude', 'hooks', file);
    if (!existsSync(vendored)) problems.push({ id: 'claude-missing', severity: 'error', message: `.claude/hooks/${file} is missing`, fix: 'run `hookset init --claude`' });
    else if (readText(vendored) !== readText(join(pkg, 'claude', file))) {
      problems.push({ id: 'claude-drift', severity: 'error', message: `.claude/hooks/${file} differs from the hookset copy`, fix: 'run `hookset init --claude`; change the canonical copy in burgee, not the vendored one' });
    }
  }
  const wired = settingsCommands(repo);
  for (const h of expectedClaudeHooks(stations)) {
    if (!wired.some((w) => w.event === h.event && w.matcher === h.matcher && w.command.includes(`.claude/hooks/${h.file}`))) {
      problems.push({ id: 'claude-unwired', severity: 'error', message: `.claude/settings.json does not run ${h.file} on ${h.event} (${h.matcher})`, fix: 'run `hookset init --claude`' });
    }
  }
  for (const skill of stations.claude.skills) problems.push(...checkSkill(repo, skill));
  for (const mcp of stations.claude.mcp) problems.push(...checkMcp(repo, mcp));
  return problems;
}

const readJson = <T>(file: string, fallback: T): T => (existsSync(file) ? (JSON.parse(readText(file)) as T) : fallback);
type McpJson = { mcpServers?: Record<string, unknown> } & Record<string, unknown>;

/** A pack MCP server the repo must run: in .mcp.json as hookset pins it, its index gitignored, enabled in settings.json. */
export function checkMcp(repo: string, mcp: ClaudeMcp): Problem[] {
  const problems: Problem[] = [];
  const server = readJson<McpJson>(join(repo, '.mcp.json'), {}).mcpServers?.[mcp.id];
  if (server === undefined) problems.push({ id: `${mcp.id}-mcp-missing`, severity: 'error', message: `.mcp.json does not run the ${mcp.id} server: ${mcp.detail}`, fix: 'run `hookset init --claude`' });
  else if (JSON.stringify(server) !== JSON.stringify(mcp.server)) problems.push({ id: `${mcp.id}-mcp-drift`, severity: 'error', message: `.mcp.json runs ${mcp.id} differently from the hookset pin (${mcp.server.args.join(' ')})`, fix: 'run `hookset init --claude`; change the pin in burgee packages/hookset/stations.json' });
  const ignore = join(repo, '.gitignore');
  if (!(existsSync(ignore) && readText(ignore).split(/\r?\n/).some((l) => l.trim() === mcp.ignore))) {
    problems.push({ id: `${mcp.id}-not-ignored`, severity: 'error', message: `.gitignore does not list ${mcp.ignore}, the ${mcp.id} index`, fix: `add \`${mcp.ignore}\` to .gitignore (\`hookset init --claude\` does)` });
  }
  const settings = readJson<Settings>(join(repo, '.claude', 'settings.json'), {});
  if (!(settings.enabledMcpjsonServers ?? []).includes(mcp.id)) {
    problems.push({ id: `${mcp.id}-mcp-disabled`, severity: 'error', message: `.claude/settings.json does not enable the ${mcp.id} server, so every session asks first`, fix: `add "${mcp.id}" to enabledMcpjsonServers (\`hookset init --claude\` does)` });
  }
  return problems;
}

/** A pack skill the repo must carry and fill in: present, still holding what it requires, no placeholder left. */
export function checkSkill(repo: string, skill: ClaudeSkill): Problem[] {
  const file = join(repo, skill.path);
  if (!existsSync(file)) return [{ id: `${skill.id}-skill-missing`, severity: 'error', message: `${skill.path} is missing: ${skill.detail}`, fix: `run \`hookset init --claude\`, then fill in every ${skill.placeholder} line` }];
  const text = readText(file);
  const problems: Problem[] = [];
  const left = text.split(/\r?\n/).filter((l) => l.includes(skill.placeholder)).length;
  if (left > 0) problems.push({ id: `${skill.id}-skill-unfilled`, severity: 'error', message: `${skill.path} still has ${String(left)} ${skill.placeholder} line${left === 1 ? '' : 's'}`, fix: `replace each ${skill.placeholder} line with this repo's real steps` });
  for (const need of skill.requires) {
    if (!text.includes(need)) problems.push({ id: `${skill.id}-skill-incomplete`, severity: 'error', message: `${skill.path} has no \`${need}\``, fix: `put \`${need}\` back; the template shows where it goes` });
  }
  return problems;
}

/** The pack's hooks, each PostToolUse one also on PostToolUseFailure (a failed Bash call lands there). */
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
    if (existsSync(file) && readText(file) === text) return;
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, text);
    written.push(rel);
  };
  const lefthook = nextLefthook(repo, stations, ref, options.force === true);
  if ('refused' in lefthook) return { changed: false, written, refused: lefthook.refused };
  write('lefthook.yml', lefthook.text);
  if (options.claude) {
    for (const file of stations.claude.files) write(`.claude/hooks/${file}`, readText(join(pkg, 'claude', file)));
    if (!existsSync(join(repo, '.claude', 'hookset.json'))) write('.claude/hookset.json', prettyJson({ ask: [], frozen: [] }));
    // A skill is the repo's to fill in: written once from the template, never overwritten.
    for (const skill of stations.claude.skills) if (!existsSync(join(repo, skill.path))) write(skill.path, readText(join(pkg, skill.template)));
    write('.claude/settings.json', mergeSettings(repo, stations));
    write('.mcp.json', mergeMcp(repo, stations));
    write('.gitignore', mergeIgnore(repo, stations));
  }
  return { changed: written.length > 0, written };
}

/** The lefthook.yml `init` leaves, or why it will not touch the one there. */
function nextLefthook(repo: string, stations: Stations, ref: string, force: boolean): { text: string } | { refused: string } {
  const file = join(repo, 'lefthook.yml');
  if (!existsSync(file)) return { text: lefthookTemplate(stations, ref) };
  const yaml = readText(file);
  if (parseRemotes(yaml).some((r) => sameRemote(r.gitUrl, stations.remote))) return { text: repin(yaml, ref, stations.remote) };
  if (yaml.split(/\r?\n/).some((l) => l.startsWith('remotes:'))) return { refused: 'lefthook.yml already has a remotes: block; add the hookset remote to it by hand' };
  if (!force) return { refused: 'lefthook.yml was written by hand; pass --force to add the presets on top of it' };
  return { text: `${remotesBlock(stations, ref)}\n${yaml}` };
}

/**
 * Move the hookset remote's `ref:` to `ref`. Only that remote's: a repo that lists another remote
 * first keeps that one's pin, which is not hookset's to move.
 */
function repin(yaml: string, ref: string, remote: string): string {
  const eol = yaml.includes('\r\n') ? '\r\n' : '\n';
  const lines = yaml.split(/\r?\n/);
  // The caller has proved the hookset remote is listed.
  const at = (scanRemotes(lines).find((r) => sameRemote(r.gitUrl, remote)) as Scanned).refAt;
  if (at === undefined) return yaml;
  const line = String(lines[at]);
  lines.splice(at, 1, `${line.slice(0, line.indexOf('ref:'))}ref: ${ref}`);
  return lines.join(eol);
}

type HookGroup = { matcher?: string; hooks: { type: string; command: string; timeout?: number }[] };
type Settings = { hooks?: Record<string, HookGroup[]>; enabledMcpjsonServers?: string[]; permissions?: { allow?: string[] } & Record<string, unknown> } & Record<string, unknown>;

/** .mcp.json with every pack server at its pinned entry; servers the repo added stay as they are. */
function mergeMcp(repo: string, stations: Stations): string {
  const mcp = readJson<McpJson>(join(repo, '.mcp.json'), {});
  mcp.mcpServers = { ...mcp.mcpServers, ...Object.fromEntries(stations.claude.mcp.map((m) => [m.id, m.server])) };
  return prettyJson(mcp);
}

/** .gitignore with each pack server's index folder appended when it is not listed yet. */
function mergeIgnore(repo: string, stations: Stations): string {
  const file = join(repo, '.gitignore');
  const text = existsSync(file) ? readText(file) : '';
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const missing = stations.claude.mcp.map((m) => m.ignore).filter((i) => !lines.includes(i));
  if (missing.length === 0) return text;
  const sep = text === '' || text.endsWith('\n') ? '' : '\n';
  return `${text}${sep}# MCP server indexes, rebuilt per session by .claude/hooks (hookset)\n${missing.join('\n')}\n`;
}

/**
 * JSON as Prettier prints it, so a repo whose format gate covers .claude/ stays green after
 * `hookset init`: an array of primitives that fits in 80 columns goes on one line. Without this,
 * four repos failed their format check on the 1.5.0 rollout (2026-11-26).
 */
const PRINT_WIDTH = 80; // Prettier's default
const SCALAR_ITEM = /^(?:"(?:[^"\\]|\\.)*"|-?\d[\d.eE+-]*|true|false|null),?$/;

export function prettyJson(value: unknown): string {
  const lines = JSON.stringify(value, undefined, 2).split('\n');
  const out: string[] = [];
  let skipTo = 0;
  for (const [i, open] of lines.entries()) {
    if (i < skipTo) continue;
    // An array always ends on its own line, so `rest` holds its items and then its `]`.
    const rest = open.endsWith('[') ? lines.slice(i + 1).map((l) => l.trim()) : [];
    const count = rest.findIndex((l) => !SCALAR_ITEM.test(l));
    const items = rest.slice(0, count).map((l) => l.replace(/,$/, ''));
    const line = `${open}${items.join(', ')}${rest[count]}`;
    if (items.length > 0 && rest[count]?.startsWith(']') && line.length <= PRINT_WIDTH) {
      out.push(line);
      skipTo = i + count + 2;
    } else out.push(open);
  }
  return `${out.join('\n')}\n`;
}

const union = (a: string[] | undefined, b: string[]): string[] => [...new Set([...(a ?? []), ...b])];

function mergeSettings(repo: string, stations: Stations): string {
  const file = join(repo, '.claude', 'settings.json');
  const settings: Settings = existsSync(file)
    ? (JSON.parse(readText(file)) as Settings)
    : { $schema: 'https://json.schemastore.org/claude-code-settings.json' };
  const events = new Map(Object.entries(settings.hooks ?? {}));
  for (const h of expectedClaudeHooks(stations)) {
    const groups = events.get(h.event) ?? [];
    events.set(h.event, groups);
    const entry = { type: 'command', command: hookCommand(h.file), timeout: h.timeout };
    // Stryker disable next-line StringLiteral: equivalent, no pack hook has an empty matcher
    const wired = groups.filter((g) => (g.matcher ?? '') === h.matcher).flatMap((g) => g.hooks).find((c) => c.command.includes(`.claude/hooks/${h.file}`));
    // An entry wired before the pack set a timeout gets one; a repo's own timeout stays.
    if (wired) {
      if (wired.timeout === undefined) wired.timeout = h.timeout;
      continue;
    }
    // Stryker disable next-line StringLiteral: equivalent, as above
    const group = groups.find((g) => (g.matcher ?? '') === h.matcher);
    if (group) group.hooks.push(entry);
    else groups.push({ matcher: h.matcher, hooks: [entry] });
  }
  settings.hooks = Object.fromEntries(events);
  settings.enabledMcpjsonServers = union(settings.enabledMcpjsonServers, stations.claude.mcp.map((m) => m.id));
  settings.permissions = { ...settings.permissions, allow: union(settings.permissions?.allow, stations.claude.mcp.flatMap((m) => m.allow)) };
  return prettyJson(settings);
}

/** `1 error, 2 warnings`: every problem the lines below list, counted by severity; a severity with none is left out. */
function tally(problems: Problem[]): string {
  const counts: string[] = [];
  for (const severity of ['error', 'warning'] as const) {
    const n = problems.filter((p) => p.severity === severity).length;
    const plural = n === 1 ? '' : 's';
    if (n > 0) counts.push(`${String(n)} ${severity}${plural}`);
  }
  return counts.join(', ');
}

/** The text a person reads for a check result. */
export function checkText(result: CheckResult): string {
  const lines = result.problems.map((p) => `${p.severity === 'error' ? '✗' : '!'} ${p.message}\n  fix: ${p.fix}`);
  const head = result.ok ? `hookset: ok (${result.pinned ?? 'unpinned'})` : `hookset: ${tally(result.problems)}`;
  return [head, ...lines].join('\n');
}
