#!/usr/bin/env node
/**
 * The reference dashboard (controlroom R22): tabs, a checklist with progress, a log tail and a
 * status section that collapses, in the alternate screen — and clean lines in a pipe, in CI and
 * for a screen reader, and NDJSON under --json, from the same program.
 *
 * Copy this directory to start your own. What to change first is in README.md.
 */
import { pathToFileURL } from 'node:url';

import { hints, open, processRuntime } from 'controlroom';
import { logTail } from 'flagstaff/log-tail';
import { tabBar } from 'flagstaff/tab-bar';
import { tasks } from 'flagstaff/tasks';

/** The work. Replace these with your own steps; each `run` is what the step does. */
export const STEPS = [
  { title: 'Detect the framework', log: ['found package.json', 'framework: next'] },
  { title: 'Install the SDK', log: ['npm install posthog-js', 'added 1 package'] },
  { title: 'Write the config', log: ['wrote posthog.config.js'] },
  { title: 'Check the setup', log: ['sent a test event', 'event received'] },
];

const TABS = ['Status', 'Tail logs'];
const KEYMAP = { left: 'tab.prev', right: 'tab.next', s: 'toggle:status', q: 'quit', 'ctrl+c': 'quit' };
const LABELS = { 'tab.prev': 'switch tab', 'tab.next': 'switch tab', 'toggle:status': 'toggle status', quit: 'quit' };
export const TICK = 400;
const NOTHING = () => undefined;

const text = { name: 'text', static: (s) => s };

/** The arrangement for each tab: the status tab shows the learn panel and the checklist; the logs tab, the tail. */
function layout(state) {
  const body =
    state.active === 0
      ? { direction: 'row', parts: [{ size: { fr: 1, min: 20 }, content: 'learn' }, { size: { fr: 2 }, content: 'tasks' }] }
      : 'log';
  return {
    direction: 'column',
    parts: [
      { size: 1, content: 'tabs' },
      { size: 'fit', content: 'status' },
      { content: body },
      { size: 1, content: 'hints' },
    ],
  };
}

const progress = (list) => `Progress: ${list.filter((t) => t.status === 'ok').length}/${list.length} completed`;

/** Run the dashboard over `rt` (a controlroom Runtime), and resolve when the work is done or the user quits. */
export function run(rt, argv = []) {
  const list = STEPS.map((s) => ({ title: s.title, status: 'pending' }));
  const lines = [];
  let step = 0;
  return new Promise((resolve) => {
    let cancel = NOTHING;
    const screen = open(rt, {
      screen: 'alternate',
      json: argv.includes('--json'),
      layout,
      tabs: TABS,
      keymap: KEYMAP,
      panes: {
        tabs: { component: tabBar(), state: { tabs: TABS, active: 0 }, liveOnly: true },
        status: { component: text, state: progress(list), label: 'Status' },
        learn: { component: text, state: 'The wizard installs the SDK\nand checks the first event.', label: 'Learn' },
        tasks: { component: tasks(), state: { tasks: list }, label: 'Tasks' },
        log: { component: logTail({ height: 8 }), state: { lines }, label: 'Log' },
        hints: { component: text, state: hints(KEYMAP, LABELS), liveOnly: true },
      },
      onAction(action, s) {
        if (action === 'quit') {
          cancel();
          resolve('quit');
          return;
        }
        s.update('tabs', { tabs: TABS, active: s.state.active });
      },
    });
    const advance = () => {
      if (step > 0) list[step - 1].status = 'ok';
      if (step < STEPS.length) {
        list[step].status = 'running';
        lines.push({ step: STEPS[step].title }, ...STEPS[step].log);
      }
      screen.update('tasks', { tasks: [...list] });
      screen.update('log', { lines: [...lines] });
      screen.update('status', progress(list));
      step += 1;
      if (step > STEPS.length) {
        screen.commit(`Done: ${progress(list)}`);
        screen.close();
        resolve('done');
        return;
      }
      cancel = rt.clock.schedule(advance, TICK);
    };
    cancel = rt.clock.schedule(advance, 0);
  });
}

// `pathToFileURL`, not `file://` + argv[1]: on Windows the two spellings of the path never match.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) await run(processRuntime(), process.argv.slice(2));
