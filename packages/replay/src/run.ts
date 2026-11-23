/**
 * One replay (replay spec R2, R3): for each case, a git worktree at its head, the reviewer and every
 * check run inside it, and each finding of a bug case graded against the answer key, one finding per
 * grader call, at most `maxFindings` per case. Controls are never graded: they have no answer, so
 * they cost one reviewer call and nothing more.
 */
import { type Case } from './cases.js';
import { type Config, type Finding, parseFindings } from './config.js';
import { type CaseResult, type Graded } from './score.js';

export interface Ran {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** Runs a shell command line; a test passes its own and runs nothing. */
export type Shell = (command: string, options: { readonly cwd: string; readonly env?: Readonly<Record<string, string>>; readonly input?: string }) => Promise<Ran>;

export interface Worktrees {
  /** A detached worktree at `ref`, and the function that removes it. */
  readonly add: (ref: string) => Promise<{ readonly dir: string; readonly remove: () => Promise<void> }>;
}

/** The grader's whole prompt: the answer key, one finding, and the question. */
export const gradePrompt = (answer: string, finding: Finding): string =>
  [
    'You grade a code reviewer against a known bug.',
    `The bug (answer key): ${answer}`,
    `The reviewer's finding: ${finding.text}`,
    'Does the finding describe this bug: the same defect, not merely the same file or area? Answer yes or no, and nothing else.',
  ].join('\n');

/** A grader answer counts as a match only when its first word is yes. */
export const isYes = (stdout: string): boolean => /^\W*yes\b/i.test(stdout);

/** What every case of one run shares. */
export interface Replayer {
  readonly shell: Shell;
  readonly worktrees: Worktrees;
  readonly config: Config;
  /** Put into the grader command's `{model}`. */
  readonly model: string | undefined;
}

const grade = async ({ shell, config, model }: Replayer, cwd: string, answer: string, findings: readonly Finding[]): Promise<{ graded: Graded[]; capped: boolean }> => {
  const command = config.grader.replaceAll('{model}', String(model));
  const graded: Graded[] = [];
  for (const [index, finding] of findings.entries()) {
    if (index >= config.maxFindings) {
      graded.push({ finding, matches: false });
      continue;
    }
    // eslint-disable-next-line reliability/no-await-in-loop -- one grader call at a time: the cap is a cost cap, and a burst of paid calls is what it prevents
    const answered = await shell(command, { cwd, input: gradePrompt(answer, finding) });
    if (answered.code !== 0) throw new Error(`the grader failed (exit ${String(answered.code)}): ${answered.stderr.trim()}. fix: check the grader command in the replay config`);
    graded.push({ finding, matches: isYes(answered.stdout) });
  }
  return { graded, capped: findings.length > config.maxFindings };
};

export const replayCase = async (replayer: Replayer, found: Case): Promise<CaseResult> => {
  const { shell, config } = replayer;
  // Before the reviewer runs: a run that cannot be graded should not pay for the review first.
  if (found.answer !== undefined && replayer.model === undefined && config.grader.includes('{model}')) {
    throw new Error('the grader command takes {model} and none was given. fix: pass --model with the cheapest current model, or set model in the replay config');
  }
  const { dir, remove } = await replayer.worktrees.add(found.head);
  try {
    const env = { REPLAY_BASE: found.base, REPLAY_HEAD: found.head, REPLAY_PR: String(found.pr) };
    if (config.setup !== undefined) {
      const ready = await shell(config.setup, { cwd: dir, env });
      if (ready.code !== 0) throw new Error(`setup failed on ${found.id} (exit ${String(ready.code)}): ${ready.stderr.trim()}. fix: run it by hand in a worktree at ${found.head}`);
    }
    const reviewed = await shell(config.reviewer, { cwd: dir, env });
    if (reviewed.code !== 0) throw new Error(`the reviewer failed on ${found.id} (exit ${String(reviewed.code)}): ${reviewed.stderr.trim()}. fix: run it by hand in a worktree at ${found.head}`);
    const findings = parseFindings(reviewed.stdout, config.stages);
    const outcomes: [string, boolean][] = [];
    for (const check of config.checks) {
      // eslint-disable-next-line reliability/no-await-in-loop -- the checks share one worktree and its build output; run together they would race on it
      outcomes.push([check.id, (await shell(check.command, { cwd: dir, env })).code !== 0]);
    }
    const fired = Object.fromEntries(outcomes);
    if (found.answer === undefined) return { case: found, findings: findings.map((finding) => ({ finding, matches: false })), capped: false, fired };
    const { graded, capped } = await grade(replayer, dir, found.answer, findings);
    return { case: found, findings: graded, capped, fired };
  } finally {
    await remove();
  }
};
