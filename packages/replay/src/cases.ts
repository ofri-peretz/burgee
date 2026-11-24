/**
 * A replay case (replay spec R1): one pull request, at the commits it had at review time. A bug case
 * carries a one-sentence answer key, and a finding counts only when it describes that bug. A control
 * is a clean merged pull request of a similar size: any must-fix found there is a false alarm.
 * `set` keeps the cases a change is tuned on apart from the ones it is judged on.
 */
import { parse as parseYaml } from 'seniority/yaml';
import { enumOf, number, object, optional, parse, string } from 'truefit';

export const KINDS = ['bug', 'control'] as const;
export const SETS = ['tune', 'test'] as const;

export interface Case {
  readonly id: string;
  readonly kind: (typeof KINDS)[number];
  /** The pull request the commits belong to. */
  readonly pr: number;
  /** The commit the pull request was reviewed against. */
  readonly base: string;
  /** The commit the reviewer saw: the pull request applied to `base`. */
  readonly head: string;
  /** What the bug is, in one sentence. Bugs only. */
  readonly answer?: string | undefined;
  readonly set: (typeof SETS)[number];
}

const SHA = /^[0-9a-f]{7,40}$/;

const SCHEMA = object(
  {
    id: string({ pattern: /^[a-z0-9][a-z0-9-]*$/ }),
    kind: enumOf(KINDS),
    pr: number({ int: true, min: 1 }),
    base: string({ pattern: SHA }),
    head: string({ pattern: SHA }),
    answer: optional(string({ min: 1 })),
    set: enumOf(SETS),
  },
  { unknown: 'strict' },
);

/** Read one case from its YAML; `source` names it in every error. */
export const parseCase = (source: string, yaml: string): Case => {
  let document: unknown;
  try {
    document = parseYaml(yaml);
  } catch (error) {
    throw new Error(`${source} is not YAML: ${(error as Error).message}. fix: correct the YAML`, { cause: error });
  }
  const parsed = parse(SCHEMA, document);
  if (!parsed.ok) {
    const lines = parsed.issues.map((issue) => `  ${issue.path === '' ? '/' : issue.path}: ${issue.message}`).join('\n');
    throw new Error(`${source} is not a valid case:\n${lines}`);
  }
  const found = parsed.value as Case;
  if (found.kind === 'bug' && found.answer === undefined) throw new Error(`${source}: a bug case needs its answer, one sentence saying what the bug is. fix: add answer`);
  if (found.kind === 'control' && found.answer !== undefined) throw new Error(`${source}: a control has no bug, so no answer. fix: remove answer, or make it kind: bug`);
  return found;
};

/** Cases must have distinct ids; a run on `set` takes only that set's cases. */
export const selectCases = (cases: readonly Case[], set: Case['set'] | undefined): Case[] => {
  const seen = new Set<string>();
  for (const found of cases) {
    if (seen.has(found.id)) throw new Error(`two cases are named \`${found.id}\`. fix: give each case its own id`);
    seen.add(found.id);
  }
  return cases.filter((found) => set === undefined || found.set === set);
};
