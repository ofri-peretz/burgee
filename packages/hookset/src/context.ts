/**
 * The always-loaded context budget: what Claude Code reads into every session in a repo before
 * any work starts. That is CLAUDE.md plus its `@`-imports, plus the name and description of every
 * skill, command and subagent under .claude/, except a skill or command marked
 * `disable-model-invocation: true`, whose description stays out until someone types its command,
 * plus what each MCP server in .mcp.json sends (instructions and tool definitions). A server's text
 * is only known by running it, so a pack server counts the size stations.json records for it, and
 * any other server is listed as unmeasured.
 *
 * Tokens are estimated as characters / 4. The ceiling is `context.tokens` in .claude/hookset.json
 * and may only go down: `hookset context --update` lowers it and refuses to raise it.
 *
 * Builtins only and erasable syntax only, like core.ts. The workflow runs this file straight from
 * the tag with Node's type stripping, where `./core.js` does not exist: so it imports nothing
 * relative and reads stations.json itself.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The part of stations.json (core.ts `Stations`) this file reads. */
interface Stations {
  claude: { mcp: { id: string; contextChars: number }[] };
}

/** The package directory, one up from this file in src/ or dist/. */
const packageRoot = (): string => fileURLToPath(new URL('..', import.meta.url));
const loadStations = (pkg: string): Stations => JSON.parse(readFileSync(join(pkg, 'stations.json')).toString()) as Stations;

export interface ContextEntry {
  file: string;
  chars: number;
  userOnly: boolean;
}

export interface ContextMeasure {
  tokens: number;
  memoryFiles: string[];
  memoryChars: number;
  entries: ContextEntry[];
  /** MCP servers in .mcp.json whose size is not recorded: they load text this measure cannot see. */
  unmeasured: string[];
}

export interface ContextResult extends ContextMeasure {
  ok: boolean;
  ceiling: number | undefined;
  updated: boolean;
  error?: string;
  fix?: string;
}

const CHARS_PER_TOKEN = 4;
const LARGEST_SHOWN = 5;
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;
const USER_ONLY = /^disable-model-invocation:[ \t]*true[ \t]*$/m;
const LISTED_KEYS: ReadonlyArray<readonly [string, RegExp]> = [
  ['name', /^name:[ \t]*(.*(?:\n[ \t].*)*)/m],
  ['description', /^description:[ \t]*(.*(?:\n[ \t].*)*)/m],
];

export const tokensOf = (chars: number): number => Math.round(chars / CHARS_PER_TOKEN);

// Paths stay POSIX so the measure reads the same on Windows.
function memory(repo: string): { chars: number; files: string[] } {
  const files: string[] = [];
  let chars = 0;
  const load = (file: string): void => {
    if (files.includes(file) || !existsSync(join(repo, file))) return;
    files.push(file);
    const text = String(readFileSync(join(repo, file)));
    chars += text.length;
    for (const match of text.matchAll(/^@(\S+)/gm)) load(posix.normalize(posix.join(posix.dirname(file), match[1] as string)));
  };
  load('CLAUDE.md');
  return { chars, files };
}

function listed(repo: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, suffix: string): void => {
    if (!existsSync(join(repo, dir))) return;
    for (const entry of readdirSync(join(repo, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel, suffix);
      else if (rel.endsWith(suffix)) out.push(rel);
    }
  };
  walk('.claude/skills', '/SKILL.md');
  walk('.claude/commands', '.md');
  walk('.claude/agents', '.md');
  return out.sort();
}

function entryOf(repo: string, file: string): ContextEntry {
  const text = String(readFileSync(join(repo, file)));
  // Stryker disable next-line StringLiteral,NumericLiteral: equivalent, no frontmatter names no key, and the whole match finds the same keys
  const fm = FRONTMATTER.exec(text)?.[1] ?? '';
  // A subagent has no user-only switch: its description is always offered to the model.
  const userOnly = !file.startsWith('.claude/agents/') && USER_ONLY.test(fm);
  let chars = 0;
  if (!userOnly) {
    for (const [key, pattern] of LISTED_KEYS) {
      const value = pattern.exec(fm)?.[1];
      if (value !== undefined) chars += `${key}: ${value}`.length;
    }
  }
  return { file, chars, userOnly };
}

