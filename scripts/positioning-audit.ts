/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The positioning audit — how each front page opens, how often it names an incumbent, and how
 * far down each capability no incumbent has first appears.
 *
 * `.sdlc/intents/positioning/` exists because the pages read like the incumbents': the root
 * README's second sentence defined burgee by commander and yargs, and the package READMEs named
 * an incumbent every few dozen words. This is the measurement that intent is held to, written
 * so it can be re-run rather than re-counted by hand (`.sdlc/research/positioning-audit.md`
 * records the readings).
 *
 * The incumbents are not typed here. They are every host `compat.ts` grades (`GRADED`) and every
 * specifier `burgee migrate` rewrites (`DROP_INS`) — the same list the migration acts on — so a
 * drop-in added to the family is an incumbent here the day it is graded. `which` and `rc` are
 * English before they are packages, so they count only as code (`` `which` ``).
 *
 *   npx tsx scripts/positioning-audit.ts          # the table, as Markdown
 *   npx tsx scripts/positioning-audit.ts --json   # the same rows as data
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// eslint-disable-next-line import-next/no-relative-packages -- by path, for the same reason as migrate-drop-ins-lock.test.ts: `compat.ts` is not an export
import { DROP_INS, GRADED } from '../packages/burgee/src/compat.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES = join(ROOT, 'packages');

/** The hand-written front door of the docs site; the package sites' landings are projected from their READMEs. */
export const DOCS_LANDING = 'apps/docs/content/docs/index.mdx';

/** Names that are ordinary words in prose, so they count only when written as code. */
const CODE_ONLY = new Set(['which', 'rc']);

/** `yargs/helpers` → `yargs`, `@clack/prompts` stays scoped, `dotenv/config.js` → `dotenv`. */
const packageOf = (specifier: string): string => specifier.split('/').slice(0, specifier.startsWith('@') ? 2 : 1).join('/');

/**
 * Every incumbent the family replaces: the graded hosts, each drop-in's package, and the scope
 * of a scoped one (`clack` for `@clack/prompts`, `inquirer` for `@inquirer/core`), since prose
 * names the project rather than the package.
 */
export function incumbents(): string[] {
  const names = new Set<string>(Object.keys(GRADED));
  for (const { from } of DROP_INS) {
    const pkg = packageOf(from);
    names.add(pkg);
    if (pkg.startsWith('@')) names.add(pkg.slice(1, pkg.indexOf('/')));
  }
  return [...names].sort();
}

/**
 * One incumbent as a pattern: a whole name, case-insensitive, or code-only for an English word.
 * The name is escaped where the pattern is built; every name is a package name from `compat.ts`.
 */
function pattern(name: string): RegExp {
  const literal = name.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
  const source = CODE_ONLY.has(name) ? `\`${literal}\`` : String.raw`(?<![\w@-])${literal}(?![\w-])`;
  // eslint-disable-next-line secure-coding/detect-non-literal-regexp -- `literal` is a package name from compat.ts, escaped on the line above
  return new RegExp(source, 'giu');
}

/** Every incumbent `text` names, each once, in the order of the list. */
export function named(text: string, names: readonly string[] = incumbents()): string[] {
  return names.filter((name) => pattern(name).test(text));
}

/** How many times `text` names any incumbent. */
export function mentions(text: string, names: readonly string[] = incumbents()): number {
  return names.reduce((sum, name) => sum + (text.match(pattern(name))?.length ?? 0), 0);
}

/** A block's text with HTML tags, images and Markdown link targets removed. */
function plain(block: string): string {
  return block
    .replaceAll(/<\/?(?:strong|em|b|i|code)>|\*\*/gu, '')
    .replaceAll(/!\[[^\]]*\]\([^)]*\)/gu, '')
    .replaceAll(/\[([^\]]*)\]\([^)]*\)/gu, '$1')
    .replaceAll(/<[^>]+>/gu, ' ')
    .replaceAll(/&nbsp;/gu, ' ')
    .replaceAll(/\s+/gu, ' ')
    .trim();
}

