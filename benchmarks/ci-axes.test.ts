/**
 * Lock — every axis of the cheap suite actually runs in the cheap CI job.
 *
 * `reliability` landed as a fifth axis, with three bands and a gate, and was never added
 * to the one command that runs the cheap suite. So it ran **nowhere**: not on a PR, not on
 * a push, not in any of the eleven observations the recorder has landed. `/docs/benchmarks`
 * said the axis had not run — which was true, and would have stayed true — and its bands
 * had no series to read while looking, from the outside, exactly like bands that were
 * simply quiet.
 *
 * Nothing caught it because everything downstream was honest about it. The document said
 * `not-run`, the page said it had not run, the bands reported no points. The gap was that
 * no one had said it *should* run, which is what this file says.
 *
 * The pairing is the whole check: an axis is in the cheap suite (`suiteOf`) exactly when
 * the workflow passes it to `npm run bench`. Adding an axis to `AxisName` and forgetting
 * the workflow is now a failure, and so is the reverse.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { SUITE, suiteOf } from './bands.js';
import { type AxisName } from './record.js';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const WORKFLOW = readFileSync(join(REPO_ROOT, '.github', 'workflows', 'bench.yml'), 'utf8');

/** Every axis the type declares. Kept here rather than imported: `run.ts` runs on import. */
const ALL_AXES: AxisName[] = ['perf', 'compat', 'weight', 'reliability', 'agent', 'floor', 'runtime'];

/** The `--axis <name>` arguments of a `npm run bench` line in the workflow. */
function axesOf(line: string): AxisName[] {
  const out: AxisName[] = [];
  const words = line.split(/\s+/);
  words.forEach((word, i) => {
    if (word !== '--axis') return;
    const next = words[i + 1];
    if (next !== undefined) out.push(next as AxisName);
  });
  return out;
}

const benchLines = WORKFLOW.split('\n').filter((l) => l.includes('npm run bench --') && l.includes('--axis'));
/** One job per suite selects axes, on the cadence the suite exists for, and owns it. */
const selections = benchLines.map((l) => axesOf(l));
const forSuite = (suite: string): AxisName[] => ALL_AXES.filter((a) => suiteOf(a) === suite).toSorted();

describe('each CI job runs its whole suite', () => {
  it('has one axis-selecting command per suite, so there is one thing to check for each', () => {
    expect(selections).toHaveLength(Object.values(SUITE).length);
  });

  it.each(Object.values(SUITE))('%s', (suite) => {
    const wanted = forSuite(suite);
    const found = selections.find((axes) => axes.some((a) => suiteOf(a) === suite));
    expect(found?.toSorted(), `the job running ${suite} does not select exactly its axes`).toEqual(wanted);
  });

  it('names an axis the suite knows — a typo would silently select nothing', () => {
    for (const axis of selections.flat()) expect(ALL_AXES).toContain(axis);
  });

  it('never mixes the two suites in one command — they run on different cadences', () => {
    for (const axes of selections) expect(new Set(axes.map((a) => suiteOf(a))).size).toBe(1);
  });
});

/**
 * `.sdlc/intents/b1-mcp-arm/` R4 — the MCP arm's spend is bounded in the workflow.
 *
 * B1 is paid agent runs on every reading. Until 2026-10-18 it landed one on every push to `main`;
 * since D-20261019-b1-weekly-not-per-push the job itself runs only on the weekly schedule, a manual
 * dispatch and a PR labelled `bench:agent` (the describe block at the end holds that). The arm adds
 * its runs to each reading it joins, so it joins the weekly schedule, a labelled PR, and a manual
 * dispatch that asks for it by its `mcp-arm` input (D-20261027-b1-mcp-arm-owner-dispatch: the owner
 * approved three extra readings on 2026-10-27), and nothing else: a push, a dispatch without the
 * input and an unlabelled PR run the two existing variants only. The axis runs the arm only when
 * `BENCH_AGENT_MCP` is `1` (`variantsFor` in `axes/agent.ts`), so the expression that sets it is the
 * whole of the bound, and this evaluates that expression for every event rather than matching its text.
 */
const agentJob = WORKFLOW.slice(WORKFLOW.indexOf('\n  agent:\n'));
const runStep = agentJob.slice(agentJob.indexOf('- name: Run B1'), agentJob.indexOf('- name: Did it actually measure anything?'));

interface Event {
  event_name: string;
  labels: string[];
  /** `vars.B1_MCP_ARM`: the owner's approval of the spend. Absent reads as GitHub reads it, `''`. */
  approval?: string;
  /** `inputs.mcp-arm`: a boolean on a manual dispatch, absent (GitHub's `null`) on every other event. */
  mcpArm?: boolean;
}

/**
 * The GitHub expression grammar this condition may use: `||`, `&&`, `!`, parentheses, `==`/`!=`,
 * string literals, `github.event_name` and `contains(github.event.pull_request.labels.*.name, '…')`.
 * Anything else throws, so a later edit cannot slip a term past the test by being unreadable.
 */
