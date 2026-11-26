/**
 * Every package a pull request ships a change to is named in one of its changesets. A gate that
 * asks only "is there a changeset?" passes a PR whose one changeset names another package, and a
 * reviewer then writes the miss by hand: `replz mine` found it in four burgee PRs (#1839, #1854,
 * #1861, #1870). This answers it per package.
 *
 * A package ships what a consumer installs: a file under its source folder that is not a test, a
 * fixture or a snapshot, or its package.json, unless the only change there is `devDependencies`.
 * A test-only change needs no changeset. A package changesets ignores (`ignore` in
 * .changeset/config.json, or any private package when `privatePackages.version` is false) needs
 * none either.
 *
 * Builtins only and erasable syntax only, like core.ts: the reusable `changeset-gate` workflow
 * imports this file from a sparse checkout with no install and no build. The caller reads git and
 * passes what changed, so nothing here spawns a process.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The files that can need a changeset, as the gate's `paths` input names them. */
export const DEFAULT_PATHS = String.raw`^packages/[^/]+/(src|package\.json)`;

/** A test, a fixture or a snapshot: a consumer installs none of them. */
const TEST = /\/__(?:tests|fixtures|mocks)__\/|\.(?:test|spec)\.[cm]?[jt]sx?$|\.snap$/u;

const BUMPS: ReadonlySet<string> = new Set(['major', 'minor', 'patch', 'none']);

/** A YAML key without its quotes; a quote left open leaves no name. */
const unquoted = (key: string): string | undefined => {
  const quote = key[0];
  if (quote !== '"' && quote !== "'") return key;
  return key.endsWith(quote) ? key.slice(1, -1) : undefined;
};

