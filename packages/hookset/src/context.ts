/**
 * The always-loaded context budget: what Claude Code reads into every session in a repo before
 * any work starts. That is CLAUDE.md plus its `@`-imports, plus the name and description of every
 * skill, command and subagent under .claude/, except a skill or command marked
 * `disable-model-invocation: true`, whose description stays out until someone types its command.
 *
 * Tokens are estimated as characters / 4. The ceiling is `context.tokens` in .claude/hookset.json
 * and may only go down: `hookset context --update` lowers it and refuses to raise it.
 *
 * Builtins only and erasable syntax only, like core.ts.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

export interface ContextEntry {
  file: string;
  tokens: number;
  userOnly: boolean;
}

export interface ContextMeasure {
  tokens: number;
  memoryFiles: string[];
  memoryTokens: number;
  entries: ContextEntry[];
}

export interface ContextResult extends ContextMeasure {
  ok: boolean;
  ceiling: number | undefined;
  updated: boolean;
  error?: string;
  fix?: string;
}

const tokensOf = (chars: number): number => Math.round(chars / 4);

export function frontmatter(text: string): string {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  return match?.[1] ?? '';
}

export function field(fm: string, key: string): string | undefined {
  const match = new RegExp(`^${key}:[ \\t]*(.*(?:\\n[ \\t]+.*)*)`, 'm').exec(fm);
  return match?.[1];
}

export function isUserOnly(fm: string): boolean {
  return /^disable-model-invocation:\s*true\s*$/m.test(fm);
}

function memory(repo: string): { chars: number; files: string[] } {
  const seen: string[] = [];
  let chars = 0;
  const load = (file: string): void => {
    if (seen.includes(file) || !existsSync(join(repo, file))) return;
    seen.push(file);
    const text = readFileSync(join(repo, file), 'utf8');
    chars += text.length;
    for (const match of text.matchAll(/^@(\S+)/gm)) load(normalize(join(dirname(file), match[1] ?? '')));
  };
  load('CLAUDE.md');
  return { chars, files: seen };
}

function listed(repo: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, keep: (file: string) => boolean): void => {
    if (!existsSync(join(repo, dir))) return;
    for (const entry of readdirSync(join(repo, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel, keep);
      else if (keep(rel)) out.push(rel);
    }
  };
  walk('.claude/skills', (f) => f.endsWith('/SKILL.md'));
  walk('.claude/commands', (f) => f.endsWith('.md'));
  walk('.claude/agents', (f) => f.endsWith('.md'));
  return out.sort();
}

export function measureContext(repo: string): ContextMeasure {
  const mem = memory(repo);
  let chars = mem.chars;
  const entries = listed(repo).map((file): ContextEntry => {
    const fm = frontmatter(readFileSync(join(repo, file), 'utf8'));
    // A subagent has no user-only switch: its description is always offered to the model.
    const userOnly = !file.startsWith('.claude/agents/') && isUserOnly(fm);
    let own = 0;
    if (!userOnly) {
      for (const key of ['name', 'description']) {
        const value = field(fm, key);
        if (value !== undefined) own += key.length + 2 + value.length;
      }
    }
    chars += own;
    return { file, tokens: tokensOf(own), userOnly };
  });
  return { tokens: tokensOf(chars), memoryFiles: mem.files, memoryTokens: tokensOf(mem.chars), entries };
}

function readConfig(repo: string): Record<string, unknown> {
  const path = join(repo, '.claude', 'hookset.json');
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>) : {};
}

function ceilingOf(config: Record<string, unknown>): number | undefined {
  const context = config['context'];
  if (typeof context !== 'object' || context === null) return undefined;
  const tokens = (context as Record<string, unknown>)['tokens'];
  return typeof tokens === 'number' ? tokens : undefined;
}

export function checkContext(repo: string, options: { update?: boolean } = {}): ContextResult {
  const measured = measureContext(repo);
  const config = readConfig(repo);
  const ceiling = ceilingOf(config);
  if (options.update === true) {
    if (ceiling !== undefined && measured.tokens > ceiling) {
      return {
        ...measured,
        ok: false,
        ceiling,
        updated: false,
        error: `${measured.tokens} tokens is over the ceiling of ${ceiling}; --update only lowers it`,
        fix: 'cut what was added, or raise context.tokens in .claude/hookset.json by decision',
      };
    }
    const next = { ...config, context: { tokens: measured.tokens } };
    writeFileSync(join(repo, '.claude', 'hookset.json'), `${JSON.stringify(next, undefined, 2)}\n`);
    return { ...measured, ok: true, ceiling: measured.tokens, updated: true };
  }
  if (ceiling === undefined) {
    return {
      ...measured,
      ok: false,
      ceiling,
      updated: false,
      error: 'no context ceiling in .claude/hookset.json',
      fix: 'run `hookset context --update` to set it at the current size',
    };
  }
  if (measured.tokens > ceiling) {
    return {
      ...measured,
      ok: false,
      ceiling,
      updated: false,
      error: `always-loaded context is ${measured.tokens} tokens, over the ceiling of ${ceiling}`,
      fix: 'shorten what you added, move a rule into a check, or mark a skill the model should never start itself `disable-model-invocation: true`',
    };
  }
  return { ...measured, ok: true, ceiling, updated: false };
}

export function contextText(result: ContextResult): string {
  const lines: string[] = [];
  if (result.error !== undefined) {
    lines.push(`✖ ${result.error}`);
    lines.push(`  CLAUDE.md and imports: ${result.memoryTokens} tokens (${result.memoryFiles.join(', ') || 'none'})`);
    const top = [...result.entries].sort((a, b) => b.tokens - a.tokens).slice(0, 5).filter((e) => e.tokens > 0);
    if (top.length) lines.push('  largest descriptions:', ...top.map((e) => `    ${e.tokens}  ${e.file}`));
    lines.push(`  fix: ${result.fix ?? ''}`);
    return lines.join('\n');
  }
  if (result.updated) return `ceiling set to ${result.tokens} tokens`;
  lines.push(`✔ always-loaded context: ${result.tokens} tokens (ceiling ${result.ceiling ?? 'none'})`);
  if (result.ceiling !== undefined && result.tokens < result.ceiling) lines.push('  below the ceiling: run `hookset context --update` to lock in the cut');
  return lines.join('\n');
}