/** GitHub's truthiness: `''`, `false`, `null` and `0` are false. */
const truthy = (v: unknown): boolean => v !== '' && v !== false && v !== null && v !== undefined && v !== 0;

function evaluate(expression: string, ev: Event): unknown {
  const parts = expression.match(/'[^']*'|\|\||&&|==|!=|!|\(|\)|,|[\w.*:-]+/gu) ?? [];
  let i = 0;
  const peek = (): string | undefined => parts[i];
  const take = (want?: string): string => {
    const t = parts[i++];
    if (t === undefined || (want !== undefined && t.localeCompare(want) !== 0)) throw new Error(`unexpected ${String(t)} in ${expression}`);
    return t;
  };
  const primary = (): unknown => {
    const t = take();
    if (t === '(') {
      const v = or();
      take(')');
      return v;
    }
    if (t === '!') return !truthy(primary());
    if (t.startsWith("'")) return t.slice(1, -1);
    if (t === 'github.event_name') return ev.event_name;
    if (t === 'vars.B1_MCP_ARM') return ev.approval ?? '';
    if (t === 'inputs.mcp-arm') return ev.event_name === 'workflow_dispatch' ? (ev.mcpArm ?? false) : null;
    if (t === 'contains') {
      take('(');
      const subject = take();
      take(',');
      const needle = take();
      take(')');
      if (subject !== 'github.event.pull_request.labels.*.name') throw new Error(`contains() over ${subject} is not a term this bound may use`);
      return ev.labels.includes(needle.slice(1, -1));
    }
    throw new Error(`${t} is not a term this bound may use`);
  };
  const compare = (): unknown => {
    const left = primary();
    const op = peek();
    if (op !== '==' && op !== '!=') return left;
    take();
    const right = primary();
    return op === '==' ? left === right : left !== right;
  };
  const and = (): unknown => {
    let v = compare();
    while (peek() === '&&') {
      take();
      const r = compare();
      v = truthy(v) ? r : v;
    }
    return v;
  };
  const or = (): unknown => {
    let v = and();
    while (peek() === '||') {
      take();
      const r = and();
      v = truthy(v) ? v : r;
    }
    return v;
  };
  const value = or();
  if (i !== parts.length) throw new Error(`trailing ${parts.slice(i).join(' ')} in ${expression}`);
  return value;
}

/** The value the `Run B1` step hands the axis as `BENCH_AGENT_MCP`, for one event. */
function armFor(ev: Event): unknown {
  const line = /^\s+BENCH_AGENT_MCP: \$\{\{ (.+) \}\}\s*$/mu.exec(runStep)?.[1];
  if (line === undefined) throw new Error('the `Run B1` step does not set BENCH_AGENT_MCP from an expression');
  return evaluate(line, ev);
}

/** Whether the `agent` job runs at all for an event: its own `if:`. */
function jobRunsFor(ev: Event): boolean {
  const cond = /^ {4}if: >-\n((?: {6}.+\n)+)/mu.exec(agentJob)?.[1];
  if (cond === undefined) throw new Error('the agent job has no `if: >-` condition');
  return evaluate(cond.replaceAll(/\s+/gu, ' ').trim(), ev) === true;
}

