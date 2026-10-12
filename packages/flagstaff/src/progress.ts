/**
 * The progress bar, which reports to an MCP client instead of drawing when it runs inside a
 * burgee `--mcp` tool call that asked for progress (mcp-current R5).
 *
 * A bar drawn into an agent's tool result is noise the agent has to read past; the same count
 * sent as `notifications/progress` is what the client shows its user while the call runs. burgee's
 * server publishes the call it is serving under `Symbol.for('burgee.mcp')`, and its `progress` is
 * the call's `ctx.progress`: it sends with the call's token, and drops a value that does not rise.
 * So the bar reads the symbol on every render, not once, and imports nothing of burgee's.
 * Anywhere else — no server, or a call without a `progressToken` — it draws as it always has.
 *
 * Only this subpath carries the bridge. The root `flagstaff` entry's `progress` always draws:
 * every flagstaff user pays for the root, and only a program served over MCP needs this.
 */
import { type Component } from './plugin.js';
import { progress as bar, type ProgressOptions, type ProgressState } from './progress-bar.js';

type Send = (done: number, total?: number, message?: string) => void;

/** The serving call's `ctx.progress`, when there is one and it asked for progress. */
const sender = (): Send | undefined => (Reflect.get(globalThis, Symbol.for('burgee.mcp')) as (() => { progress?: Send } | undefined) | undefined)?.()?.progress;

/** A progress bar: `12/30 files · 40%` off a terminal, a drawn bar on one, and MCP progress inside a call that asked. */
export function progress(options?: ProgressOptions): Component<ProgressState> {
  // The bar always draws a frame; its declared type only says a component may.
  const drawn = bar(options) as Component<ProgressState> & Required<Pick<Component<ProgressState>, 'frame'>>;
  /** Sends the count with its static text and draws nothing, or answers `undefined` to draw. */
  const report = (state: ProgressState): '' | undefined => {
    const send = sender();
    if (send === undefined) return undefined;
    send(state.done, state.total, drawn.static(state));
    return '';
  };
  return {
    name: drawn.name,
    static: (state) => report(state) ?? drawn.static(state),
    frame: (t, state) => report(state) ?? drawn.frame(t, state),
  };
}

export type { ProgressOptions, ProgressState } from './progress-bar.js';
