import { array, enumOf, number, object, optional, parse, string } from 'loadline';
/**
 * What replz runs (replz spec R2, R3): the reviewer, the grader and the repository's checks, each
 * a shell command, so the reviewer is the same prompt and REVIEW.md as CI rather than a copy of it.
 *
 * The reviewer runs in the case's worktree with `REPLZ_BASE` and `REPLZ_HEAD` set and prints its
 * findings as JSON. The grader reads one prompt on stdin and answers yes or no. A check fires when it
 * exits non-zero. `maxFindings` caps the grader calls per case, which is what a run costs.
 */
import { parse as parseYaml } from 'seniority/yaml';

export const SEVERITIES = ['must-fix', 'should-fix', 'nit', 'pre-existing'] as const;
export type Severity = (typeof SEVERITIES)[number];

export interface Check {
  readonly id: string;
  readonly command: string;
}

export interface Config {
  /** Run first in each case's worktree, which starts with no dependencies installed. */
  readonly setup?: string | undefined;
  readonly reviewer: string;
  /** `{model}` in it is replaced by the model a run grades with. */
  readonly grader: string;
  /** The default for `--model`. Left out, a run must name one. */
  readonly model?: string | undefined;
  readonly maxFindings: number;
  /** The reviewer's stages, in order; the last is what ships. */
  readonly stages: readonly string[];
  readonly checks: readonly Check[];
  /** The checklist whose items a finding may name, so an item that never fires is reported too. */
  readonly checklist?: string | undefined;
}

export const CONFIG = '.sdlc/replz/config.yaml';

const id = string({ pattern: /^[a-z0-9][a-z0-9-]*$/ });
const text = string({ min: 1 });

const SCHEMA = object(
  {
    setup: optional(text),
    reviewer: text,
    grader: text,
    model: optional(text),
    maxFindings: number({ int: true, min: 1 }),
    stages: array(id, { min: 1 }),
    checks: array(object({ id, command: text }, { unknown: 'strict' })),
    checklist: optional(text),
  },
  { unknown: 'strict' },
);

export const parseConfig = (source: string, yaml: string): Config => {
  const parsed = parse(SCHEMA, parseYaml(yaml));
  if (!parsed.ok) {
    const lines = parsed.issues.map((issue) => `  ${issue.path === '' ? '/' : issue.path}: ${issue.message}`).join('\n');
    throw new Error(`${source} is not a valid replz config:\n${lines}`);
  }
  return parsed.value as Config;
};

/** One thing the reviewer said, at one stage of its pipeline. */
export interface Finding {
  readonly stage: string;
  readonly severity: Severity;
  readonly text: string;
  /** The checklist item that prompted it, when the reviewer says. */
  readonly item?: string | undefined;
}

const FINDINGS = array(object({ stage: id, severity: enumOf(SEVERITIES), text, item: optional(id) }));

/** The reviewer's stdout as findings; a stage the config does not name is refused, never dropped. */
export const parseFindings = (stdout: string, stages: readonly string[]): Finding[] => {
  let document: unknown;
  try {
    document = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`the reviewer did not print JSON: ${(error as Error).message}. fix: make the reviewer print a JSON array of { stage, severity, text, item? }`, { cause: error });
  }
  const parsed = parse(FINDINGS, document);
  if (!parsed.ok) throw new Error(`the reviewer's findings are not valid: ${parsed.issues.map((issue) => `${issue.path} ${issue.message}`).join('; ')}`);
  const findings = parsed.value as Finding[];
  const unknown = findings.find((finding) => !stages.includes(finding.stage));
  if (unknown !== undefined) throw new Error(`the reviewer reported the stage \`${unknown.stage}\`, which the config does not list. fix: add it to stages, in order`);
  return findings;
};
