/**
 * The checklist file (triggerlist spec R1): which files are gates, and the items a diff can select.
 * Each item says when it fires, the question a reviewer answers, the check that answers it and the
 * incidents behind it. The file is YAML, checked by `validator` so a malformed item is refused with
 * the pointer to it and never silently matched as nothing.
 */
import { parse as parseYaml } from 'seniority/yaml';
import { array, object, optional, parse, string } from 'truefit';

/** One item: an id, a trigger readable from a diff, and what the reviewer does when it fires. */
export interface Item {
  readonly id: string;
  readonly trigger: {
    /** Globs, matched with `path.matchesGlob` against the repo-relative path of a changed file. */
    readonly paths: readonly string[];
    /** A regex tested against each added or removed line of a matching file. Absent: any change fires. */
    readonly pattern?: string | undefined;
  };
  readonly question: string;
  readonly check: string;
  /** The PRs, incidents, decisions or lock tests behind the item: why it exists. */
  readonly sources: readonly string[];
}

export interface Checklist {
  /** Globs naming the files that judge code: lock tests, hooks, bands, REVIEW.md, this file. */
  readonly gates: readonly string[];
  readonly items: readonly Item[];
}

/** Where the checklist lives when nobody says otherwise. */
export const CHECKLIST = '.sdlc/checklist.yaml';

const text = string({ min: 1 });

const ITEM = object(
  {
    id: string({ pattern: /^[a-z0-9][a-z0-9-]*$/ }),
    trigger: object({ paths: array(text, { min: 1 }), pattern: optional(text) }, { unknown: 'strict' }),
    question: text,
    check: text,
    sources: array(text, { min: 1 }),
  },
  { unknown: 'strict' },
);

const SCHEMA = object({ gates: array(text), items: array(ITEM) }, { unknown: 'strict' });

/** Read a checklist from its YAML text; `source` names it in every error. */
export const parseChecklist = (source: string, yaml: string): Checklist => {
  let document: unknown;
  try {
    document = parseYaml(yaml);
  } catch (error) {
    throw new Error(`${source} is not YAML: ${(error as Error).message}. fix: correct the YAML`, { cause: error });
  }
  const parsed = parse(SCHEMA, document);
  if (!parsed.ok) {
    const lines = parsed.issues.map((issue) => `  ${issue.path === '' ? '/' : issue.path}: ${issue.message}`).join('\n');
    throw new Error(`${source} is not a valid checklist:\n${lines}`);
  }
  const checklist = parsed.value as Checklist;
  const seen = new Set<string>();
  for (const item of checklist.items) {
    if (seen.has(item.id)) throw new Error(`${source} names the item \`${item.id}\` twice. fix: give each item its own id`);
    seen.add(item.id);
    // An absent pattern compiles as the empty one, which is valid: only a pattern that is there can fail.
    // Stryker disable next-line StringLiteral: equivalent, any other literal there is a valid pattern too
    const pattern = item.trigger.pattern ?? '';
    try {
      // eslint-disable-next-line secure-coding/detect-non-literal-regexp -- the pattern is the repository's own checklist, read from the base branch: compiling it is what validating it means
      new RegExp(pattern, 'u');
    } catch (error) {
      throw new Error(`${source}: \`${item.id}\` has a pattern that is not a regex: ${(error as Error).message}. fix: correct trigger.pattern`, { cause: error });
    }
  }
  return checklist;
};
