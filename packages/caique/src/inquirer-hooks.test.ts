/**
 * The hook engine on its own: a store, a render function re-run on every change, and the
 * effect queue flushed after each draw — the loop `createPrompt` runs, minus the terminal.
 *
 * `mount` is that loop in six lines. It counts renders because most of what the engine
 * promises is a count: one re-render for two state changes, none for a no-op, an effect run
 * once per dependency change and a cleanup run once per effect.
 */
import { AsyncResource } from 'node:async_hooks';
import { PassThrough } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

import { HookError, ValidationError } from './inquirer-errors.js';
import { effectScheduler, handleChange, type PromptReadline, readline, useEffect, useMemo, useRef, useState, withHooks, withUpdates } from './inquirer-hooks.js';

/** What a hook-holding `let` starts as, before the first render hands it the real function. */
const noop = (): void => undefined;

interface Mounted {
  rl: PromptReadline;
  renders: () => number;
  clearAll: () => void;
}

/** Render `view` inside a fresh store, re-rendering whenever its state changes. */
function mount(view: () => void): Mounted {
  const rl = { input: new PassThrough() } as unknown as PromptReadline;
  let renders = 0;
  let clearAll = noop;
  withHooks(rl, (cycle) => {
    clearAll = AsyncResource.bind(() => {
      effectScheduler.clearAll();
    });
    cycle(() => {
      renders++;
      view();
      effectScheduler.run();
    });
  });
  return { rl, renders: () => renders, clearAll };
}

describe('outside a prompt', () => {
  it('every hook throws HookError, naming where hooks may be called', () => {
    const message = '[Inquirer] Hook functions can only be called from within a prompt';
    expect(() => useState(0)).toThrow(new HookError(message));
    expect(() => readline()).toThrow(HookError);
    expect(() => handleChange()).toThrow(HookError);
    expect(() => effectScheduler.run()).toThrow(HookError);
    expect(() => effectScheduler.clearAll()).toThrow(HookError);
  });
});

describe('withHooks', () => {
  it('treats a change asked for before the first render as nothing to draw', () => {
    // `createPrompt` defers its first cycle a tick for a modern input; until that cycle
    // installs "render again", the store's change handler has nothing to render.
    const rl = { input: new PassThrough() } as unknown as PromptReadline;
    const render = vi.fn();
    const value = withHooks(rl, (cycle) => {
      handleChange();
      expect(render).not.toHaveBeenCalled();
      cycle(render);
      return 'returned';
    });
    expect(render).toHaveBeenCalledTimes(1);
    expect(value).toBe('returned');
  });
});

describe('readline', () => {
  it('is the interface the prompt was mounted over', () => {
    let seen: PromptReadline | undefined;
    const { rl } = mount(() => {
      seen = readline();
    });
    expect(seen).toBe(rl);
  });
});

describe('useState', () => {
  it('keeps its value across re-renders, and re-renders once per change', () => {
    const values: number[] = [];
    let set: (next: number) => void = noop;
    const { renders } = mount(() => {
      const [value, setValue] = useState(1);
      values.push(value);
      set = setValue;
    });
    set(2);
    set(3);
    expect(values).toEqual([1, 2, 3]);
    expect(renders()).toBe(3);
  });

  it('calls a lazy initialiser once, on the first render only', () => {
    const init = vi.fn(() => 'first');
    let set: (next: string) => void = noop;
    const values: string[] = [];
    mount(() => {
      const [value, setValue] = useState(init);
      values.push(value);
      set = setValue;
    });
    set('second');
    expect(init).toHaveBeenCalledTimes(1);
    expect(values).toEqual(['first', 'second']);
  });

  it('takes a reducer over the current value', () => {
    const values: number[] = [];
    let bump = noop;
    mount(() => {
      const [value, setValue] = useState(10);
      values.push(value);
      bump = () => {
        setValue((current) => current + 5);
      };
    });
    bump();
    expect(values).toEqual([10, 15]);
  });

  it('does not re-render when the next value is Object.is-equal, NaN included', () => {
    let set: (next: number) => void = noop;
    const { renders } = mount(() => {
      const [, setValue] = useState(Number.NaN);
      set = setValue;
    });
    set(Number.NaN);
    expect(renders()).toBe(1);
  });

  it('starts undefined with no default', () => {
    let seen: unknown = 'unset';
    mount(() => {
      [seen] = useState<string>();
    });
    expect(seen).toBeUndefined();
  });

  it('re-renders from a setter called in another async context entirely', async () => {
    let set: (next: string) => void = noop;
    const values: string[] = [];
    mount(() => {
      const [value, setValue] = useState('a');
      values.push(value);
      set = setValue;
    });
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        set('b');
        resolve();
      }, 0);
    });
    expect(values).toEqual(['a', 'b']);
  });
});

describe('withUpdates', () => {
  it('collapses every state change inside it into one re-render', () => {
    let both = noop;
    const values: string[] = [];
    const { renders } = mount(() => {
      const [a, setA] = useState(0);
      const [b, setB] = useState(0);
      values.push(`${a}/${b}`);
      both = withUpdates(() => {
        setA(1);
        setB(1);
      });
    });
    both();
    expect(renders()).toBe(2);
    expect(values).toEqual(['0/0', '1/1']);
  });

  it('renders nothing when the wrapped call changes nothing, and passes its value back', () => {
    let read: (() => number) | undefined;
    const { renders } = mount(() => {
      read = withUpdates((n: number) => n * 2).bind(undefined, 21);
    });
    expect(read?.()).toBe(42);
    expect(renders()).toBe(1);
  });
});

