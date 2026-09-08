/**
 * R2, R3, R6 — the whole truth table, enumerated rather than sampled.
 *
 * The design asks for "value source × TTY × CI × --json × --yes × --interactive", so this
 * generates all 256 of those and asserts the verdict for each from the rule stated in
 * `decide.ts`, rather than from a list of expectations written by the same hand that wrote
 * the code. Then the cases that matter most are spelled out again, by name, because a
 * generated table proves consistency and a named case proves intent.
 *
 * The one that would be a bug report if it broke: **no terminal and no value is never a
 * prompt.** That is the difference between a CLI an agent can drive and one that hangs.
 */
import { describe, expect, it } from 'vitest';

import { decide, type Flags, type Runtime } from './decide.js';
import { type PromptKind, type PromptSpec } from './spec.js';

const text: PromptSpec = { kind: 'text', message: 'Where should it go?' };
const confirm: PromptSpec = { kind: 'confirm', message: 'Overwrite it?' };

const rt = (stdin: boolean, ci = false): Runtime => ({ env: ci ? { CI: 'true' } : {}, isTTY: { stdin } });

describe('R2 · a value from any source is never prompted for', () => {
  it.each([
    ['a string', 'dist'],
    ['an empty string, which is an answer', ''],
    ['false, which is an answer', false],
    ['zero, which is an answer', 0],
    ['an empty array', []],
  ])('%s skips, even with a terminal and --interactive', (_name, value) => {
    expect(decide({ value, spec: text, option: 'out', runtime: rt(true), flags: { interactive: true }, required: true })).toEqual({ action: 'skip' });
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
  ])('%s is not an answer', (_name, value) => {
    expect(decide({ value, spec: text, option: 'out', runtime: rt(true), required: true }).action).toBe('prompt');
  });
});

describe('R6 · --json never prompts, terminal or not', () => {
  it.each([true, false])('with isTTY.stdin=%s it refuses and names the flag', (stdin) => {
    const d = decide({ value: undefined, spec: text, option: 'out', runtime: rt(stdin), flags: { json: true }, required: true });
    expect(d.action).toBe('error');
    expect(d.code).toBe('USAGE');
    expect(d.message).toContain('--out');
    expect(d.fix).toContain('--json means no one is here');
    // The question is carried into the refusal: an agent should not have to read the source.
    expect(d.fix).toContain('Where should it go?');
  });

  it('outranks --yes and --interactive, which cannot make a machine type', () => {
    const flags: Flags = { json: true, yes: true, interactive: true };
    expect(decide({ value: undefined, spec: confirm, option: 'force', runtime: rt(true), flags, required: true }).action).toBe('error');
  });
});

describe('R3 · --yes answers a confirm, and only a confirm', () => {
  it('answers true without asking', () => {
    expect(decide({ value: undefined, spec: confirm, option: 'force', runtime: rt(true), flags: { yes: true }, required: true })).toEqual({ action: 'answer', value: true });
  });

  it('answers even where there is no terminal — nothing has to be typed', () => {
    expect(decide({ value: undefined, spec: confirm, option: 'force', runtime: rt(false), flags: { yes: true }, required: true })).toEqual({ action: 'answer', value: true });
  });

  it.each<PromptKind>(['text', 'select', 'multiselect', 'password', 'path'])('does not invent a %s', (kind) => {
    const spec = { kind, message: 'well?', ...(kind === 'select' || kind === 'multiselect' ? { choices: [{ value: 'a' }] } : {}) } as PromptSpec;
    expect(decide({ value: undefined, spec, option: 'out', runtime: rt(false), flags: { yes: true }, required: true }).action).toBe('error');
  });
});