/** What is left of a block once every link, image and tag is gone — a badge row or a nav row leaves almost nothing. */
const prose = (block: string): string =>
  block
    .replaceAll(/<a\b[^>]*>[\s\S]*?<\/a>/gu, '')
    .replaceAll(/!?\[[^\]]*\]\([^)]*\)/gu, '')
    .replaceAll(/<[^>]+>/gu, ' ')
    .replaceAll(/&nbsp;|[·|]/gu, ' ')
    .replaceAll(/\s+/gu, ' ')
    .trim();

/** Fewer words than this outside links, and a block is chrome — badges, a nav row, a `Docs:` line — not a paragraph. */
const MIN_PROSE_WORDS = 4;

/** The page's blocks: a `<p>…</p>` element whole, otherwise a run of lines up to a blank one. Front matter is dropped. */
export function blocks(text: string): string[] {
  const lines = text.replace(/^---\n[\s\S]*?\n---\n/u, '').split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i]!.trim() === '') {
      i += 1;
      continue;
    }
    const start = i;
    if (lines[i]!.trim().startsWith('<p')) {
      while (i < lines.length && !lines[i]!.includes('</p>')) i += 1;
    } else {
      while (i + 1 < lines.length && lines[i + 1]!.trim() !== '') i += 1;
    }
    i += 1;
    out.push(lines.slice(start, i).join('\n'));
  }
  return out;
}

