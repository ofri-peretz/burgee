/**
 * closeout's `rawMode` against `.sdlc/models/save-restore.qnt`: each trace's `acquireRaw` and
 * `releaseRaw` steps become real calls on one fake terminal, and after every step the terminal's
 * raw mode must be what the model says. The model's `hook` / `unhook` steps are flagstaff's ora,
 * not this file, and are skipped. Placed into closeout's `.mutation/` by `spec-closeout.mts`.
 */
import { loadTraces } from 'oxmutate/spec';
import { expect, it } from 'vitest';

import { rawMode } from '../src/cursor.js';

/** No exit handler is ever run in a replay: registering one does nothing, and undoing it neither. */
const nothing = (): void => {};
const register = (): (() => void) => nothing;

const traces = loadTraces('save-restore');
if (traces.length === 0) it.skip('replays save-restore (traces come from oxmutate)', () => {});
else
  it.each(traces)('replays $name', (trace) => {
    const input = { isTTY: true, isRaw: false, setRawMode(mode: boolean) { input.isRaw = mode; } };
    const undo = new Map<unknown, () => void>();
    for (const step of trace.steps.slice(1)) {
      const owner = step.picks['o'];
      if (step.action === 'acquireRaw') undo.set(owner, rawMode(input, register));
      else if (step.action === 'releaseRaw') {
        undo.get(owner)?.();
        undo.delete(owner);
      } else continue;
      expect(input.isRaw, `after ${step.action}(${String(owner)})`).toBe(step.state['isRaw']);
    }
  });
