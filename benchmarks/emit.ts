/**
 * The results document, and the one rule that keeps it honest.
 *
 * `assertHonest` refuses to let a band carry a number the run did not measure. It is not
 * a style check: B1 needs a credential this repo does not have, so the tempting shape for
 * this suite is a document with an estimate in the agent rows and a footnote nobody
 * reads. An unmeasured axis that reads as measured is worse than a missing one — the
 * whole point of the suite is that the repo's public claims stop being slogans.
 *
 * The rule is structural rather than advisory: a band value must name a record in the
 * same document, produced by an axis whose status is `measured`, and equal that record's
 * median. There is no code path that writes a band value from anything else.
 */
import { BANDS, type BandSpec, type SuiteName, suiteOf } from './bands.js';
import { CLAIMS, type ClaimSpec } from './claims.js';
import { type AxisName, type AxisStatus, type BenchRecord } from './record.js';

export interface AxisState {
  status: AxisStatus;
  /** Required unless `measured`: why there is no number here. */
  reason?: string;
  /** How the axis produced its numbers, so the table can be read without the source. */
  method?: string;
}

/** Where a band value or a claim's measurement was read from. */
export interface RecordRef {
  axis: AxisName;
  variant: string;
  metric: string;
}

export interface BandEntry {
  value?: number;
  /** The record the value was read from. Absent when there is no value. */
  from?: RecordRef;
  /** Present instead of a value: `skipped` or `not-run`, with a reason. */
  status?: AxisStatus;
  reason?: string;
}

/**
 * A public claim, settled or explicitly not. `met` is absent when `status` is
 * `unmeasured`: "not measured" must never render as "false", because the two say
 * completely different things about the project.
 */
export interface ClaimEntry {
  claim: string;
  source: string;
  /** The threshold, rendered for a reader: `<= 1`, `>= 1360`. */
  target: string;
  measured?: number;
  unit?: string;
  met?: boolean;
  status?: 'unmeasured';
  reason?: string;
  from?: RecordRef;
}

export interface ResultsDoc {
  schema: 1;
  suite: SuiteName;
  measured: string;
  commit: string;
  machine: unknown;
  axes: Partial<Record<AxisName, AxisState>>;
  records: BenchRecord[];
  bands: Record<string, BandEntry>;
  claims: Record<string, ClaimEntry>;
}

const SCHEMA_VERSION = 1;

/** The record a band or a claim points at. One finder, because both point the same way. */
function findRecord(records: readonly BenchRecord[], from: RecordRef): BenchRecord | undefined {
  return records.find((r) => r.axis === from.axis && r.variant === from.variant && r.metric === from.metric);
}

const bandRef = (spec: BandSpec): RecordRef => ({ axis: spec.axis, ...spec.from });

/**
 * One band entry. A measured axis that did not produce its banded record is a bug in the
 * axis, and it throws here rather than emitting a band with no value — that failure mode
 * is indistinguishable, in the results file, from an axis that was never run.
 */
function bandEntry(spec: BandSpec, axes: ResultsDoc['axes'], records: readonly BenchRecord[]): BandEntry {
  const state = axes[spec.axis];
  if (state === undefined) return { status: 'not-run', reason: `axis ${spec.axis} was not selected` };
  if (state.status !== 'measured') return { status: state.status, reason: state.reason ?? `axis ${spec.axis} did not run` };
  const record = findRecord(records, bandRef(spec));
  if (record === undefined) {
    throw new Error(`axis ${spec.axis} reported measured but produced no ${spec.from.variant} ${spec.from.metric} record for band ${spec.id}`);
  }
  return { value: record.median, from: bandRef(spec) };
}

const renderTarget = (test: ClaimSpec['test']): string => (test.max === undefined ? `>= ${String(test.min)}` : `<= ${String(test.max)}`);

function claimEntry(spec: ClaimSpec, axes: ResultsDoc['axes'], records: readonly BenchRecord[]): ClaimEntry {
  const base = { claim: spec.claim, source: spec.source, target: renderTarget(spec.test) };
  const state = axes[spec.from.axis];
  if (state === undefined || state.status !== 'measured') {
    return { ...base, status: 'unmeasured', reason: state?.reason ?? `axis ${spec.from.axis} was not run` };
  }
  const record = findRecord(records, spec.from);
  // A measured axis that did not emit the record a claim names leaves the claim unsettled,
  // and says so. Reporting `met: false` here would blame the code for a hole in the harness.
  if (record === undefined) return { ...base, status: 'unmeasured', reason: `axis ${spec.from.axis} produced no ${spec.from.variant} ${spec.from.metric} record` };
  const met = (spec.test.max === undefined || record.median <= spec.test.max) && (spec.test.min === undefined || record.median >= spec.test.min);
  return { ...base, measured: record.median, unit: record.unit, met, from: spec.from };
}

export interface BuildInput {
  suite: SuiteName;
  commit: string;
  machine: unknown;
  axes: ResultsDoc['axes'];
  records: BenchRecord[];
  /** Injectable so a test can pin the document; defaults to now. */
  measured?: string;
}

const bandsFor = (suite: SuiteName): readonly BandSpec[] => BANDS.filter((b) => b.suite === suite);
const claimsFor = (suite: SuiteName): readonly ClaimSpec[] => CLAIMS.filter((c) => suiteOf(c.from.axis) === suite);

