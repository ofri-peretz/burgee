/**
 * A task list, as a component (R2, R4) — the shape listr2 exists for, without the
 * framework.
 *
 * The static projection is one line per task that has *settled*, which is the difference
 * that matters off a terminal: a pipe should not be told six times that step 3 is still
 * running. On a terminal every task is drawn every frame, with the running one animated by
 * the same glyphs the spinner uses, so a plugin that ships glyphs changes both.
 */
import { error, hint, muted, ok, warn } from 'roundel/tokens';

import { type Component, glyph, lookupSpinner } from './plugin.js';

export type TaskStatus = 'pending' | 'running' | 'ok' | 'fail' | 'warn' | 'info';

export interface Task {
  title: string;
  /** `pending` when omitted. */
  status?: TaskStatus;
  /** A line under the title — the step's current detail, shown only on a terminal. */
  detail?: string;
}

export interface TasksState {
  tasks: Task[];
}

export interface TasksOptions {
  /** The spinner style the running task is drawn with. Default `dots`. */
  spinner?: string;
}

const PAINT: Record<Exclude<TaskStatus, 'pending' | 'running'>, (s: string) => string> = { ok, fail: error, warn, info: hint };
/** What a task that has not started yet is drawn with; never a glyph a plugin owns. */
const PENDING = ' ';

const settled = (status: TaskStatus): status is 'ok' | 'fail' | 'warn' | 'info' => status !== 'pending' && status !== 'running';

/** A task list: settled tasks one line each off a terminal, the whole list drawn on one. */
export function tasks({ spinner = 'dots' }: TasksOptions = {}): Component<TasksState> {
  const style = lookupSpinner(spinner);

  const symbol = (status: TaskStatus, t: number): string => {
    if (settled(status)) return PAINT[status](glyph(status));
    if (status === 'pending') return muted(PENDING);
    const at = Math.floor(t / style.interval) % style.frames.length;
    return style.frames[at] ?? '';
  };

  return {
    name: 'tasks',
    interval: style.interval,
    // Only what has finished, because a state change that leaves a task running says
    // nothing new to a pipe — and `staticProjection` drops a repeat of the same text.
    static: (state) =>
      state.tasks
        .filter((task) => settled(task.status ?? 'pending'))
        .map((task) => `${PAINT[task.status as 'ok'](glyph(task.status as 'ok'))} ${task.title}`)
        .join('\n'),
    frame: (t, state) =>
      state.tasks
        .flatMap((task) => {
          const status = task.status ?? 'pending';
          const title = `${symbol(status, t)} ${status === 'pending' ? muted(task.title) : task.title}`;
          return task.detail === undefined || status !== 'running' ? [title] : [title, `  ${muted(task.detail)}`];
        })
        .join('\n'),
  };
}
