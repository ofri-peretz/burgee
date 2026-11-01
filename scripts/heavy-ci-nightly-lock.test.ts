/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — heavy work does not run during CI/CD; it runs on a nightly schedule
 * (D-20261101-heavy-ci-runs-nightly). The owner, 2026-11-01: "ensure we're not running heavy
 * tasks during CI-CD, benchmarks, etc should be running through a scheduler over night".
 *
 * Before this, `bench.yml` measured on every pull request and every push to `main`, and each push
 * opened or extended a `chore/bench-series` PR whose merge was the next push: one observation PR
 * every 20–30 minutes, each starting more CI and superseding release runs. `compat.yml` ran its
 * 13-job OS × Node matrix (about 92 job-minutes) on every pull request and about 103 on every push.
 *
 * What is held:
 *  - every job in `HEAVY` reports nothing on a push or an unlabelled pull request — evaluated from
 *    the workflow's `on:` and the job's own `if:`, not matched as text;
 *  - every check `main`'s branch protection requires (`REQUIRED`, as the owner set it on
 *    2026-11-01) is still produced by a job that runs on a pull request, under its exact name —
 *    the compat matrix's three Node 24 cells among them. A required check that never reports
 *    blocks every merge, so moving one of these to the night is the failure this guards;
 *  - the heavy workflows run on a nightly cron between 03:00 and 05:00 UTC, at staggered times,
 *    and a nightly failure opens or updates an issue;
 *  - the gates stay where they were: `Quality Gate` and `Quality (Full) Gate` still report on a
 *    push to `main` (release.yml's verify waits for exactly those two), the compatibility ratchet
 *    still reports on every pull request and queue entry, and B4 weight still gates a pull request.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { load as loadYaml } from 'js-yaml';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

interface Step {
  name?: string;
  run?: string;
  if?: string;
}
interface Job {
  name?: string;
  if?: string;
  needs?: string | string[];
  permissions?: Record<string, string>;
  strategy?: { matrix?: { os?: unknown } };
  steps?: Step[];
}
interface Workflow {
  on: Record<string, unknown>;
  jobs: Record<string, Job>;
}

const read = (file: string): Workflow => loadYaml(readFileSync(join(REPO_ROOT, '.github/workflows', file), 'utf8')) as Workflow;

/** The event a job is asked about. Everything a job-level `if:` here may read. */
export interface Event {
  event_name: string;
  labels?: string[];
  /** `github.event.schedule`: the cron string on a scheduled run, `null` on every other event. */
  schedule?: string;
  inputs?: Record<string, unknown>;
}

/**
 * GitHub's expression grammar, as far as the job conditions in these workflows use it: `||`,
 * `&&`, `!`, parentheses, `==`/`!=`, string literals, and the calls `contains`, `fromJSON`,
 * `format` and `always`. A term this does not know throws, so a condition cannot pass by being
 * unreadable. `needs.affected.outputs.*` reads as the worst case for a pull request: every
 * package affected, `compat-oracle` among them.
 */
const truthy = (v: unknown): boolean => v !== '' && v !== false && v !== null && v !== undefined && v !== 0;

export function evaluate(source: string, ev: Event): unknown {
  const expression = source.trim().replace(/^\$\{\{([\s\S]*)\}\}$/u, '$1').trim();
  const parts = expression.match(/'[^']*'|\|\||&&|==|!=|!|\(|\)|,|[\w.*:-]+/gu) ?? [];
  let i = 0;
  const peek = (): string | undefined => parts[i];
  const take = (want?: string): string => {
    const t = parts[i++];
    if (t === undefined || (want !== undefined && t !== want)) throw new Error(`unexpected ${String(t)} in ${expression}`);
    return t;
  };
  const args = (): unknown[] => {
    take('(');
    const out: unknown[] = [];
    while (peek() !== ')') {
      out.push(or());
      if (peek() === ',') take(',');
    }
    take(')');
    return out;
  };
  const term = (t: string): unknown => {
    const pr = ev.event_name === 'pull_request';
    switch (t) {
      case 'github.event_name':
        return ev.event_name;
      case 'github.event.schedule':
        return ev.event_name === 'schedule' ? (ev.schedule ?? null) : null;
      case 'github.event.pull_request.labels.*.name':
        return pr ? (ev.labels ?? []) : null;
      case 'github.event.pull_request.draft':
        return pr ? false : null;
      case 'needs.affected.outputs.full':
        return 'true';
      case 'needs.affected.outputs.packages':
        return '["compat-oracle","burgee"]';
      // codeql.yml's `gate` job: `run=true` for any non-draft pull request, which is what is asked here.
      case 'needs.gate.outputs.run':
        return 'true';
    }
    if (t.startsWith('inputs.')) return ev.event_name === 'workflow_dispatch' ? (ev.inputs?.[t.slice('inputs.'.length)] ?? null) : null;
    throw new Error(`${t} is not a term this lock knows the meaning of (in ${expression})`);
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
    if (t === 'true' || t === 'false') return t === 'true';
    if (t === 'always') return (args(), true);
    if (t === 'fromJSON') return JSON.parse(String(args()[0]));
    if (t === 'format') {
      const [fmt, ...rest] = args();
      return String(fmt).replaceAll(/\{(\d+)\}/gu, (_, n: string) => String(rest[Number(n)]));
    }
    if (t === 'contains') {
      const [hay, needle] = args();
      if (Array.isArray(hay)) return hay.includes(needle);
      return typeof hay === 'string' && hay.includes(String(needle));
    }
    return term(t);
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

/** Whether a job starts at all for an event: its workflow subscribes to the event, and its `if:` holds. */
function runs(wf: Workflow, job: string, ev: Event): boolean {
  if (!(ev.event_name in wf.on)) return false;
  const cond = wf.jobs[job]?.if;
  return cond === undefined ? true : truthy(evaluate(cond, ev));
}

/**
 * The heavy jobs: benchmarks, the off-Linux and floor-Node compat cells, the paid evals and the
 * full mutation run. `bench.yml`'s `agent` may still run on a pull request the owner labels
 * `bench:agent` — the label is the request to spend — and nowhere else outside the schedule.
 */
const HEAVY: { file: string; job: string }[] = [
  { file: 'bench.yml', job: 'cheap' },
  { file: 'bench.yml', job: 'floor' },
  { file: 'bench.yml', job: 'agent' },
  { file: 'compat.yml', job: 'controls' },
  { file: 'compat.yml', job: 'floor' },
  { file: 'evals.yml', job: 'evals' },
  { file: 'mutation.yml', job: 'full' },
];

/** What CI/CD is: a push to `main`, a pull request however it is labelled for review, a queue entry. */
const CI_EVENTS: Event[] = [
  { event_name: 'push' },
  { event_name: 'merge_group' },
  { event_name: 'pull_request', labels: [] },
  { event_name: 'pull_request', labels: ['skip-changeset'] },
  { event_name: 'pull_request', labels: ['documentation', 'skip-changeset'] },
];

describe('no heavy job runs during CI/CD (D-20261101-heavy-ci-runs-nightly)', () => {
  for (const { file, job } of HEAVY) {
    it(`${file} → ${job} does not start on a push, a pull request or a queue entry`, () => {
      const wf = read(file);
      expect(wf.jobs[job], `${file} has no \`${job}\` job — renaming a heavy job must move this list with it`).toBeDefined();
      for (const ev of CI_EVENTS) expect(runs(wf, job, ev), `${file} → ${job} on ${JSON.stringify(ev)}`).toBe(false);
    });
  }

  it('a pull request labelled run-full-ci can still ask for the whole compat matrix', () => {
    const wf = read('compat.yml');
    const ev: Event = { event_name: 'pull_request', labels: ['run-full-ci'] };
    expect(evaluate(String(wf.jobs['matrix']?.strategy?.matrix?.os), ev)).toEqual(['ubuntu-latest', 'macos-latest', 'windows-latest']);
    expect(runs(wf, 'floor', ev)).toBe(true);
    expect(runs(wf, 'controls', ev)).toBe(true);
  });

  it('bench.yml and compat.yml no longer subscribe to a push at all', () => {
    expect(Object.keys(read('bench.yml').on)).not.toContain('push');
    expect(Object.keys(read('compat.yml').on)).not.toContain('push');
    expect(Object.keys(read('evals.yml').on)).not.toContain('pull_request');
  });
});

/** The nightly crons: `minute hour * * *`. */
const nightly = (wf: Workflow): string[] => {
  const s = (wf.on['schedule'] ?? []) as { cron: string }[];
  return s.map((c) => c.cron).filter((c) => /^\d+ \d+ \* \* \*$/u.test(c));
};
const minuteOfDay = (cron: string): number => {
  const [m, h] = cron.split(' ').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

describe('the heavy work runs over night, and a failed night is loud', () => {
  const NIGHTLY = ['bench.yml', 'compat.yml'];

  it.each(NIGHTLY)('%s runs once a night between 03:00 and 05:00 UTC', (file) => {
    const crons = nightly(read(file));
    expect(crons, `${file} has no daily cron`).toHaveLength(1);
    expect(minuteOfDay(crons[0]!)).toBeGreaterThanOrEqual(3 * 60);
    expect(minuteOfDay(crons[0]!)).toBeLessThan(5 * 60);
  });

  it('the nightly runs are staggered, so they do not ask the shared runner pool at once', () => {
    const times = NIGHTLY.map((f) => minuteOfDay(nightly(read(f))[0]!));
    expect(new Set(times).size).toBe(times.length);
  });

  it.each(NIGHTLY)('%s opens or updates an issue when a nightly run fails', (file) => {
    const wf = read(file);
    const reporters = Object.values(wf.jobs).filter(
      (j) => j.permissions?.['issues'] === 'write' && /github\.event_name == 'schedule'/u.test(j.if ?? '') && /failure/u.test(j.if ?? ''),
    );
    expect(reporters, `${file} has no job that reports a failed nightly run`).toHaveLength(1);
    const body = (reporters[0]!.steps ?? []).map((s) => s.run ?? '').join('\n');
    expect(body).toContain('gh issue create');
    expect(body).toContain('gh issue comment');
  });

  it('bench.yml lands at most one observation a night: only the scheduled run lands', () => {
    const land = read('bench.yml').jobs['cheap']?.steps?.find((s) => /^Land the day's observations/u.test(s.name ?? ''));
    expect(land?.if).toBe("github.event_name == 'schedule'");
  });

  it('B1 stays weekly: the nightly cron does not start the paid agent job', () => {
    const wf = read('bench.yml');
    const [daily] = nightly(wf);
    const weekly = ((wf.on['schedule'] ?? []) as { cron: string }[]).map((c) => c.cron).find((c) => c !== daily);
    expect(runs(wf, 'agent', { event_name: 'schedule', schedule: daily })).toBe(false);
    expect(runs(wf, 'agent', { event_name: 'schedule', schedule: weekly })).toBe(true);
    expect(runs(wf, 'cheap', { event_name: 'schedule', schedule: daily })).toBe(true);
    expect(runs(wf, 'cheap', { event_name: 'schedule', schedule: weekly }), 'the weekly B1 cron would land a second observation that day').toBe(false);
  });
});

describe('the gates stay on CI/CD', () => {
  it('a push to main still produces both gates release.yml waits for', () => {
    const release = readFileSync(join(REPO_ROOT, '.github/workflows/release.yml'), 'utf8');
    const checks = /CHECKS: "([^"]+)"/u.exec(release)?.[1]?.split('|') ?? [];
    expect(checks).toEqual(['Quality Gate', 'Quality (Full) Gate']);
    const push: Event = { event_name: 'push' };
    for (const [file, name] of [['quality.yml', 'Quality Gate'], ['quality-full.yml', 'Quality (Full) Gate']] as const) {
      const wf = read(file);
      const key = Object.keys(wf.jobs).find((k) => wf.jobs[k]?.name === name);
      expect(key, `${file} reports no \`${name}\``).toBeDefined();
      expect((wf.on['push'] as { branches?: string[] } | undefined)?.branches).toEqual(['main']);
      expect(runs(wf, key!, push), `${name} on a push to main`).toBe(true);
      for (const need of [wf.jobs[key!]?.needs ?? []].flat()) expect(runs(wf, need, push), `${name} needs ${need}, which no longer runs on a push`).toBe(true);
    }
  });

  it("the compatibility ratchet, a required check, still reports on every pull request and queue entry", () => {
    const wf = read('compat.yml');
    expect(wf.jobs['ratchet']?.name).toBe("Ratchet · each host's suite against burgee");
    for (const ev of CI_EVENTS.filter((e) => e.event_name !== 'push')) expect(runs(wf, 'ratchet', ev), JSON.stringify(ev)).toBe(true);
  });

  it('B4 weight (and the byte-exact reliability and floor ratchets) gate every pull request', () => {
    const wf = read('bench.yml');
    const key = Object.keys(wf.jobs).find((k) => (wf.jobs[k]?.steps ?? []).some((s) => /npm run bench -- .*--axis weight .*--check/u.test(s.run ?? '')) && runs(wf, k, { event_name: 'pull_request', labels: [] }));
    expect(key, 'no job runs `--axis weight --check` on a pull request').toBeDefined();
    const commands = (wf.jobs[key!]?.steps ?? []).map((s) => s.run ?? '').join('\n');
    expect(commands).toMatch(/--axis reliability/u);
    expect(commands).toMatch(/--axis floor --check/u);
    // Runner-noisy axes measure milliseconds, which are a property of the box: those are nightly.
    expect(commands).not.toMatch(/--axis (?:perf|compat|runtime|agent)\b/u);
  });
});

/**
 * `main`'s required status checks, exactly as the owner set them on 2026-11-01 (strict off). Read
 * with `gh api repos/ofri-peretz/burgee/branches/main/protection --jq
 * '.required_status_checks.contexts'`. A check that is required and never reports holds every pull
 * request at BLOCKED with nothing failing, so none of these may leave `pull_request` or be renamed.
 */
const REQUIRED = [
  'Quality Gate',
  'Quality (Full) Gate',
  "Ratchet · each host's suite against burgee",
  'Node 24 · ubuntu-latest',
  'Node 24 · macos-latest',
  'Node 24 · windows-latest',
  'CodeQL',
  'Changeset present',
  'bash, zsh, fish, pwsh complete the demo',
];

const WORKFLOWS = readdirSync(join(REPO_ROOT, '.github/workflows')).filter((f) => f.endsWith('.yml'));

/** A matrix value as a list: a literal array, or an expression that evaluates to one for this event. */
function matrixValues(value: unknown, ev: Event): unknown[] | undefined {
  if (Array.isArray(value)) return value as unknown[];
  if (typeof value === 'string') {
    const v = evaluate(value, ev);
    return Array.isArray(v) ? (v as unknown[]) : undefined;
  }
  return undefined;
}

/** The check names a job reports for one event: its `name:` with `${{ matrix.* }}` expanded over the matrix. */
function checkNames(key: string, job: Job, ev: Event): string[] {
  const name = job.name ?? key;
  const matrix = (job.strategy?.matrix ?? {}) as Record<string, unknown>;
  let names = [name];
  for (const [axis, raw] of Object.entries(matrix)) {
    if (axis === 'include' || axis === 'exclude') continue;
    if (!name.includes(`matrix.${axis}`)) continue;
    const values = matrixValues(raw, ev);
    if (values === undefined) return [];
    names = names.flatMap((n) => values.map((v) => n.replaceAll(new RegExp(`\\$\\{\\{ matrix\\.${axis} \\}\\}`, 'gu'), String(v))));
  }
  return names.filter((n) => !n.includes('${{'));
}

/**
 * Every check name a pull request produces, with the job that produces it. `CodeQL` is not a job
 * name: GitHub code scanning reports it from the SARIF a `github/codeql-action/analyze` step uploads.
 */
/** Whether a job starts for an event; a condition this lock cannot read vouches for nothing. */
function startsSafely(wf: Workflow, key: string, ev: Event): boolean {
  try {
    return runs(wf, key, ev);
  } catch {
    return false;
  }
}

/** The names one job reports: its expanded `name:`, plus `CodeQL` when it uploads a CodeQL analysis. */
function reported(key: string, job: Job, ev: Event): string[] {
  const uploadsCodeql = (job.steps ?? []).some((st) => /github\/codeql-action\/analyze@/u.test((st as { uses?: string }).uses ?? ''));
  return [...checkNames(key, job, ev), ...(uploadsCodeql ? ['CodeQL'] : [])];
}

function producedOn(ev: Event): Map<string, string> {
  const out = new Map<string, string>();
  for (const file of WORKFLOWS) {
    const wf = read(file);
    if (typeof wf.on !== 'object' || !(ev.event_name in wf.on)) continue;
    for (const [key, job] of Object.entries(wf.jobs ?? {})) {
      if (!startsSafely(wf, key, ev)) continue;
      for (const n of reported(key, job, ev)) out.set(n, `${file} → ${key}`);
    }
  }
  return out;
}

describe("every check main's branch protection requires still reports on a pull request", () => {
  const PRS: Event[] = [
    { event_name: 'pull_request', labels: [] },
    { event_name: 'pull_request', labels: ['skip-changeset'] },
  ];

  for (const ev of PRS) {
    const produced = producedOn(ev);
    it.each(REQUIRED)(`%s (labels ${JSON.stringify(ev.labels)})`, (check) => {
      expect(produced.get(check), `no job that runs on a pull request reports \`${check}\` — a required check that never reports blocks every merge`).toBeDefined();
    });
  }

  it('reads the matrix: the compat cells are named per OS, and all three run on a pull request', () => {
    const produced = producedOn({ event_name: 'pull_request', labels: [] });
    for (const os of ['ubuntu-latest', 'macos-latest', 'windows-latest']) expect(produced.get(`Node 24 · ${os}`)).toBe('compat.yml → matrix');
  });

  it('is not blind: narrowing the compat matrix to Linux on a pull request drops two required checks', () => {
    const wf = read('compat.yml');
    const narrowed = "${{ fromJSON(github.event_name == 'pull_request' && '[\"ubuntu-latest\"]' || '[\"ubuntu-latest\",\"macos-latest\",\"windows-latest\"]') }}";
    const job = { ...wf.jobs['matrix']!, strategy: { matrix: { ...wf.jobs['matrix']!.strategy!.matrix, os: narrowed } } };
    const names = checkNames('matrix', job, { event_name: 'pull_request', labels: [] });
    expect(names).toEqual(['Node 24 · ubuntu-latest']);
  });
});
