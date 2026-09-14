/**
 * caique hosts `widgets` — `plugin-contract` R1, R5, R6, R7, R8.
 *
 * The claim R5 makes is *sameness*: a widget is the same shape a flagstaff component is,
 * and a widget without `static` is refused with the same code and the same message. So the
 * fixture here is deliberately **a flagstaff plugin object** — it carries `tokens`,
 * `glyphs`, `spinners` and `components` — and registering it must keep the widgets and
 * ignore the rest without complaining. That is what makes "works on any subset of the
 * family that is installed" a fact rather than a hope.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { CONTRACT, type Plugin, PluginError, kinds, projectionOf, register, registered, reset, widgetFor, widgets } from './plugin.js';
import { type PromptSpec } from './spec.js';

/** A rating prompt: the seventh kind, which is the whole point of the host. */
const rating: PromptSpec = { kind: 'acme-rating', message: 'How was it?' };

/**
 * A plugin object written for *flagstaff*, not for caique. Every key but `widgets` belongs
 * to another layer, and none of them may cause an error here (R1).
 */
function acme(): Record<string, unknown> {
  return {
    name: 'acme',
    contract: 1,
    tokens: { error: '#b3261e' },
    glyphs: { ok: '✔' },
    spinners: { pulse: { interval: 80, frames: ['.', 'o', 'O'] } },
    components: { banner: { static: (): string => 'banner' } },
    widgets: {
      'acme-rating': {
        static: (spec: PromptSpec): string => `${spec.message}\n  enter 1-5: `,
        frame: (t: number, spec: PromptSpec): string => `${spec.message} ${'*'.repeat(t)}`,
        sample: { running: { phase: 'asking' }, done: { phase: 'answered' } },
      },
    },
  };
}

beforeEach(() => {
  reset();
});

describe('registering', () => {
  it('keeps `widgets` and ignores every other layer’s keys (R1)', () => {
    expect(() => {
      register(acme());
    }).not.toThrow();
    expect(kinds()).toContain('acme-rating');
  });

  it('renders a kind outside the six built-ins — the thing that was impossible before', () => {
    register(acme());
    expect(projectionOf(rating)).toBe('How was it?\n  enter 1-5:');
  });

  it('leaves the six built-ins to caique, which still draws them itself', () => {
    register(acme());
    expect(projectionOf({ kind: 'confirm', message: 'Overwrite it?' })).toBe('Overwrite it? (y/N)');
    expect(projectionOf({ kind: 'select', message: 'Pick', choices: [{ value: 'a' }] })).toContain('1) a');
  });

  it('reports what each plugin contributed, and who it shadowed', () => {
    register(acme());
    const second = acme();
    second['name'] = 'zeta';
    register(second);
    expect(widgets()).toEqual([{ kind: 'acme-rating', from: 'zeta', shadowed: ['acme'] }]);
  });

  it('later wins, like flat config', () => {
    register(acme());
    const second = acme();
    second['name'] = 'zeta';
    (second['widgets'] as Record<string, unknown>)['acme-rating'] = { static: (): string => 'zeta drew this' };
    register(second);
    expect(projectionOf(rating)).toBe('zeta drew this');
  });

  it('exposes the registered plugins in registration order', () => {
    register(acme());
    expect(registered().map((p: Plugin) => p.name)).toEqual(['acme']);
  });

  it('reset() forgets them', () => {
    register(acme());
    reset();
    expect(kinds()).not.toContain('acme-rating');
  });
});

describe('an unknown kind', () => {
  it('is a runtime error naming the kinds that are registered (E_UNKNOWN_KIND)', () => {
    register(acme());
    let error: PluginError | undefined;
    try {
      projectionOf({ kind: 'acme-slider', message: 'Slide' });
    } catch (thrown) {
      error = thrown as PluginError;
    }
    expect(error?.code).toBe('E_UNKNOWN_KIND');
    // The message names what *is* registered, so the reader can see the typo.
    expect(error?.message).toContain('acme-rating');
    expect(error?.message).toContain('acme-slider');
    expect(error?.fix).toContain('text');
  });

  it('says so plainly when nothing at all is registered', () => {
    expect(() => projectionOf({ kind: 'acme-slider', message: 'Slide' })).toThrow(/no plugin has registered a widget/);
  });

  it('is not silently drawn as a text prompt, which is what a widened union would otherwise mean', () => {
    expect(() => projectionOf({ kind: 'acme-slider', message: 'Slide' })).toThrow(PluginError);
  });
});

describe('refusals — the family’s one vocabulary (R8)', () => {
  it('a widget without `static` is E_NO_STATIC_PROJECTION, the same code flagstaff uses (R5)', () => {
    const bad = acme();
    (bad['widgets'] as Record<string, unknown>)['acme-rating'] = { frame: (): string => 'only a frame' };
    expect(() => {
      register(bad);
    }).toThrow(expect.objectContaining({ code: 'E_NO_STATIC_PROJECTION' }));
  });

  it('a plugin that is not a plain object is refused', () => {
    expect(() => {
      register(() => 'nope');
    }).toThrow(expect.objectContaining({ code: 'E_PLUGIN_SCHEMA' }));
  });

  it('a plugin without a name is refused — a shadowed kind has to be attributable', () => {
    const bad = acme();
    delete bad['name'];
    expect(() => {
      register(bad);
    }).toThrow(expect.objectContaining({ code: 'E_PLUGIN_SCHEMA' }));
  });

  it('a newer contract is refused with a fix naming what to upgrade (R6)', () => {
    const bad = acme();
    bad['contract'] = CONTRACT + 1;
    expect(() => {
      register(bad);
    }).toThrow(expect.objectContaining({ code: 'E_PLUGIN_CONTRACT' }));
  });

  it('a widget shadowing a built-in kind is refused, so a third party cannot replace `password`', () => {
    const bad = acme();
    (bad['widgets'] as Record<string, unknown>)['password'] = { static: (): string => 'gotcha' };
    expect(() => {
      register(bad);
    }).toThrow(expect.objectContaining({ code: 'E_PLUGIN_SCHEMA' }));
  });

  it('a refused plugin is not registered — validation is at the door, not after it', () => {
    const bad = acme();
    bad['contract'] = CONTRACT + 1;
    expect(() => {
      register(bad);
    }).toThrow();
    expect(registered()).toHaveLength(0);
  });
});

describe('the widget shape', () => {
  it('carries `frame` for raw mode, reachable rather than merely validated', () => {
    register(acme());
    expect(widgetFor('acme-rating')?.frame?.(3, rating)).toBe('How was it? ***');
  });

  it('carries `sample`, because a component has one and R5’s claim is sameness', () => {
    register(acme());
    expect(widgetFor('acme-rating')?.sample).toEqual({ running: { phase: 'asking' }, done: { phase: 'answered' } });
  });

  it('hands back nothing for a kind no one registered', () => {
    expect(widgetFor('acme-slider')).toBeUndefined();
  });
});
