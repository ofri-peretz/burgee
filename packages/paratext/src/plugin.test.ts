/**
 * The plugin host — `plugin-contract` R1, R5a, R6, R7, R8.
 *
 * paratext was the one published package with no `src/plugin.ts`, which is not a cosmetic
 * gap: `scripts/plugin-schema-lock.test.ts` and `scripts/schema-sync.mjs` both find a host
 * by looking for that file, so paratext's copy of the family schema was outside the lock
 * that keeps the copies byte-identical, and nothing would have caught it drifting again.
 *
 * What is asserted here is the contract, in the order an author meets it: an object with
 * `capabilities` registers and can then be emitted; anything another layer owns is ignored
 * rather than refused; and every refusal carries a family error code and a fix.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { registerBuiltins } from './builtins.js';
import { type Capability, capabilities, capability, emit, reset as resetRegistry } from './capability.js';
import { attach, contributions, CONTRACT, type Plugin, PluginError, register, registered, reset, validate } from './plugin.js';
import { type Runtime } from './runtime.js';

const BEL = '\u0007';
const OSC = '\u001B]';

const kitty: Capability = {
  name: 'kitty-image',
  osc: 'BEL',
  when: { tty: true, term: 'xterm-kitty' },
  encode: '\u001B_Ga=T,f=100;{base64}\u001B\\',
  fallback: '{caption}',
};

/** The family shape: capabilities by name, beside keys other layers own. */
const plugin = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  name: 'acme-terminal',
  capabilities: { 'kitty-image': kitty },
  ...over,
});

const kittyTerminal: Runtime = { env: { TERM: 'xterm-kitty' }, isTTY: { stdout: true }, cwd: '/work' };

beforeEach(() => {
  reset();
  resetRegistry();
  registerBuiltins();
});

describe('what a plugin may contribute', () => {
  it('registers capabilities that then emit through the same registry as the built-ins', () => {
    register(plugin());
    attach();
    expect(capabilities()).toContain('kitty-image');
    expect(emit(kittyTerminal, 'kitty-image', { base64: 'QQ==', caption: 'a chart' })).toBe('\u001B_Ga=T,f=100;QQ==\u001B\\');
    // And the built-ins are still there: attaching adds, it does not replace the registry.
    expect(emit(kittyTerminal, 'title', { text: 'build' })).toBe(`${OSC}0;build${BEL}`);
  });

  it('projects what it would register without registering it (R7)', () => {
    register(plugin());
    expect(contributions()).toEqual([{ name: 'kitty-image', from: 'acme-terminal', shadowed: [], capability: kitty }]);
    expect(capability('kitty-image')).toBeUndefined();
  });

  it('lets a later plugin replace a name, and says who it shadowed', () => {
    const mine: Capability = { ...kitty, fallback: '[image: {caption}]' };
    register(plugin());
    register(plugin({ name: 'my-overrides', capabilities: { 'kitty-image': mine } }));
    expect(contributions()).toEqual([{ name: 'kitty-image', from: 'my-overrides', shadowed: ['acme-terminal'], capability: mine }]);
    attach();
    expect(capability('kitty-image')?.fallback).toBe('[image: {caption}]');
  });

  it('ignores every key another layer owns, without complaining (R1)', () => {
    expect(() => register(plugin({ tokens: { accent: '#0af' }, spinners: { dots: {} }, components: {} }))).not.toThrow();
    expect(registered().map((p: Plugin) => p.name)).toEqual(['acme-terminal']);
  });

  it('takes a plugin that contributes nothing here', () => {
    expect(() => register({ name: 'flagstaff-theme', tokens: {} })).not.toThrow();
    expect(contributions()).toEqual([]);
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

describe('what it refuses, and with which code', () => {
  it('refuses a capability with no static projection — the one rule 6 has no opt-out for', () => {
    const { fallback: _dropped, ...noFallback } = kitty;
    const error = refusal(plugin({ capabilities: { 'kitty-image': noFallback } }));
    expect(error.code).toBe('E_NO_STATIC_PROJECTION');
    expect(error.fix).toContain('fallback');
  });

  it('refuses a capability filed under a key that is not its name', () => {
    const error = refusal(plugin({ capabilities: { kitty: kitty } }));
    expect(error.code).toBe('E_PLUGIN_SCHEMA');
    expect(error.message).toContain('kitty-image');
  });

  it('refuses a plugin that is not an object, or has no name', () => {
    expect(refusal(() => {}).code).toBe('E_PLUGIN_SCHEMA');
    expect(refusal({ capabilities: {} }).code).toBe('E_PLUGIN_SCHEMA');
  });

  it('refuses a contract this paratext does not know (R6)', () => {
    const error = refusal(plugin({ contract: CONTRACT + 1 }));
    expect(error.code).toBe('E_PLUGIN_CONTRACT');
    expect(error.fix).toContain('paratext');
  });

  it('refuses the rest against the published schema rather than a second copy of its rules', () => {
    const error = refusal(plugin({ capabilities: { 'kitty-image': { ...kitty, encode: '' } } }));
    expect(error.code).toBe('E_PLUGIN_SCHEMA');
    expect(error.fix).toContain('paratext/schema.json');
  });
});
