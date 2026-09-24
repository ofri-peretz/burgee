/**
 * N10 — the floor, graded by two checklists we did not write.
 *
 * Every other axis in this suite measures burgee with an instrument burgee's authors built,
 * and an instrument its authors built can only ever find the faults they thought of. This one
 * hands the demo program to two published, third-party conformance checkers and records what
 * they say, whatever it is:
 *
 *   - **clispec** 0.3.0 — the scorer for [The CLI Spec](https://clispec.dev) v0.3, six
 *     principles, 24 points. It discovers a schema by running `<tool> schema`.
 *   - **cli-agent-lint** 0.3.5 — 34 checks in five categories (Flow Safety, Token
 *     Efficiency, Self-Describing, Automation Safety, Predictability), a percentage and a
 *     letter grade.
 *
 * The same three variants as the reliability axis — one demo program on burgee, commander
 * and yargs — so the incumbents are graded by the same checklist in the same run. Both tools
 * are pinned by version and archive digest in `../floor-tools.ts`; neither is on npm.
 *
 * **Nothing here reinterprets a verdict.** A check the tool fails is recorded as failed, by
 * the tool's own name for it, even where we think the checker is wrong: `clispec` looks for a
 * `schema` *subcommand* and burgee answers `--schema`, and that costs points it would cost
 * any CLI that made the same choice. Arguing with a checklist belongs in D-149 and in an
 * upstream issue, not in a parser that quietly awards the points back.
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { type Tool, TOOLS, toolPath } from '../floor-tools.js';
import { type BenchRecord } from '../record.js';
import { round } from '../stats.js';

import { type Variant, VARIANTS } from './reliability.js';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)), '..');

/** Generous: cli-agent-lint probes a few dozen times at up to 5 s each. A hang still ends. */
const TOOL_TIMEOUT_MS = 180_000;
const PERCENT_PLACES = 1;
/** How much of an unparseable report to quote back: enough to recognise, not a log dump. */
const QUOTE_CHARS = 200;

/** What `clispec --output json score` prints: `src/scorer.rs` `Score` at v0.3.0. */
export interface ClispecScore {
  tool: string;
  score: number;
  max: number;
  percentage: number;
  grade: string;
  principles: { name: string; score: number; max: number; checks: { name: string; passed: boolean; checklist?: string | null }[] }[];
}

/** What `cli-agent-lint --output json check` prints: `report/json.go` at v0.3.5. */
export interface AgentLintReport {
  score: { percentage: number; grade: string };
  summary: { total: number; pass: number; warn: number; fail: number; skip: number; error: number };
  checks: { id: string; name: string; status: string }[];
}

/** A tool's stdout, parsed — or the reason it could not be, so the axis can say so. */
function parseJson<T>(tool: string, stdout: string, required: readonly string[]): T {
  let value: unknown;
  try {
    value = JSON.parse(stdout);
  } catch {
    throw new Error(`${tool} printed no JSON document: ${stdout.slice(0, QUOTE_CHARS)}`);
  }
  const missing = required.filter((k) => typeof value !== 'object' || value === null || !(k in value));
  if (missing.length > 0) throw new Error(`${tool}'s report has no ${missing.join(', ')} — the pinned version's output shape changed`);
  return value as T;
}

export const parseClispec = (stdout: string): ClispecScore => parseJson<ClispecScore>('clispec', stdout, ['score', 'max', 'percentage', 'grade', 'principles']);
export const parseAgentLint = (stdout: string): AgentLintReport => parseJson<AgentLintReport>('cli-agent-lint', stdout, ['score', 'summary', 'checks']);

/** Every check clispec failed, by its own name and the checklist item it cites. */
export function clispecFailures(report: ClispecScore): string[] {
  return report.principles.flatMap((p) => p.checks.filter((c) => !c.passed).map((c) => (c.checklist ? `${c.name} [${c.checklist}]` : c.name)));
}

/** Every check cli-agent-lint did not pass or skip: `fail`, `warn`, `info` and `error` alike. */
export function agentLintFailures(report: AgentLintReport): string[] {
  return report.checks.filter((c) => c.status !== 'pass' && c.status !== 'skip').map((c) => `${c.id} ${c.name} (${c.status})`);
}

/**
 * Burgee's own scores are gated at what they measured when this axis landed, so a change
 * that loses a point on either checklist fails the PR that made it. A ratchet, not a target:
 * raising either number is a decision recorded here, and lowering one is the failure.
 */
export const BURGEE_FLOOR = {
  clispec: { min: 0, why: 'N10: a change that loses a point on clispec.dev’s published checklist regresses the floor against someone else’s bar' },
  agentLint: { min: 0, why: 'N10: a change that loses a check on cli-agent-lint’s 34 regresses the floor against someone else’s bar' },
} as const;