/** The name one `name: bump` line of a changeset's front matter releases, the name quoted or bare. */
const releaseOf = (line: string): string | undefined => {
  const colon = line.lastIndexOf(':');
  if (!BUMPS.has(line.slice(colon + 1).trim())) return undefined;
  const name = unquoted(line.slice(0, colon).trim());
  // Stryker disable next-line ConditionalExpression: equivalent, the pattern tests undefined as "undefined" and returns the same undefined
  return name === undefined || name === '' || /["'\s]/u.test(name) ? undefined : name;
};

/** The package names a changeset's front matter releases. */
export const releasesOf = (text: string): string[] => {
  const lines = text.replace(/\r\n/gu, '\n').split('\n');
  // Stryker disable next-line OptionalChaining: equivalent, split always returns at least one line
  if (lines[0]?.trim() !== '---') return [];
  const end = lines.indexOf('---', 1);
  if (end === -1) return [];
  // Stryker disable next-line NumericLiteral: equivalent, line 0 is the opening `---`, which releases nothing
  return lines.slice(1, end).flatMap((line) => releaseOf(line) ?? []);
};

/** A changeset file: a markdown file directly under .changeset/, other than its README. */
export const isChangeset = (path: string): boolean => /^\.changeset\/[^/]+\.md$/u.test(path) && path.toLowerCase() !== '.changeset/readme.md';

/** A manifest whose only change is `devDependencies`, given its text at the base and at the head. */
export const devOnly = (base: string | undefined, head: string | undefined): boolean => {
  // Stryker disable next-line ConditionalExpression,LogicalOperator: equivalent, JSON.parse throws on undefined and the catch answers false
  if (base === undefined || head === undefined) return false;
  try {
    const [a, b] = [base, head].map((text) => {
      const { devDependencies: _dev, ...rest } = JSON.parse(text) as Record<string, unknown>;
      return JSON.stringify(rest);
    });
    return a === b;
  } catch {
    return false;
  }
};

interface Config {
  readonly ignore: readonly string[];
  readonly privateVersioned: boolean;
}

/** A JSON file's value, or `undefined` when it is missing or is not JSON. */
const readJson = (file: string): Record<string, unknown> | undefined => {
  // Stryker disable next-line StringLiteral,BlockStatement: equivalent, JSON.parse reads a Buffer as its text, and an empty catch also returns undefined
  try { return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>; } catch { return undefined; }
};

const configOf = (root: string): Config => {
  const config = readJson(join(root, '.changeset', 'config.json')) ?? {};
  // Stryker disable next-line ArrayDeclaration: equivalent, a one-entry list only ignores a package named "Stryker was here"
  const ignore = Array.isArray(config.ignore) ? config.ignore.filter((one): one is string => typeof one === 'string') : [];
  const privatePackages = config.privatePackages as { version?: unknown } | undefined;
  return { ignore, privateVersioned: privatePackages?.version !== false };
};

/** A changesets `ignore` entry as a test: `*` stands for any run of characters. */
const globMatches = (glob: string, name: string): boolean =>
  // Stryker disable next-line StringLiteral: equivalent, a package name is ASCII, which matches the same with or without the u flag
  new RegExp(`^${glob.replace(/[.+?^${}()|[\]\\]/gu, String.raw`\$&`).replaceAll('*', '.*')}$`, 'u').test(name); // eslint-disable-line secure-coding/detect-non-literal-regexp -- the repository's own changeset config, escaped

export interface Needed {
  readonly name: string;
  /** The folder under the repository, `packages/<dir>`. */
  readonly dir: string;
  /** The shipped files that changed in it. */
  readonly files: readonly string[];
}

export interface Coverage {
  /** The changesets the pull request adds or edits. */
  readonly changesets: readonly string[];
  /** Every package with a shipped change, by name. */
  readonly needed: readonly Needed[];
  /** The packages no changeset names. */
  readonly uncovered: readonly Needed[];
}

export interface CoverageInput {
  /** The checkout of the pull request's head. */
  readonly root: string;
  /** Every path the pull request changes, from `git diff --name-only <base>...<head>`. */
  readonly changed: readonly string[];
  /** A file's text at the merge base, `undefined` when it did not exist there. */
  readonly baseText: (path: string) => string | undefined;
  /** The regular expression over paths that can need a changeset. */
  readonly paths?: string | undefined;
}

/** The shipped files that changed, by package folder. */
const shippedByDir = (input: CoverageInput): Map<string, string[]> => {
  // Stryker disable next-line StringLiteral: equivalent, a path pattern from a workflow input is ASCII, the same with or without the u flag
  const paths = new RegExp(input.paths ?? DEFAULT_PATHS, 'u'); // eslint-disable-line secure-coding/detect-non-literal-regexp -- the calling workflow's own input
  const byDir = new Map<string, string[]>();
  for (const path of input.changed) {
    if (!paths.test(path) || TEST.test(path)) continue;
    const dir = path.split('/').slice(0, 2).join('/');
    const head = join(input.root, path);
    // Stryker disable next-line StringLiteral: equivalent, JSON.parse reads a Buffer as its text
    const headText = existsSync(head) ? readFileSync(head, 'utf8') : undefined;
    if (path === `${dir}/package.json` && devOnly(input.baseText(path), headText)) continue;
    byDir.set(dir, [...(byDir.get(dir) ?? []), path]);
  }
  return byDir;
};

/** The package a folder holds, unless it has no name or changesets does not version it. */
const neededIn = (root: string, config: Config, dir: string, files: string[]): Needed | undefined => {
  const manifest = readJson(join(root, dir, 'package.json'));
  if (typeof manifest?.name !== 'string') return undefined;
  const { name } = manifest;
  if (config.ignore.some((glob) => globMatches(glob, name))) return undefined;
  if (manifest.private === true && !config.privateVersioned) return undefined;
  return { name, dir, files };
};

/** Which packages the change ships, and which of them no changeset names. */
export const coverage = (input: CoverageInput): Coverage => {
  const config = configOf(input.root);
  const changesets = input.changed.filter((path) => isChangeset(path) && existsSync(join(input.root, path)));
  const named = new Set(changesets.flatMap((path) => releasesOf(readFileSync(join(input.root, path), 'utf8'))));
  const needed = [...shippedByDir(input)].flatMap(([dir, files]) => neededIn(input.root, config, dir, files) ?? []);
  return { changesets, needed, uncovered: needed.filter((one) => !named.has(one.name)) };
};

/** The result as a person reads it, ending with the fix when a package is not covered. */
export const coverageText = (result: Coverage): string => {
  if (result.needed.length === 0) return 'changesets: no package ships a change (tests, fixtures and devDependencies need none)';
  if (result.uncovered.length === 0) {
    return `changesets: ${result.needed.map((one) => one.name).join(', ')} named in ${result.changesets.join(', ')}`;
  }
  const lines = result.uncovered.map((one) => `  ${one.name} (${one.files.join(', ')})`);
  const fix =
    result.changesets.length === 0
      ? `fix: run 'npx changeset' for ${result.uncovered.map((one) => one.name).join(', ')}, or add the 'skip-changeset' label for internal-only work`
      : `fix: add ${result.uncovered.map((one) => `"${one.name}": patch`).join(', ')} (or the right bump) to a changeset, or add the 'skip-changeset' label for internal-only work`;
  return [`changesets: ${String(result.uncovered.length)} package(s) ship a change no changeset names:`, ...lines, fix].join('\n');
};
