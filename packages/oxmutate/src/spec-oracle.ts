/**
 * Spec oracles (roadmap M3.5): a formal model's traces, replayed against the code with each mutant
 * armed, as a second and independent verdict beside the tests.
 *
 * The contract is the trace, not the method. A backend's only job is to leave `*.itf.json` files
 * (the Informal Trace Format) in a directory:
 *
 *   - `quint`: `quint run --mbt` simulates the model and writes the traces, with each step's action
 *     and nondeterministic picks, so a replay test knows what to call.
 *   - `itf`: a directory some other tool already filled (Apalache writes ITF too; so can a
 *     property-based generator). This is also how a test pins its traces.
 *
 * The project's replay tests (spec.ts) turn a trace into calls and assertions. Which mutants a
 * replay kills is reported per oracle as the F metrics of metrics.md: spec-kill share (F1), the
 * test-spec gap (F2: the spec kills, the tests miss, with the trace that did it), spec escapes
 * (F3), spec cost per mutant (F4) and mapping coverage (F6).
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { ambientRuntime, run as spawn } from 'bellpull';

export interface SpecOracle {
  name: string;
  backend: 'quint' | 'itf';
  /** `quint`: the model file, relative to the project root. */
  model?: string | undefined;
  /** `quint`: traces to generate (default 100), steps per trace (default 20), and a seed. */
  traces?: number | undefined;
  maxSteps?: number | undefined;
  seed?: string | undefined;
  /** `quint`: how to run it (default the version burgee's models.yml pins, through npx). */
  quint?: string | undefined;
  /** `itf`: the directory of traces, relative to the project root. */
  dir?: string | undefined;
  /** The replay test files (globs, relative to the root): their tests are this oracle's. */
  replay: string[];
  /** The source files the model describes (globs): the denominator of F1, F3 and F6. */
  files: string[];
}

const DEFAULT_TRACES = 100;
const DEFAULT_STEPS = 20;
const DEFAULT_QUINT = 'npx -y @informalsystems/quint@0.33.0';
/** How much of a failing quint run's output the error keeps. */
const OUTPUT_TAIL = 1000;

/** The oracle's traces on disk: generated into `work` for `quint`, the given directory for `itf`. */
export async function tracesFor(oracle: SpecOracle, root: string, work: string): Promise<string> {
  if (oracle.backend === 'itf') return path.resolve(root, oracle.dir ?? '');
  const dir = path.join(work, `spec-${oracle.name}`);
  mkdirSync(dir, { recursive: true });
  const [command = '', ...prefix] = (oracle.quint ?? DEFAULT_QUINT).split(/\s+/);
  const n = String(oracle.traces ?? DEFAULT_TRACES);
  const args = [...prefix, 'run', path.resolve(root, oracle.model ?? ''), '--mbt', '--n-traces', n, '--max-samples', n, '--max-steps', String(oracle.maxSteps ?? DEFAULT_STEPS), '--out-itf', path.join(dir, 't{seq}.itf.json')];
  if (oracle.seed) args.push('--seed', oracle.seed);
  const r = await spawn(command, args, { cwd: root, runtime: ambientRuntime() });
  if (!r.ok) throw new Error(`spec oracle ${oracle.name}: quint run exited ${String(r.code)}: ${(r.stderr || r.stdout).trim().slice(-OUTPUT_TAIL)}. fix: run the same quint command by hand on ${oracle.model ?? '(no model)'}`);
  return dir;
}

interface Located {
  id: string;
  file: string;
  line: number;
  mutatorName: string;
  replacement: string;
}

/** One oracle's F metrics (metrics.md §6), over the mutants in the files its model describes. */
export interface SpecSummary {
  name: string;
  backend: SpecOracle['backend'];
  traces: number;
  /** Mutants in the modelled files that are scored (not ignored). */
  modelled: number;
  /** F6: share of those a replay test reaches. */
  mappingCoverage: number;
  /** F1: share of those the spec kills. */
  specKillShare: number;
  /** F2: the spec kills them, the tests do not — each a missing test, with the trace that found it. */
  testSpecGap: (Located & { trace: string })[];
  /** F3: neither kills them — gaps in the model itself, or equivalent mutants. */
  specEscapes: Located[];
  /** F4: median ms of one replay execution with a mutant armed. */
  msPerSpecExecution: number;
}

export interface SpecMutant extends Located {
  status: string;
  specCoveredBy?: string[] | undefined;
  spec?: { oracle: string; status: string; killedBy?: string[] | undefined } | undefined;
}

const PERCENT = 100;
const share = (n: number, of: number): number => (of ? (PERCENT * n) / of : 0);
const located = ({ id, file, line, mutatorName, replacement }: Located): Located => ({ id, file, line, mutatorName, replacement });
const median = (xs: number[]): number => {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted.length ? (sorted[Math.floor(sorted.length / 2)] ?? 0) : 0;
};

const testsMiss = (m: SpecMutant): boolean => m.status === 'Survived' || m.status === 'NoCoverage';

export interface SpecInput {
  oracle: SpecOracle;
  /** Repository-relative paths of the files the model describes. */
  modelledFiles: Set<string>;
  traces: number;
  mutants: SpecMutant[];
  /** A replay test's name (it names the trace) from its id. */
  testName: (id: string) => string;
  /** Each replay execution's ms, mutant armed. */
  specMs: number[];
}

export function summarizeSpec({ oracle, modelledFiles, traces, mutants, testName, specMs }: SpecInput): SpecSummary {
  const here = mutants.filter((m) => modelledFiles.has(m.file) && m.status !== 'Ignored');
  const reached = here.filter((m) => m.specCoveredBy?.length);
  const killed = here.filter((m) => m.spec?.status === 'Killed');
  return {
    name: oracle.name,
    backend: oracle.backend,
    traces,
    modelled: here.length,
    mappingCoverage: share(reached.length, here.length),
    specKillShare: share(killed.length, here.length),
    testSpecGap: killed.filter(testsMiss).map((m) => ({ ...located(m), trace: testName(m.spec?.killedBy?.[0] ?? '') })),
    specEscapes: here.filter((m) => testsMiss(m) && m.spec?.status !== 'Killed').map(located),
    msPerSpecExecution: median(specMs),
  };
}
