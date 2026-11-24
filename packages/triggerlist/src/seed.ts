/**
 * Draft checklist items from what the repository already records (triggerlist spec R4): each lock
 * test's header says what broke and what it holds, and each decision file says what was chosen. The
 * draft is printed for a person to edit, never written into the checklist: the trigger globs are
 * `**` until someone narrows them, and a too-wide trigger is the one that fires on every PR.
 */
import { type Item } from './checklist.js';

export interface Source {
  readonly path: string;
  readonly text: string;
}

const LOCK_PREFIX = /^Lock\s*[—–-]\s*/;
const FRONTMATTER = /^---\n[\s\S]*?\n---/;

/** A file name as an item id: lowercase, words joined by `-`. */
export const idOf = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** The first sentence of a doc comment, on one line. */
const firstSentence = (comment: string): string => {
  const flat = comment
    .split('\n')
    .map((line) => line.replace(/^\s*\*\s?/, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  const end = flat.search(/[.!?]\s/);
  return end === -1 ? flat : flat.slice(0, end + 1);
};

const OPEN = '/**';
const CLOSE = '*/';

/** Each closed `/** … *\/` comment's body, in order. A scan, not a regex: a lazy regex over `/**` is quadratic on a file of unclosed openers. */
export const docComments = (text: string): string[] => {
  const bodies: string[] = [];
  let open = text.indexOf(OPEN);
  while (open !== -1) {
    const close = text.indexOf(CLOSE, open + OPEN.length);
    if (close === -1) break;
    bodies.push(text.slice(open + OPEN.length, close));
    open = text.indexOf(OPEN, close + CLOSE.length);
  }
  return bodies;
};

/** A vitest config at a repository's root: `vitest.config.ts`, `vitest.root.config.mts`, … */
export const VITEST_CONFIG = /^vitest\.(?:[\w-]+\.)?config\.[cm]?[jt]s$/;

/**
 * The command a draft's check line runs one lock test with, in the repository the configs and the
 * manifest come from. A root vitest config that names the lock folder is passed with `--config`
 * (vitest finds `vitest.config.*` itself); a repo that uses vitest otherwise gets `npx vitest run`;
 * one with no sign of vitest gets no command, and the draft says only which file to run.
 */
export const testCommand = (configs: readonly Source[], manifest: string, locks: string): string | undefined => {
  const named = configs.find((config) => config.text.includes(`${locks}/`))?.path;
  if (named !== undefined && !named.startsWith('vitest.config.')) return `npx vitest run --config ${named}`;
  return configs.length > 0 || manifest.includes('"vitest"') ? 'npx vitest run' : undefined;
};

/**
 * A lock test's header (the first doc comment that is not the licence) as a draft item. `runner` is
 * what `testCommand` derived for the repository; without one the check names the file to run.
 */
export const fromLockTest = ({ path, text }: Source, runner?: string): Item | undefined => {
  const header = docComments(text).find((body) => !body.includes('Copyright'));
  if (header === undefined) return undefined;
  const name = (path.split('/').pop() as string).slice(0, -'.test.ts'.length);
  return {
    id: idOf(name),
    trigger: { paths: ['**'] },
    // Most headers open `Lock — `: the file name already says it is one.
    question: firstSentence(header).replace(LOCK_PREFIX, ''),
    check: runner === undefined ? `run ${path}` : `${runner} ${path}`,
    sources: [path],
  };
};

/** A frontmatter line's value, without the quotes YAML may put round it. */
const field = (front: string, key: string): string | undefined => {
  const line = front.split('\n').find((candidate) => candidate.startsWith(`${key}:`));
  if (line === undefined) return undefined;
  const value = line.slice(key.length + 1).trim();
  return value.startsWith("'") && value.endsWith("'") ? value.slice(1, -1) : value;
};

/** A decision file's `id` and `subject` as a draft item. */
export const fromDecision = ({ path, text }: Source): Item | undefined => {
  const front = FRONTMATTER.exec(text)?.[0];
  if (front === undefined) return undefined;
  const id = field(front, 'id');
  const subject = field(front, 'subject');
  if (id === undefined || subject === undefined) return undefined;
  return { id: idOf(id), trigger: { paths: ['**'] }, question: `Does the change respect this decision: ${subject}`, check: `read ${path}`, sources: [path] };
};

const quote = (value: string): string => JSON.stringify(value);

/** The draft as YAML the checklist's `items:` takes, skipping ids the checklist already has. */
export const toYaml = (items: readonly Item[], existing: ReadonlySet<string>): string => {
  const fresh = items.filter((item) => !existing.has(item.id));
  const lines = [`# ${String(fresh.length)} draft item(s) from triggerlist seed. Narrow each trigger before it goes into the checklist.`];
  for (const item of fresh) {
    lines.push(
      `- id: ${item.id}`,
      '  trigger:',
      `    paths: [${item.trigger.paths.map(quote).join(', ')}]`,
      `  question: ${quote(item.question)}`,
      `  check: ${quote(item.check)}`,
      `  sources: [${item.sources.map(quote).join(', ')}]`,
    );
  }
  return lines.join('\n');
};