describe('R4 — the MCP arm runs where its cost was accepted, and nowhere else', () => {
  const label = 'bench:agent';
  const approval = 'approved';

  it('admits the weekly schedule', () => {
    expect(armFor({ event_name: 'schedule', labels: [], approval })).toBe('1');
  });

  it('admits a pull request labelled bench:agent', () => {
    expect(armFor({ event_name: 'pull_request', labels: [label], approval })).toBe('1');
  });

  it('admits a manual dispatch that asks for the arm by its mcp-arm input', () => {
    expect(armFor({ event_name: 'workflow_dispatch', labels: [], approval, mcpArm: true })).toBe('1');
  });

  it('refuses a manual dispatch that does not ask, and a push however it is dressed', () => {
    expect(armFor({ event_name: 'workflow_dispatch', labels: [], approval, mcpArm: false })).not.toBe('1');
    expect(armFor({ event_name: 'workflow_dispatch', labels: [], approval })).not.toBe('1');
    expect(armFor({ event_name: 'push', labels: [], approval, mcpArm: true })).not.toBe('1');
  });

  it('declares mcp-arm as a boolean dispatch input that defaults to off', () => {
    const dispatch = WORKFLOW.slice(WORKFLOW.indexOf('  workflow_dispatch:'), WORKFLOW.indexOf('\nconcurrency:'));
    expect(dispatch).toMatch(/^ {6}mcp-arm:\n(?: {8}.+\n)*? {8}type: boolean\n/mu);
    expect(dispatch).toMatch(/^ {6}mcp-arm:\n(?: {8}.+\n)*? {8}default: false\n/mu);
  });

  it.each(['', 'yes', 'Approved'])('spends nothing anywhere until the owner approves it (B1_MCP_ARM=%j)', (value) => {
    for (const event_name of ['schedule', 'push', 'workflow_dispatch', 'pull_request']) {
      for (const labels of [[], [label]]) {
        for (const mcpArm of [false, true]) expect(armFor({ event_name, labels, approval: value, mcpArm })).not.toBe('1');
      }
    }
  });

  it.each([
    ['push', []],
    ['workflow_dispatch', []],
    ['pull_request', []],
    ['pull_request', ['documentation']],
    ['push', [label]],
  ] as const)('refuses %s (labels %j), approved or not', (event_name, labels) => {
    expect(armFor({ event_name, labels: [...labels], approval })).not.toBe('1');
  });

  it('is never wider than the job it runs in, which is where the two existing variants spend', () => {
    for (const event_name of ['schedule', 'push', 'workflow_dispatch', 'pull_request']) {
      for (const labels of [[], [label]]) {
        for (const mcpArm of [false, true]) {
          if (armFor({ event_name, labels, approval, mcpArm }) === '1') expect(jobRunsFor({ event_name, labels, mcpArm }), `${event_name} ${labels.join()}`).toBe(true);
        }
      }
    }
  });

  it('fails when the condition is widened to a push — the mutation this lock exists for', () => {
    const widened = runStep.replace(/github\.event_name == 'schedule' \|\|/u, "github.event_name == 'push' || github.event_name == 'schedule' ||");
    expect(widened).not.toBe(runStep);
    const line = /^\s+BENCH_AGENT_MCP: \$\{\{ (.+) \}\}\s*$/mu.exec(widened)?.[1] ?? '';
    expect(evaluate(line, { event_name: 'push', labels: [], approval })).toBe('1');
  });

  it('is set in exactly one place, so no other step can turn the arm on', () => {
    expect(WORKFLOW.match(/BENCH_AGENT_MCP/gu)).toHaveLength(1);
  });

  it('lands a weekly reading under its own name, so it never collides with a push reading of the same commit', () => {
    expect(agentJob).toMatch(/if: \(github\.event_name == 'push' \|\| github\.event_name == 'schedule' \|\| \(github\.event_name == 'workflow_dispatch' && inputs\.mcp-arm\)\) && steps\.status\.outputs\.status == 'measured'/u);
    expect(agentJob).toContain('-weekly-ci.json');
  });

  it('lands a dispatched reading under a name carrying its run id, so three dispatches of one commit never collide', () => {
    const land = agentJob.slice(agentJob.indexOf("- name: Land B1's observation"), agentJob.indexOf('- uses: actions/upload-artifact'));
    expect(land).toContain('-dispatch-${GITHUB_RUN_ID}-ci.json');
    // A dispatch that did not ask for the arm measured nothing the verdict reads, and lands nothing.
    const cond = /^ {8}if: (.+)$/mu.exec(land)?.[1] ?? '';
    expect(cond).toContain("(github.event_name == 'workflow_dispatch' && inputs.mcp-arm)");
  });
});

/**
 * D-20261019-b1-weekly-not-per-push — the B1 job no longer runs on a push to `main`.
 *
 * On a push it spent about 25 paid agent runs per merge, from the same Claude weekly quota as the
 * required `review` check. About 250 runs landed between the 05:00 reset and the evening of
 * 2026-10-18, and the 2026-10-13 weekly reading and the 2026-10-15 evals both died on the limit.
 * The bound is now one weekly reading, a manual dispatch, and the PRs that ask by label.
 */
describe('B1 runs weekly and on request, never per push (D-20261019-b1-weekly-not-per-push)', () => {
  const label = 'bench:agent';
  /** The condition this replaced, kept verbatim so the proof below runs against it. */
  const BEFORE = "github.event_name != 'pull_request' || contains(github.event.pull_request.labels.*.name, 'bench:agent')";

  it.each([[[]], [[label]]] as const)('does not run on a push to main (labels %j)', (labels) => {
    expect(jobRunsFor({ event_name: 'push', labels: [...labels] })).toBe(false);
  });

  it.each(['schedule', 'workflow_dispatch'])('runs on %s', (event_name) => {
    expect(jobRunsFor({ event_name, labels: [] })).toBe(true);
  });

  it('runs on a pull request labelled bench:agent, and not on one without the label', () => {
    expect(jobRunsFor({ event_name: 'pull_request', labels: [label] })).toBe(true);
    expect(jobRunsFor({ event_name: 'pull_request', labels: [] })).toBe(false);
    expect(jobRunsFor({ event_name: 'pull_request', labels: ['documentation'] })).toBe(false);
  });

  it('would fail against the condition it replaced — the old `if:` runs on every push', () => {
    expect(evaluate(BEFORE, { event_name: 'push', labels: [] })).toBe(true);
  });
});