export function clispecRecord(variant: string, report: ClispecScore, tool: Tool): BenchRecord {
  const failed = clispecFailures(report);
  return {
    axis: 'floor',
    variant,
    metric: 'clispec-score',
    unit: 'points',
    samples: 1,
    median: report.score,
    p95: report.score,
    ...(variant === 'burgee' ? { gate: BURGEE_FLOOR.clispec } : {}),
    note: `clispec ${tool.version} (clispec.dev v0.3): points out of ${String(report.max)}, graded ${report.grade}`,
    detail: { tool: `clispec ${tool.version}`, max: report.max, percentage: report.percentage, grade: report.grade, failed: failed.join('; ') },
  };
}

export function agentLintRecord(variant: string, report: AgentLintReport, tool: Tool): BenchRecord {
  const pct = round(report.score.percentage, PERCENT_PLACES);
  const { summary } = report;
  return {
    axis: 'floor',
    variant,
    metric: 'cli-agent-lint-score',
    unit: 'percent',
    samples: 1,
    median: pct,
    p95: pct,
    ...(variant === 'burgee' ? { gate: BURGEE_FLOOR.agentLint } : {}),
    note: `cli-agent-lint ${tool.version}: weighted percentage over ${String(summary.total)} checks, graded ${report.score.grade}`,
    detail: {
      tool: `cli-agent-lint ${tool.version}`,
      grade: report.score.grade,
      checks: summary.total,
      pass: summary.pass,
      warn: summary.warn,
      fail: summary.fail,
      skip: summary.skip,
      error: summary.error,
      failed: agentLintFailures(report).join('; '),
    },
  };
}

/**
 * An executable the tools can be pointed at. Both take a path and `exec` it, and a built
 * `dist/bin.js` is neither executable nor guaranteed to find this Node — so a two-line shim,
 * named like the demo's own `bin`, that runs it with the Node running the suite.
 */
function shim(dir: string, variant: Variant): string {
  const path = join(dir, `demo-${variant.id}`);
  writeFileSync(path, `#!/bin/sh\nexec '${process.execPath}' '${resolve(REPO_ROOT, variant.bin)}' "$@"\n`);
  const EXECUTABLE = 0o755;
  chmodSync(path, EXECUTABLE);
  return path;
}

/**
 * The same environment on every machine: a PATH to find `sh`, a HOME, and nothing else. A
 * developer's shell carries agent markers (`CLAUDECODE`, `CI`) that the demo reads (N12), and
 * a verdict that depends on who ran the benchmark is not a measurement of the program.
 */
const cleanEnv = (): NodeJS.ProcessEnv => ({ PATH: process.env['PATH'] ?? '/usr/bin:/bin', HOME: tmpdir() });

function runTool(tool: Tool, args: readonly string[]): string {
  const result = spawnSync(toolPath(tool), args, { encoding: 'utf8', timeout: TOOL_TIMEOUT_MS, env: cleanEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.error !== undefined) throw new Error(`${tool.id} ${args.join(' ')}: ${result.error.message}`);
  // cli-agent-lint exits 1 when a fail-severity check did not pass, and still prints its
  // report: the exit code is its verdict, not a failure to measure. 2 is its usage error.
  const USAGE = 2;
  if (result.status === null || result.status >= USAGE) throw new Error(`${tool.id} ${args.join(' ')} exited ${String(result.status)}: ${result.stderr}`);
  return result.stdout;
}

const toolById = (id: Tool['id']): Tool => TOOLS.find((t) => t.id === id) as Tool;

export function measure(variant: Variant, dir: string): BenchRecord[] {
  const target = shim(dir, variant);
  const clispec = toolById('clispec');
  const agentLint = toolById('cli-agent-lint');
  return [
    clispecRecord(variant.id, parseClispec(runTool(clispec, ['--output', 'json', 'score', target])), clispec),
    agentLintRecord(variant.id, parseAgentLint(runTool(agentLint, ['--output', 'json', '--no-color', 'check', target])), agentLint),
  ];
}

export const method =
  'The same demo program built on burgee, commander and yargs, handed to two third-party checkers pinned by version and archive digest (`benchmarks/floor-tools.ts`): clispec 0.3.0, the scorer for clispec.dev v0.3 (six principles, 24 points), and cli-agent-lint 0.3.5 (34 checks, weighted percentage). Each tool runs once per variant with active probing on, in an environment of PATH and an empty HOME only. Verdicts are recorded as the tools print them; nothing is re-scored. Burgee’s two scores are gated at their landing values as a ratchet.';

export function run(): { records: BenchRecord[] } | { reason: string } {
  const missingTools = TOOLS.filter((t) => !existsSync(toolPath(t)));
  if (missingTools.length > 0) return { reason: `checkers not installed: ${missingTools.map((t) => `${t.id} ${t.version}`).join(', ')} — run \`npx tsx benchmarks/floor-tools.ts\` first` };
  const missingDemos = VARIANTS.filter((v) => !existsSync(resolve(REPO_ROOT, v.bin)));
  if (missingDemos.length > 0) return { reason: `demo builds missing: ${missingDemos.map((v) => v.id).join(', ')} — run \`npm run build\` first` };
  const dir = mkdtempSync(join(tmpdir(), 'floor-'));
  try {
    return { records: VARIANTS.flatMap((v) => measure(v, dir)) };
  } catch (error) {
    return { reason: error instanceof Error ? error.message : String(error) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