export function buildDocument(input: BuildInput): ResultsDoc {
  const bands = new Map(bandsFor(input.suite).map((spec) => [spec.id, bandEntry(spec, input.axes, input.records)]));
  const claims = new Map(claimsFor(input.suite).map((spec) => [spec.id, claimEntry(spec, input.axes, input.records)]));
  const doc: ResultsDoc = {
    schema: SCHEMA_VERSION,
    suite: input.suite,
    measured: input.measured ?? new Date().toISOString(),
    commit: input.commit,
    machine: input.machine,
    axes: input.axes,
    records: input.records,
    bands: Object.fromEntries(bands),
    claims: Object.fromEntries(claims),
  };
  assertHonest(doc);
  return doc;
}

/** An axis must have run to have emitted anything, and must have emitted something if it ran. */
function axisProblems(axis: AxisName, state: AxisState, doc: ResultsDoc): string[] {
  const produced = doc.records.filter((r) => r.axis === axis);
  return [
    ...(state.status !== 'measured' && (state.reason ?? '') === '' ? [`axis ${axis} is ${state.status} with no reason`] : []),
    ...(state.status === 'measured' && produced.length === 0 ? [`axis ${axis} claims "measured" but emitted no record`] : []),
    ...(state.status !== 'measured' && produced.length > 0 ? [`axis ${axis} is ${state.status} but emitted ${String(produced.length)} record(s)`] : []),
  ];
}

/** A number with no sample behind it, or one that is not a number. */
function recordProblems(record: BenchRecord, doc: ResultsDoc): string[] {
  const where = `${record.axis} ${record.variant} ${record.metric}`;
  return [
    ...(doc.axes[record.axis] === undefined ? [`${where}: no axis state for ${record.axis}`] : []),
    ...(Number.isInteger(record.samples) && record.samples >= 1 ? [] : [`${where}: ${String(record.samples)} samples`]),
    ...(Number.isFinite(record.median) && Number.isFinite(record.p95) ? [] : [`${where}: median or p95 is not a finite number`]),
  ];
}

function bandProblems(spec: BandSpec, doc: ResultsDoc): string[] {
  const entry = doc.bands[spec.id];
  if (entry === undefined) return [`band ${spec.id} is declared for this suite but missing from the document`];
  if (entry.value === undefined) {
    return entry.status !== undefined && (entry.reason ?? '') !== '' ? [] : [`band ${spec.id} has no value and no status/reason saying why`];
  }
  const state = doc.axes[spec.axis];
  if (state?.status !== 'measured') return [`band ${spec.id} carries a value but axis ${spec.axis} is ${state?.status ?? 'absent'}`];
  const record = findRecord(doc.records, bandRef(spec));
  if (record === undefined) return [`band ${spec.id} carries a value with no ${spec.from.variant} ${spec.from.metric} record behind it`];
  if (record.median !== entry.value) return [`band ${spec.id} value ${String(entry.value)} does not equal its record's median ${String(record.median)}`];
  return [];
}

function claimProblems(spec: ClaimSpec, doc: ResultsDoc): string[] {
  const entry = doc.claims[spec.id];
  if (entry === undefined) return [`claim ${spec.id} is declared for this suite but missing from the document`];
  if (entry.measured === undefined) {
    return entry.status === 'unmeasured' && (entry.reason ?? '') !== '' ? [] : [`claim ${spec.id} has no measurement and no reason saying why`];
  }
  if (entry.met === undefined) return [`claim ${spec.id} carries a measurement but no verdict`];
  if (doc.axes[spec.from.axis]?.status !== 'measured') return [`claim ${spec.id} carries a measurement but axis ${spec.from.axis} did not run`];
  const record = findRecord(doc.records, spec.from);
  if (record === undefined) return [`claim ${spec.id} carries a measurement with no record behind it`];
  if (record.median !== entry.measured) return [`claim ${spec.id} measured ${String(entry.measured)} does not equal its record's median ${String(record.median)}`];
  return [];
}

/**
 * Every way a results document could claim a measurement it does not have. Returns the
 * problems rather than throwing, so `emit.test.ts` can assert on each one by name.
 */
export function honestyProblems(doc: ResultsDoc): string[] {
  const known = new Set(bandsFor(doc.suite).map((s) => s.id));
  return [
    ...(Object.entries(doc.axes) as [AxisName, AxisState][]).flatMap(([axis, state]) => axisProblems(axis, state, doc)),
    ...doc.records.flatMap((record) => recordProblems(record, doc)),
    ...Object.keys(doc.bands)
      .filter((id) => !known.has(id))
      .map((id) => `band ${id} is not declared in bands.ts for suite ${doc.suite}`),
    ...bandsFor(doc.suite).flatMap((spec) => bandProblems(spec, doc)),
    ...claimsFor(doc.suite).flatMap((spec) => claimProblems(spec, doc)),
  ];
}

export function assertHonest(doc: ResultsDoc): void {
  const problems = honestyProblems(doc);
  if (problems.length > 0) throw new Error(`refusing to emit a dishonest results document:\n  - ${problems.join('\n  - ')}`);
}
