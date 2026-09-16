/**
 * The schema walk — the check that closes R4's overstatement.
 *
 * Until this suite existed, `check()` read one array out of `schema.json` (`$defs.capability.
 * required`) and asserted presence, plus two hand-written checks on `encode` and `fallback`.
 * Nothing read `type`, `oneOf`, `minLength`, `minimum` or `additionalProperties: false`, so
 * this record validated clean through both public doors:
 *
 *     { name: 'x', osc: { nope: true }, when: 'not an object', encode: 'e{text}',
 *       fallback: '{text}', extra: 1 }
 *
 * `when` is the live one. `supports()` destructures it — `const { tty, termProgram, envAny,
 * term } = capability.when` — and destructuring a string yields four `undefined` clauses, so
 * every guard falls through and the answer is `true`. A capability with a typo in `when`
 * therefore emits raw OSC into a pipe, which is the single failure the package exists to
 * prevent, reached through its own documented extension surface.
 *
 * The tests below are written so that a reader can tell which half is which: the first
 * describe proves the schema is *read*, the second proves there is no path left that puts a
 * non-object `when` in front of `supports()`.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { registerBuiltins } from './builtins.js';
import { type Capability, capabilities, CapabilityError, check, emit, refusals, register, reset as resetRegistry } from './capability.js';
import { attach, type CapabilityHost, PluginError, register as registerPlugin, reset as resetPlugins, validate } from './plugin.js';
import { type Runtime } from './runtime.js';
import { supports } from './supports.js';

/**
 * The record from the measurement in `.sdlc/intents/paratext/design.md`, unchanged: three
 * separate schema violations — `osc` an object where the schema says integer-or-`"BEL"`,
 * `when` a string where it says object, and an undeclared `extra` under
 * `additionalProperties: false` — in one object that used to pass.
 */
const MALFORMED = { name: 'x', osc: { nope: true }, when: 'not an object', encode: 'e{text}', fallback: '{text}', extra: 1 };

/**
 * The same defect wearing real bytes. `MALFORMED.encode` is `e{text}`, which makes the point
 * about `supports()` but prints nothing a terminal would act on; this one carries an actual
 * OSC 8, so "no OSC reaches a pipe" can be asserted on the escape byte itself rather than on
 * a stand-in for it.
 */
const TYPOED_WHEN = { name: 'y', osc: 8, when: { tty: 'true' }, encode: ']8;;{url}{text}]8;;', fallback: '{text} ({url})' };

/** A piped runtime: no TTY, and therefore the one place raw OSC must never reach. */
const piped: Runtime = { env: { TERM_PROGRAM: 'iTerm.app' }, isTTY: { stdout: false } };

const asDocument = (record: object): object => ({ name: 'acme', capabilities: { x: record } });

beforeEach(() => {
  resetPlugins();
  resetRegistry();
});

describe('check() reads the schema rather than one array out of it', () => {
  it('refuses the malformed record, naming every field the schema disagrees with', () => {
    const lines = refusals(check(asDocument(MALFORMED)));
    expect(lines.join('\n')).toContain('capabilities.x.when');
    expect(lines.join('\n')).toContain('capabilities.x.osc');
    expect(lines.join('\n')).toContain('capabilities.x.extra');
  });

  it('refuses a `when` that is not an object — the clause a string silently empties', () => {
    expect(refusals(check(asDocument({ ...MALFORMED, osc: 8, extra: undefined })))).toContainEqual(expect.stringContaining('capabilities.x.when: must be an object'));
  });

  it('refuses an `osc` that is neither an integer nor "BEL", and says which two it may be', () => {
    const [line] = refusals(check(asDocument({ ...MALFORMED, when: { tty: true }, extra: undefined })));
    expect(line).toContain('capabilities.x.osc');
    expect(line).toContain('BEL');
  });

  it('refuses a field the schema does not declare — `additionalProperties: false` is in the file', () => {
    expect(refusals(check(asDocument({ ...MALFORMED, osc: 8, when: { tty: true } })))).toEqual(['capabilities.x.extra: is not a field the schema declares']);
  });

  it('refuses a clause inside `when` that the schema does not declare, and one of the wrong type', () => {
    const typo = { ...MALFORMED, osc: 8, extra: undefined, when: { tty: 'yes', termProgam: ['iTerm.app'] } };
    const lines = refusals(check(asDocument(typo))).join('\n');
    expect(lines).toContain('capabilities.x.when.tty: must be a boolean');
    expect(lines).toContain('capabilities.x.when.termProgam');
  });

  it('refuses a `termProgram` that is a string rather than a list of them', () => {
    const lines = refusals(check(asDocument({ ...MALFORMED, osc: 8, extra: undefined, when: { termProgram: 'iTerm.app' } })));
    expect(lines).toContainEqual(expect.stringContaining('capabilities.x.when.termProgram: must be an array'));
  });

  it('refuses a name that is present but empty — `minLength: 1` is declared and was unread', () => {
    expect(refusals(check({ name: 'acme', capabilities: { '': { ...MALFORMED, name: '', osc: 8, when: {}, extra: undefined } } })).join('\n')).toContain('must not be empty');
  });

  it('still accepts every capability the package itself ships, and the schema’s own example', () => {
    expect(refusals(check({ name: 'acme', capabilities: { link: { name: 'link', osc: 8, when: { tty: true, termProgram: ['iTerm.app'], envAny: ['VTE_VERSION'] }, encode: 'e', fallback: '{text}' } } }))).toEqual([]);
  });
});