describe('useEffect', () => {
  it('runs after the render, not during it, and is handed the readline', () => {
    const order: string[] = [];
    let handed: PromptReadline | undefined;
    const { rl } = mount(() => {
      order.push('render');
      useEffect((effectRl) => {
        handed = effectRl;
        order.push('effect');
      }, []);
      order.push('rendered');
    });
    expect(order).toEqual(['render', 'rendered', 'effect']);
    expect(handed).toBe(rl);
  });

  it('re-runs only when a dependency changes, cleaning up the last run first', () => {
    const log: string[] = [];
    let set: (next: number) => void = noop;
    let rerender = noop;
    mount(() => {
      const [dep, setDep] = useState(1);
      const [, setTick] = useState(0);
      set = setDep;
      rerender = () => {
        setTick((tick) => tick + 1);
      };
      useEffect(() => {
        log.push(`run ${dep}`);
        return () => {
          log.push(`clean ${dep}`);
        };
      }, [dep]);
    });
    rerender();
    expect(log).toEqual(['run 1']);
    set(2);
    expect(log).toEqual(['run 1', 'clean 1', 'run 2']);
  });

  it('coalesces the state changes its effects make into one re-render', () => {
    const { renders } = mount(() => {
      const [a, setA] = useState(0);
      const [b, setB] = useState(0);
      useEffect(() => {
        setA(1);
        setB(1);
      }, []);
      void a;
      void b;
    });
    expect(renders()).toBe(2);
  });

  it('refuses a return value that is neither a cleanup nor nothing', () => {
    expect(() =>
      mount(() => {
        useEffect(() => 42 as unknown as undefined, []);
      }),
    ).toThrow(new ValidationError('useEffect return value must be a cleanup function or nothing.'));
  });

  it('accepts null as nothing', () => {
    expect(() =>
      mount(() => {
        useEffect(() => null as unknown as undefined, []);
      }),
    ).not.toThrow();
  });
});

describe('effectScheduler.clearAll', () => {
  it('runs every cleanup exactly once, however often a settling prompt calls it', () => {
    const cleanups = { first: 0, second: 0 };
    const { clearAll } = mount(() => {
      useEffect(
        () => () => {
          cleanups.first++;
        },
        [],
      );
      useEffect(() => undefined, []);
      useEffect(
        () => () => {
          cleanups.second++;
        },
        [],
      );
    });
    clearAll();
    clearAll();
    expect(cleanups).toEqual({ first: 1, second: 1 });
  });

  it('forgets effects queued but not yet run, so a settled pass never runs them', () => {
    const effect = vi.fn();
    let clearAll = noop;
    const rl = { input: new PassThrough() } as unknown as PromptReadline;
    withHooks(rl, (cycle) => {
      clearAll = AsyncResource.bind(() => {
        effectScheduler.clearAll();
      });
      cycle(() => {
        useEffect(effect, []);
        // Settled between the render and the flush, as a view that throws is.
        clearAll();
        effectScheduler.run();
      });
    });
    expect(effect).not.toHaveBeenCalled();
  });
});

describe('useMemo', () => {
  it('recomputes only when a dependency changes by !==, or the list changes length', () => {
    const compute = vi.fn((n: number) => n * 10);
    let deps: unknown[] = [1];
    let rerender = noop;
    const results: number[] = [];
    mount(() => {
      const [, setTick] = useState(0);
      rerender = () => {
        setTick((tick) => tick + 1);
      };
      results.push(useMemo(() => compute(deps.length), deps));
    });
    rerender();
    expect(compute).toHaveBeenCalledTimes(1);
    deps = [2];
    rerender();
    expect(compute).toHaveBeenCalledTimes(2);
    deps = [2, 3];
    rerender();
    expect(compute).toHaveBeenCalledTimes(3);
    // Shorter, with every remaining element unchanged: only the length says it changed.
    deps = [2];
    rerender();
    expect(compute).toHaveBeenCalledTimes(4);
    // NaN !== NaN, so a NaN dependency recomputes every time — the incumbent's comparison.
    deps = [Number.NaN];
    rerender();
    rerender();
    expect(compute).toHaveBeenCalledTimes(6);
    expect(results).toEqual([10, 10, 10, 20, 10, 10, 10]);
  });
});

describe('useRef', () => {
  it('hands back the same box on every render, holding what was put in it', () => {
    const boxes: { current: number }[] = [];
    let rerender = noop;
    mount(() => {
      const [, setTick] = useState(0);
      rerender = () => {
        setTick((tick) => tick + 1);
      };
      const box = useRef(7);
      boxes.push(box);
      box.current++;
    });
    rerender();
    expect(boxes[0]).toBe(boxes[1]);
    expect(boxes[1]?.current).toBe(9);
  });

  it('starts empty with no value', () => {
    let box: { current: unknown } = { current: 'unset' };
    mount(() => {
      box = useRef<string>();
    });
    expect(box.current).toBeUndefined();
  });
});