describe('R2 · with nobody there, a missing value is an error and never a wait', () => {
  it.each([
    ['no terminal on stdin', rt(false)],
    ['CI set, terminal or not', rt(true, true)],
  ])('%s refuses, naming the flag and the question', (_name, runtime) => {
    const d = decide({ value: undefined, spec: text, option: 'output-dir', runtime, required: true });
    expect(d.action).toBe('error');
    expect(d.message).toContain('--output-dir');
    expect(d.fix).toContain('pass --output-dir');
    expect(d.fix).toContain('Where should it go?');
  });

  it('says so when --interactive was asked for, rather than looking ignored', () => {
    const d = decide({ value: undefined, spec: text, option: 'out', runtime: rt(false), flags: { interactive: true }, required: true });
    expect(d.action).toBe('error');
    expect(d.message).toContain('--interactive needs a terminal on stdin');
  });
});

describe('R3 · --interactive reaches past "would not have asked", never past "no one to ask"', () => {
  it('prompts for an optional option it would otherwise skip', () => {
    expect(decide({ value: undefined, spec: text, option: 'out', runtime: rt(true), required: false }).action).toBe('skip');
    expect(decide({ value: undefined, spec: text, option: 'out', runtime: rt(true), flags: { interactive: true }, required: false }).action).toBe('prompt');
    expect(decide({ value: undefined, spec: text, option: 'out', runtime: rt(true), flags: { interactiveAll: true }, required: false }).action).toBe('prompt');
  });
});

// ---------------------------------------------------------------------------
// The table itself: every combination, checked against the rule rather than a list.
// ---------------------------------------------------------------------------

const BOOLS = [false, true];
/** The axes the design names, in the order it names them. */
const AXES = ['stdin', 'ci', 'json', 'yes', 'interactive', 'required'] as const;
type Axis = (typeof AXES)[number];
type Row = Record<Axis, boolean>;

/** Every combination of the six booleans — the cartesian product, not a sample. */
const COMBINATIONS: Row[] = AXES.reduce<Row[]>((rows, axis) => rows.flatMap((row) => BOOLS.map((on) => ({ ...row, [axis]: on }))), [{} as Row]);

const VALUES: [name: string, value: unknown][] = [
  ['missing', undefined],
  ['supplied', 'dist'],
];
const KINDS = ['text', 'confirm'] as const;

/** The rule from `decide.ts`'s doc comment, written once more, independently. */
function expected(value: unknown, kind: PromptKind, row: Row): string {
  if (value !== undefined) return 'skip';
  if (row.json) return 'error';
  if (row.yes && kind === 'confirm') return 'answer';
  if (!row.stdin || row.ci) return 'error';
  return row.required || row.interactive ? 'prompt' : 'skip';
}

interface Checked {
  label: string;
  got: string;
  want: string;
}

function check(valueName: string, value: unknown, kind: PromptKind, row: Row): Checked {
  const flags: Flags = { json: row.json, yes: row.yes, interactive: row.interactive };
  const runtime: Runtime = { env: row.ci ? { CI: '1' } : {}, isTTY: { stdin: row.stdin } };
  const got = decide({ value, spec: { kind, message: 'well?' }, option: 'out', runtime, flags, required: row.required }).action;
  const label = `${valueName} ${kind} ${AXES.map((a) => `${a}=${row[a]}`).join(' ')}`;
  return { label, got, want: expected(value, kind, row) };
}

const ROWS: Checked[] = VALUES.flatMap(([valueName, value]) => KINDS.flatMap((kind) => COMBINATIONS.map((row) => check(valueName, value, kind, row))));

describe('the whole table', () => {
  it('covers every combination the design names', () => {
    expect(ROWS).toHaveLength(VALUES.length * KINDS.length * 2 ** AXES.length);
  });

  it('every row matches the stated rule', () => {
    expect(ROWS.filter((r) => r.got !== r.want).map((r) => `${r.label}: got ${r.got}, want ${r.want}`)).toEqual([]);
  });

  it('never prompts without a terminal — the one that would be a bug report', () => {
    expect(ROWS.filter((r) => r.label.includes('stdin=false') && r.got === 'prompt'), 'a prompt with no terminal is a hang').toEqual([]);
  });

  it('never prompts under --json, and never under CI', () => {
    expect(ROWS.filter((r) => r.label.includes('json=true') && r.got === 'prompt')).toEqual([]);
    expect(ROWS.filter((r) => r.label.includes('ci=true') && r.got === 'prompt')).toEqual([]);
  });
});
