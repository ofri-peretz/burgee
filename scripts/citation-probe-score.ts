/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Scoring for the AI citation probe (roadmap `marketing-and-docs` 2.4): pure functions, no
 * network, no clock. `citation-probe.ts` asks the questions; this file decides what an
 * answer means.
 *
 * Two questions per answer:
 *
 *   - **named**: does the answer name burgee, or present a family package as the answer?
 *     `burgee` counts anywhere as a whole word. The family names are also English words
 *     (`seniority`, `closeout`, `flagstaff`), so a family package counts only where the
 *     answer uses it *as a package*: a code span, an install command, an import specifier,
 *     a bold list entry, or "`<name>` package / library / module". "Seniority matters" is
 *     not a recommendation.
 *   - **ours**: which of the cited URLs are ours — `*.interlace.tools`, `ofriperetz.dev`,
 *     `github.com/ofri-peretz/burgee`, or an npm page of burgee or a family package.
 *
 * Every regex here is a literal: the repo's security lint rejects runtime-built ones, so
 * the family names are matched by capturing a candidate token with a generic pattern and
 * looking it up in `FAMILY_PACKAGES`.
 */

export const BURGEE = 'burgee';

/** The family packages that count when an answer presents one as the answer. */
export const FAMILY_PACKAGES = ['roundel', 'flagstaff', 'caique', 'linegauge', 'seniority', 'bellpull', 'closeout', 'paratext'] as const;

const FAMILY: ReadonlySet<string> = new Set(FAMILY_PACKAGES);
const NPM_PACKAGES: ReadonlySet<string> = new Set([BURGEE, ...FAMILY_PACKAGES]);

/** Characters of context kept either side of the first mention. */
const EXCERPT_RADIUS = 120;

/** `burgee` as a whole word: `burgee's` and `burgee-cli` count, `burgeeing` does not. */
const BURGEE_WORD = /\bburgee\b/i;

/**
 * Where a word is being used as a package name. Each captures the candidate in group 1;
 * a candidate that is not a family package is ignored.
 */
const PACKAGE_CONTEXTS: readonly RegExp[] = [
  // A code span, version suffix allowed.
  /`([^`\s]+)`/g,
  // A bold list entry, as answers format a recommendation.
  /\*\*([^*\n]+)\*\*/g,
  // The specifier of an ES import, with or without bindings.
  /\b(?:from|import)\s+['"]([^'"\n]+)['"]/g,
  // The specifier of a CommonJS require.
  /\brequire\(\s*['"]([^'"\n]+)['"]/g,
  // A word followed by "package", "library" or "module".
  /\b([a-z]+)\s+(?:package|library|module)\b/gi,
];

/** `npm install -D roundel linegauge`: everything after the command, split on whitespace. */
const INSTALL_COMMAND = /\b(?:npm\s+(?:i|install|add)|pnpm\s+(?:add|install)|yarn\s+add|bun\s+add)\s([^\n`]+)/gi;

/** `roundel@2.1.0` → `roundel`; `closeout,` → `closeout`. A leading `@` scope is kept. */
function packageName(token: string): string {
  const trimmed = token.trim().toLowerCase();
  const words = trimmed.split(/\s/);
  const first = words[0] ?? '';
  const unversioned = first.startsWith('@') ? first : (first.split('@')[0] ?? '');
  return unversioned.replace(/[^a-z0-9@/._-]+$/, '').replace(/^[^a-z0-9@]+/, '');
}

interface Mention {
  name: string;
  index: number;
}

function familyMentions(text: string): Mention[] {
  const found: Mention[] = [];
  for (const pattern of PACKAGE_CONTEXTS) {
    for (const m of text.matchAll(pattern)) {
      const name = packageName(m[1] ?? '');
      if (FAMILY.has(name)) found.push({ name, index: m.index });
    }
  }
  for (const m of text.matchAll(INSTALL_COMMAND)) {
    const args = (m[1] ?? '').split(/\s+/);
    for (const arg of args) {
      const name = packageName(arg);
      if (FAMILY.has(name)) found.push({ name, index: m.index });
    }
  }
  return found;
}

function excerptAround(text: string, index: number): string {
  const start = Math.max(0, index - EXCERPT_RADIUS);
  const end = Math.min(text.length, index + EXCERPT_RADIUS);
  const body = text.slice(start, end).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '…' : ''}${body}${end < text.length ? '…' : ''}`;
}

export interface NameScore {
  /** True when the answer names burgee or presents a family package as the answer. */
  named: boolean;
  /** Which of burgee and the family packages the answer names, burgee first, no repeats. */
  mentions: string[];
  /** Up to `EXCERPT_RADIUS` characters either side of the first mention; `null` when none. */
  excerpt: string | null;
}

export function scoreAnswer(text: string): NameScore {
  const all: Mention[] = [];
  const burgee = BURGEE_WORD.exec(text);
  if (burgee) all.push({ name: BURGEE, index: burgee.index });
  all.push(...familyMentions(text));
  if (all.length === 0) return { named: false, mentions: [], excerpt: null };
  const first = all.reduce((a, b) => (b.index < a.index ? b : a));
  const names = new Set(all.map((m) => m.name));
  const mentions = [BURGEE, ...FAMILY_PACKAGES].filter((n) => names.has(n));
  return { named: true, mentions, excerpt: excerptAround(text, first.index) };
}

/** A bare `http(s)://` URL, stopping at whitespace, quotes, brackets and backticks. */
const URL_IN_TEXT = /https?:\/\/[^\s<>()[\]"'`]+/g;
/** Sentence punctuation and markdown emphasis that trail a URL in prose. */
const TRAILING_PUNCTUATION = /[.,;:!?*_]+$/;

/** Every URL written in the answer text, in order, without repeats. */
export function urlsInText(text: string): string[] {
  const found = [...text.matchAll(URL_IN_TEXT)].map((m) => m[0].replace(TRAILING_PUNCTUATION, ''));
  return unique(found);
}

export function unique(urls: readonly string[]): string[] {
  return [...new Set(urls.filter((u) => u.length > 0))];
}

const OUR_HOSTS = ['interlace.tools', 'ofriperetz.dev'] as const;
const NPM_HOSTS: ReadonlySet<string> = new Set(['npmjs.com', 'www.npmjs.com']);
const GITHUB_HOSTS: ReadonlySet<string> = new Set(['github.com', 'www.github.com']);

function onHost(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/** Is `url` one of ours? Anything that does not parse as a URL is not. */
export function isOurs(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
  const host = parsed.hostname.toLowerCase();
  if (OUR_HOSTS.some((d) => onHost(host, d))) return true;
  const segments = parsed.pathname.split('/').filter((s) => s.length > 0).map((s) => s.toLowerCase());
  if (GITHUB_HOSTS.has(host)) {
    const repo = (segments[1] ?? '').replace(/\.git$/, '');
    return segments[0] === 'ofri-peretz' && repo === BURGEE;
  }
  if (NPM_HOSTS.has(host)) return segments[0] === 'package' && NPM_PACKAGES.has(segments[1] ?? '');
  return false;
}

/** The subset of `urls` that is ours, in order. */
export function ourUrls(urls: readonly string[]): string[] {
  return urls.filter((u) => isOurs(u));
}