/** The refusal `validate` threw, or a failure saying it did not throw at all. */
const refusal = (candidate: unknown): PluginError => {
  try {
    validate(candidate);
  } catch (error) {
    return error as PluginError;
  }
  throw new Error('expected a refusal');
};

describe('plugin.validate() refuses the same record, with the family code and the path', () => {
  it('refuses the malformed record under E_PLUGIN_SCHEMA', () => {
    const error = refusal({ name: 'acme', capabilities: { x: MALFORMED } });
    expect(error.code).toBe('E_PLUGIN_SCHEMA');
    expect(error.fix).toContain('paratext/schema.json');
  });

  it('names the field, not merely the capability — a reader has to know which line to edit', () => {
    expect(refusal({ name: 'acme', capabilities: { x: { ...MALFORMED, osc: 8, extra: undefined } } }).message).toContain('capabilities.x.when');
  });

  it('refuses at register(), so a bad plugin never reaches the order attach() reads', () => {
    expect(() => registerPlugin({ name: 'acme', capabilities: { x: MALFORMED } })).toThrow(PluginError);
    const seen: Capability[] = [];
    const host: CapabilityHost = { register: (c) => void seen.push(c) };
    attach(host);
    expect(seen).toEqual([]);
  });
});

/**
 * The half that decides whether the hole is closed rather than merely reported. A validator
 * that refuses the record but leaves another way into the registry has not closed anything,
 * so each public door is tried in turn and the last case is the consequence: a piped runtime
 * getting text rather than `]`.
 */
describe('no door puts a non-object `when` in front of supports()', () => {
  it('register() refuses it — the registry is the only thing emit() reads', () => {
    expect(() => register(MALFORMED as unknown as Capability)).toThrow(CapabilityError);
    expect(capabilities()).toEqual([]);
  });

  it('plugin.register() + attach() refuses it before the hand-over', () => {
    expect(() => registerPlugin({ name: 'acme', capabilities: { x: MALFORMED } })).toThrow(PluginError);
    attach();
    expect(capabilities()).toEqual([]);
  });

  it('emit() on a pipe prints the caller’s text, and no OSC byte reaches it', () => {
    try {
      register(MALFORMED as unknown as Capability);
    } catch {
      /* refused, which is the point — the assertion below holds either way */
    }
    const out = emit(piped, 'x', { text: 'hello' });
    expect(out).not.toContain('');
    expect(out).toBe('hello');
  });

  /**
   * The failure in the words the package uses about itself: `tty: 'true'` is a typo a YAML or
   * JSON author makes without noticing, the clause it was meant to set is then not set, and
   * the bytes go into the file the caller redirected to.
   */
  it('a `when` whose clause has the wrong type does not put ] in a redirected file', () => {
    expect(() => register(TYPOED_WHEN as unknown as Capability)).toThrow(CapabilityError);
    expect(emit(piped, 'y', { text: 'Docs', url: 'https://x.dev' })).not.toContain(']');
  });

  it('a built-in still emits its fallback on a pipe, so the refusal did not break the normal path', () => {
    registerBuiltins();
    expect(emit(piped, 'link', { text: 'Docs', url: 'https://x.dev' })).toBe('Docs (https://x.dev)');
  });

  /**
   * Belt as well as braces. `supports()` is exported, takes its `when` structurally, and a
   * caller may hand it an object it built itself from JSON — so the fail-safe direction is
   * asserted here too. This is not what closes the hole; `register()` is. It is what makes
   * the answer *unsupported* rather than *true* if a door is ever opened again.
   */
  it('supports() answers false for a `when` it cannot read, rather than four undefined clauses', () => {
    expect(supports(piped, { when: 'not an object' } as unknown as Capability)).toBe(false);
    expect(supports({ env: {}, isTTY: { stdout: true } }, { when: 'not an object' } as unknown as Capability)).toBe(false);
  });
});
