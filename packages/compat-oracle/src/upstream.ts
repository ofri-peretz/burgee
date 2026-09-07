/**
 * The compatibility record and its diff.
 *
 * `vendor/<host>/.source.json` says exactly which upstream *release* the suite came from
 * — npm version, git tag, commit — and fingerprints it: a hash per test file, the test
 * names per file, and the names on the host's public API surface. Two records diff into
 * the precise list of what a new release added, removed or changed, so "commander 15.1.0
 * is out" arrives as work items, not as a number that moved.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { type Host } from './hosts.js';

export interface CompatRecord {
  repo: string;
  /** The npm release vendored. */
  version: string;
  /** Its git tag, or null when the release had no tag and HEAD was used. */
  tag: string | null;
  commit: string;
  vendored: string;
  files: number;
  internalFiles: string[];
  internals: string[];
  /** sha256 of each upstream test file (before the specifier rewrite) and surface file. */
  hashes: Record<string, string>;
  /** Test names per test file, as written. */
  tests: Record<string, string[]>;
  /** Exported names and `Class.method` names per surface file. */
  surface: Record<string, string[]>;
}

export interface RecordDiff {
  files: { added: string[]; removed: string[]; changed: string[] };
  tests: { added: string[]; removed: string[] };
  surface: { added: string[]; removed: string[] };
}

export const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

