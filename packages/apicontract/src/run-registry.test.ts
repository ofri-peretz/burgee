/**
 * The three registries PLAN.md 6.0 creates so the `ac-*` lanes never edit a shared file. These hold
 * for every state of the lanes: before a lane lands, and after it replaces its stub.
 */
import { describe, expect, it } from 'vitest';

import { commands } from './commands.js';
import { builtinAdapters } from './inputs.js';
import { builtins } from './plugins.js';

describe('the 6.0 registries', () => {
  it('reads OpenAPI first, under its own name', () => {
    expect(Object.keys(builtinAdapters)[0]).toBe('openapi');
    expect(Object.values(builtinAdapters).every((a) => typeof a.detect === 'function')).toBe(true);
  });

  it('lists only plugins that exist', () => {
    expect(builtins.every((p) => typeof p.name === 'string')).toBe(true);
  });

  it('declares every lane command once', () => {
    expect(commands.map((c) => c.name)).toEqual(['explain', 'diff', 'migrate', 'plugin']);
  });
});
