/**
 * The three registries PLAN.md 6.0 creates so the `ac-*` lanes never edit a shared file. Until a lane
 * fills its file, its stub contributes nothing; this holds that true and keeps every stub executed.
 */
import { describe, expect, it } from 'vitest';

import { commands } from './commands.js';
import { applyOverlays } from './input-overlay.js';
import { adapters } from './inputs.js';
import { builtins } from './plugins.js';
import { conformance } from './testing.js';

describe('the 6.0 registries', () => {
  it('reads OpenAPI first, and only adapters that exist', () => {
    expect(adapters[0]?.description).toBe('OpenAPI 3.0, 3.1 and 3.2 documents, including webhooks');
    expect(adapters.every((a) => typeof a.detect === 'function')).toBe(true);
  });

  it('lists no built-in plugin a lane has not written yet', () => {
    expect(builtins.every((p) => typeof p.name === 'string')).toBe(true);
  });

  it('declares every lane command, each refusing with a fix line until its lane lands', () => {
    expect(commands.map((c) => c.name)).toEqual(['explain', 'diff', 'migrate', 'plugin']);
    for (const c of commands) {
      expect(() => (c.run as () => unknown)()).toThrow(/fix: it lands in Wave 6 \(\.sdlc\/PLAN\.md, lane ac-/);
    }
  });

  it('leaves the kit and the overlay to their lanes', () => {
    expect(conformance).toBeUndefined();
    expect(applyOverlays).toBeUndefined();
  });
});