const TEST_OPENER = /\b(?:test|it|describe)\(\s*(['"`])/g;

/** The string literal starting at `from`, up to its unescaped closing `quote`, escapes kept as written. */
function literalAt(source: string, from: number, quote: string): string {
  let out = '';
  for (let i = from; i < source.length && source[i] !== quote; i++) {
    const ch = source[i] ?? '';
    if (ch === '\\') {
      out += ch + (source[i + 1] ?? '');
      i++;
    } else {
      out += ch;
    }
  }
  return out;
}

/** Every `test('…')`, `it('…')` and `describe('…')` title in a file, in order. */
export function testNames(source: string): string[] {
  const names: string[] = [];
  for (const m of source.matchAll(TEST_OPENER)) {
    const quote = m[1];
    const start = m.index;
    if (quote === undefined || start === undefined) continue;
    names.push(literalAt(source, start + m[0].length, quote));
  }
  return names;
}

const CLASS = /^(?:export\s+)?(?:declare\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/;
const MEMBER = /^ {2}(?:(?:public|protected|private|static|readonly|async|get|set|override) )*([A-Za-z_$][\w$]*)(?:<[^>]*>)?\(/;
const TOP = /^export\s+(?:declare\s+)?(?:const|function|class|interface|type|enum|let|var)\s+([A-Za-z_$][\w$]*)/;

/**
 * The names on a public surface file: top-level exports and `Class.method` for every
 * method of every class. A textual read, not a type-checker's — it exists to tell two
 * releases apart, and a renamed or added method is exactly what changes between them.
 */
export function surfaceNames(source: string): string[] {
  const names = new Set<string>();
  let cls: string | null = null;
  for (const line of source.split('\n')) {
    const opened = firstGroup(CLASS, line);
    if (opened !== undefined) {
      cls = opened;
      names.add(opened);
      continue;
    }
    if (line.startsWith('}')) {
      cls = null;
      continue;
    }
    const exported = firstGroup(TOP, line);
    if (exported !== undefined) names.add(exported);
    const member = cls === null ? undefined : firstGroup(MEMBER, line);
    if (member !== undefined && member !== 'constructor') names.add(`${cls}.${member}`);
  }
  return [...names].sort();
}

function firstGroup(pattern: RegExp, line: string): string | undefined {
  const group = pattern.exec(line)?.[1];
  return group === undefined || group === '' ? undefined : group;
}

export interface SnapshotMeta {
  version: string;
  tag: string | null;
  commit: string;
  vendored: string;
  files: number;
  internalFiles: string[];
  internals: string[];
}

const TEST_FILE = /\.(m?js|cjs|ts)$/;

/** Fingerprint an upstream checkout: test files and the host's surface files. */
export function snapshot(clone: string, host: Host, meta: SnapshotMeta): CompatRecord {
  const hashes = new Map<string, string>();
  const tests = new Map<string, string[]>();
  const surface = new Map<string, string[]>();
  const testDir = join(clone, host.testDir);
  for (const name of readdirSync(testDir).filter((f) => TEST_FILE.test(f)).sort()) {
    const source = readFileSync(join(testDir, name), 'utf8');
    const rel = `${host.testDir}/${name}`;
    hashes.set(rel, sha256(source));
    tests.set(rel, testNames(source));
  }
  for (const rel of host.surfaceFiles ?? []) {
    const at = join(clone, rel);
    if (!existsSync(at)) continue;
    const source = readFileSync(at, 'utf8');
    hashes.set(rel, sha256(source));
    surface.set(rel, surfaceNames(source));
  }
  return { repo: host.repo, ...meta, hashes: Object.fromEntries(hashes), tests: Object.fromEntries(tests), surface: Object.fromEntries(surface) };
}

const flat = (byFile: Record<string, string[]>): Set<string> =>
  new Set(Object.entries(byFile).flatMap(([file, names]) => names.map((n) => `${file} :: ${n}`)));
const minus = (a: Set<string>, b: Set<string>): string[] => [...a].filter((x) => !b.has(x)).sort();

export function diffRecords(before: CompatRecord, after: CompatRecord): RecordDiff {
  const beforeFiles = new Set(Object.keys(before.hashes));
  const afterFiles = new Set(Object.keys(after.hashes));
  const changed = [...afterFiles].filter((f) => beforeFiles.has(f) && before.hashes[f] !== after.hashes[f]).sort();
  const beforeTests = flat(before.tests);
  const afterTests = flat(after.tests);
  const beforeSurface = flat(before.surface);
  const afterSurface = flat(after.surface);
  return {
    files: { added: minus(afterFiles, beforeFiles), removed: minus(beforeFiles, afterFiles), changed },
    tests: { added: minus(afterTests, beforeTests), removed: minus(beforeTests, afterTests) },
    surface: { added: minus(afterSurface, beforeSurface), removed: minus(beforeSurface, afterSurface) },
  };
}

export const isEmptyDiff = (d: RecordDiff): boolean =>
  [d.files.added, d.files.removed, d.files.changed, d.tests.added, d.tests.removed, d.surface.added, d.surface.removed].every(
    (l) => l.length === 0,
  );

const SHORT_SHA = 8;
/** A fenced block, because upstream test titles contain backticks and would break inline code. */
const list = (title: string, items: string[]): string =>
  items.length === 0 ? '' : `\n### ${title} (${items.length})\n\n\`\`\`text\n${items.join('\n')}\n\`\`\`\n`;

/** The issue / PR body: what moved between two releases, as work items. */
export function renderDiff(host: string, before: CompatRecord, after: CompatRecord, diff: RecordDiff): string {
  const head = `## ${host}: ${before.version} → ${after.version}\n\n| | vendored | upstream |\n| :-- | :-- | :-- |\n| version | ${before.version} | ${after.version} |\n| tag | ${before.tag ?? '—'} | ${after.tag ?? '—'} |\n| commit | \`${before.commit.slice(0, SHORT_SHA)}\` | \`${after.commit.slice(0, SHORT_SHA)}\` |\n| test names | ${flat(before.tests).size} | ${flat(after.tests).size} |\n| surface names | ${flat(before.surface).size} | ${flat(after.surface).size} |\n`;
  if (isEmptyDiff(diff)) return `${head}\nNo test or surface changes: the release is a re-tag of what is vendored.\n`;
  return (
    `${head}${list('Surface names added', diff.surface.added)}${list('Surface names removed', diff.surface.removed)}${list('Tests added', diff.tests.added)}${list('Tests removed', diff.tests.removed)}${list('Test files added', diff.files.added)}${list('Test files removed', diff.files.removed)}${list('Files changed', diff.files.changed)}\nNext: \`npm run compat -- --vendor\` re-vendors at ${after.tag ?? after.commit.slice(0, SHORT_SHA)}; the control line re-proves the gate; the burgee line shows what the release costs.\n`
  );
}

/** The newest release on npm. */
export function latestVersion(pkg: string): string {
  return execFileSync('npm', ['view', pkg, 'version'], { encoding: 'utf8' }).trim();
}

export function readRecord(hostDir: string): CompatRecord | undefined {
  const at = join(hostDir, '.source.json');
  if (!existsSync(at)) return undefined;
  const parsed = JSON.parse(readFileSync(at, 'utf8')) as Partial<CompatRecord>;
  // Records written before fingerprints existed diff as "everything added" — once, honestly.
  return { hashes: {}, tests: {}, surface: {}, version: "^0.0.0", tag: null, ...parsed } as CompatRecord;
}