/** A block that opens a section rather than saying anything: a heading, a rule, a fence, a table, a quote. */
const structural = (block: string): boolean => /^(?:#|---|```|\||>|<!--|\{\/\*)/u.test(block.trim());

/**
 * The first paragraph after the hero — the lockup, the tagline, the badge rows and the docs line
 * every README carries, or a page's front matter. `undefined` when the page has none, which a
 * caller should treat as a defect: a check that finds no paragraph checks nothing.
 *
 * The tagline is the first centred `<p>` that is prose; everything after it that is chrome is
 * still hero. A page with no centred tagline (an `.mdx` page) has no hero beyond its front matter.
 */
export function firstParagraph(text: string): string | undefined {
  const found = firstBlock(text);
  return found === undefined ? undefined : plain(found);
}

/** The same paragraph as it is written, so a caller can find where the body starts. */
const centred = (block: string): boolean => /^<p\b[^>]*align="center"/u.test(block.trim());

function firstBlock(text: string): string | undefined {
  const all = blocks(text);
  const taglineAt = all.findIndex((b) => centred(b) && prose(b).split(' ').length >= MIN_PROSE_WORDS);
  const from = taglineAt === -1 ? 0 : taglineAt + 1;
  return all.slice(from).find((b) => !structural(b) && prose(b).split(' ').length >= MIN_PROSE_WORDS);
}

/** The page from its first paragraph on: what a reader reads once past the lockup and the badges. */
export function body(text: string): string {
  const first = firstBlock(text);
  return first === undefined ? text : text.slice(text.indexOf(first));
}

/** The first sentence of a paragraph. */
export const leadSentence = (paragraph: string): string => /^.*?[.!?](?=\s+[A-Z*`(\d]|$)/u.exec(paragraph)?.[0] ?? paragraph;

/** The capabilities no incumbent has, each recognised by how the pages spell it. */
export const CAPABILITIES: readonly { id: string; label: string; pattern: RegExp }[] = [
  { id: 'surfaces', label: 'one declaration served as help, --json, --schema, MCP and completions', pattern: /--schema\b|--mcp\b|one declaration/iu },
  { id: 'exit-codes', label: 'exit codes that tell an agent to rewrite the command', pattern: /rewrite the command|exit[- ]code contract/iu },
  { id: 'fix-lines', label: '`fix:` lines', pattern: /`fix:|\bfix: [a-z]/u },
  { id: 'explain', label: '`--explain` provenance', pattern: /--explain\b|(?<!npm )provenance(?! attestation)/iu },
  { id: 'static-projection', label: 'static projection', pattern: /static projection/iu },
  { id: 'plugins-as-data', label: 'plugins as data (`schema.json` + `check`)', pattern: /schema\.json|plugins? (?:are|as) data|npx [\w-]+ check\b/iu },
  { id: 'zero-deps', label: 'no dependency outside the family', pattern: /(?:no|zero) (?:runtime )?dependenc(?:y|ies) outside|dependency outside the (?:burgee )?family|zero (?:runtime )?dependencies/iu },
  { id: 'own-suite', label: "proof by the incumbent's own test suite", pattern: /own (?:test )?suite|own tests|graded by/iu },
];

const words = (text: string): number => text.split(/\s+/u).filter(Boolean).length;

/** The 1-based word at which `re` first matches `text`, or `undefined`. */
function wordAt(text: string, re: RegExp): number | undefined {
  // `search` ignores `g` and `lastIndex`, so a shared global pattern always reads from the start.
  const at = text.search(re);
  return at === -1 ? undefined : words(text.slice(0, at)) + 1;
}

/** The first word at which any incumbent is named. */
function firstIncumbent(text: string, names: readonly string[]): number | undefined {
  const at = names.map((name) => wordAt(text, pattern(name))).filter((n): n is number => n !== undefined);
  return at.length === 0 ? undefined : Math.min(...at);
}

export interface Row {
  page: string;
  words: number;
  mentions: number;
  /** Incumbent mentions per hundred words, to one decimal. */
  per100: number;
  lead: string;
  /** Incumbents the first paragraph after the hero names. */
  leadNames: string[];
  /** The word of the body — the page from its first paragraph on — at which an incumbent is first named. */
  firstIncumbent: number | undefined;
  /** Capability id → the word of the body it first appears at. */
  capabilities: Record<string, number | undefined>;
}

const PER = 100;
const ONE_DECIMAL = 10;

/** One page's reading. */
export function audit(page: string, text: string, names: readonly string[] = incumbents()): Row {
  const total = words(text);
  const count = mentions(text, names);
  const first = firstParagraph(text) ?? '';
  const after = body(text);
  return {
    page,
    words: total,
    mentions: count,
    per100: Math.round((count * PER * ONE_DECIMAL) / total) / ONE_DECIMAL,
    lead: leadSentence(first),
    leadNames: named(first, names),
    firstIncumbent: firstIncumbent(after, names),
    capabilities: Object.fromEntries(CAPABILITIES.map((c) => [c.id, wordAt(after, c.pattern)])),
  };
}

/** Published packages with a README — `compat-oracle` is internal and ships to nobody. */
export function packageReadmes(): string[] {
  return readdirSync(PACKAGES)
    .filter((name) => existsSync(join(PACKAGES, name, 'README.md')) && existsSync(join(PACKAGES, name, 'package.json')))
    .filter((name) => (JSON.parse(readFileSync(join(PACKAGES, name, 'package.json'), 'utf8')) as { private?: boolean }).private !== true)
    .map((name) => `packages/${name}/README.md`)
    .sort();
}

/** Every page the audit reads: the root README, each published package README, the docs landing. */
export const pages = (): string[] => ['README.md', ...packageReadmes(), DOCS_LANDING];

const cell = (n: number | undefined): string => (n === undefined ? '—' : String(n));

function table(rows: readonly Row[]): string {
  const head = ['| Page | Words | Incumbent mentions | per 100 words | First incumbent at body word | First paragraph names |', '| :-- | --: | --: | --: | --: | :-- |'];
  const body = rows.map((r) => `| \`${r.page}\` | ${String(r.words)} | ${String(r.mentions)} | ${r.per100.toFixed(1)} | ${cell(r.firstIncumbent)} | ${r.leadNames.length === 0 ? 'none' : r.leadNames.join(', ')} |`);
  const capHead = [`| Page | ${CAPABILITIES.map((c) => c.id).join(' | ')} |`, `| :-- |${CAPABILITIES.map(() => ' --: |').join('')}`];
  const capBody = rows.map((r) => `| \`${r.page}\` | ${CAPABILITIES.map((c) => cell(r.capabilities[c.id])).join(' | ')} |`);
  const leads = rows.map((r) => `- \`${r.page}\`: ${r.lead}`);
  return [...head, ...body, '', ...capHead, ...capBody, '', ...leads].join('\n');
}

if (process.argv[1]?.endsWith('positioning-audit.ts') === true) {
  const names = incumbents();
  const rows = pages().map((page) => audit(page, readFileSync(join(ROOT, page), 'utf8'), names));
  console.log(process.argv.includes('--json') ? JSON.stringify(rows, undefined, 2) : table(rows));
}