/** One entry per MCP server in .mcp.json that hookset records a size for; the rest by name. */
function servers(repo: string, pkg: string): { entries: ContextEntry[]; unmeasured: string[] } {
  const file = join(repo, '.mcp.json');
  if (!existsSync(file)) return { entries: [], unmeasured: [] };
  const names = Object.keys((JSON.parse(String(readFileSync(file))) as { mcpServers?: Record<string, unknown> }).mcpServers ?? {});
  const known = new Map(loadStations(pkg).claude.mcp.map((m) => [m.id, m.contextChars]));
  const entries: ContextEntry[] = [];
  const unmeasured: string[] = [];
  for (const name of names) {
    const chars = known.get(name);
    if (chars === undefined) unmeasured.push(name);
    else entries.push({ file: `.mcp.json#${name}`, chars, userOnly: false });
  }
  return { entries, unmeasured };
}

export function measureContext(repo: string, pkg: string = packageRoot()): ContextMeasure {
  const mem = memory(repo);
  const mcp = servers(repo, pkg);
  const entries = [...listed(repo).map((file) => entryOf(repo, file)), ...mcp.entries];
  const chars = entries.reduce((sum, entry) => sum + entry.chars, mem.chars);
  return {
    tokens: tokensOf(chars),
    memoryFiles: mem.files,
    memoryChars: mem.chars,
    entries,
    unmeasured: mcp.unmeasured,
  };
}

function readConfig(repo: string): Record<string, unknown> {
  const path = join(repo, '.claude', 'hookset.json');
  return existsSync(path) ? (JSON.parse(String(readFileSync(path))) as Record<string, unknown>) : {};
}

function ceilingOf(config: Record<string, unknown>): number | undefined {
  const tokens = (config['context'] as { tokens?: unknown } | null | undefined)?.tokens;
  return typeof tokens === 'number' ? tokens : undefined;
}

export function checkContext(repo: string, options: { update?: boolean } = {}): ContextResult {
  const measured = measureContext(repo);
  const config = readConfig(repo);
  const ceiling = ceilingOf(config);
  const fail = (error: string, fix: string): ContextResult => ({
    ...measured,
    ok: false,
    ceiling,
    updated: false,
    error,
    fix,
  });
  if (options.update === true) {
    if (measured.tokens > (ceiling ?? Infinity)) {
      return fail(
        `${measured.tokens} tokens is over the ceiling of ${ceiling}; --update only lowers it`,
        'cut what was added, or raise context.tokens in .claude/hookset.json by decision',
      );
    }
    const next = { ...config, context: { tokens: measured.tokens } };
    mkdirSync(join(repo, '.claude'), { recursive: true });
    writeFileSync(join(repo, '.claude', 'hookset.json'), `${JSON.stringify(next, undefined, 2)}\n`);
    return { ...measured, ok: true, ceiling: measured.tokens, updated: true };
  }
  if (ceiling === undefined) {
    return fail('no context ceiling in .claude/hookset.json', 'run `hookset context --update` to set it at the current size');
  }
  if (measured.tokens > ceiling) {
    return fail(
      `always-loaded context is ${measured.tokens} tokens, over the ceiling of ${ceiling}`,
      'shorten what you added, move a rule into a check, or mark a skill the model should never start itself `disable-model-invocation: true`',
    );
  }
  return { ...measured, ok: true, ceiling, updated: false };
}

export function contextText(result: ContextResult): string {
  if (result.error !== undefined) {
    const top = result.entries
      .filter((e) => e.chars > 0)
      .sort((a, b) => b.chars - a.chars)
      .slice(0, LARGEST_SHOWN)
      .map((e) => `    ${tokensOf(e.chars)}  ${e.file}`);
    return [
      `✖ ${result.error}`,
      `  CLAUDE.md and imports: ${tokensOf(result.memoryChars)} tokens (${result.memoryFiles.join(', ') || 'none'})`,
      ...(top.length > 0 ? ['  largest descriptions:', ...top] : []),
      `  fix: ${result.fix as string}`,
    ].join('\n');
  }
  if (result.updated) return `ceiling set to ${result.tokens} tokens`;
  const ceiling = result.ceiling as number;
  const unmeasured = result.unmeasured.length > 0 ? ` + MCP servers not measured: ${result.unmeasured.join(', ')}` : '';
  const line = `✔ always-loaded context: ${result.tokens} tokens${unmeasured} (ceiling ${ceiling})`;
  return result.tokens < ceiling ? `${line}\n  below the ceiling: run \`hookset context --update\` to lock in the cut` : line;
}
