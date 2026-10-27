#!/usr/bin/env node
/**
 * The Ink screen fixture (controlroom criteria 3 and 6, and the other side of W3's demo half): the
 * reference dashboard's screen written as an Ink program — `Box`, `Text` and `useInput` from
 * `ink`, `Spinner` from `@inkjs/ui`, and `React.createElement` instead of JSX, so there is no build
 * step. A tab line, two columns (a learn panel and a checklist), a log pane, and ←→ to switch tabs.
 *
 * Its package.json resolves `'ink'` to `controlroom/ink`, for this file and for `@inkjs/ui` alike,
 * so the same file runs on the drop-in without a changed line, with `react-reconciler` installed —
 * and on ink itself if that line points back at ink. Off a terminal it reads no key and prints each
 * finished step once, as Ink's screen-reader output does, and it ends when the work ends.
 */
import { pathToFileURL } from 'node:url';

import { Spinner } from '@inkjs/ui';
import { Box, render, Static, Text, useApp, useInput } from 'ink';
import React, { useEffect, useState } from 'react';

const h = React.createElement;

/** The work: the dashboard's own steps, so the two programs draw the same thing. */
export const STEPS = [
  { title: 'Detect the framework', log: ['found package.json', 'framework: next'] },
  { title: 'Install the SDK', log: ['npm install posthog-js', 'added 1 package'] },
  { title: 'Write the config', log: ['wrote posthog.config.js'] },
  { title: 'Check the setup', log: ['sent a test event', 'event received'] },
];
export const TICK = 400;
const TABS = ['Status', 'Tail logs', 'Visualizer', 'HN'];
const BAR = 30;

/** Time, injectable so a test can step it: `now()`, and `schedule(fn, ms)` returning a cancel. */
export const realClock = {
  now: () => Date.now(),
  schedule(fn, ms) {
    const timer = setTimeout(fn, ms);
    return () => clearTimeout(timer);
  },
};

const progress = (done) => `Progress: ${String(done)}/${String(STEPS.length)} completed`;

/** The checklist: `◼` done, the spinner on the running step, `◻` pending. */
function Checklist({ advanced }) {
  return h(
    Box,
    { flexDirection: 'column' },
    STEPS.map(({ title }, i) => {
      if (i < advanced - 1) return h(Text, { key: title }, `◼ ${title}`);
      if (i === advanced - 1) return h(Spinner, { key: title, label: title });
      return h(Text, { key: title, dimColor: true }, `◻ ${title}`);
    }),
  );
}

/** The log pane: `◆` where a step starts, `┊` before each line it printed. */
function Log({ advanced }) {
  const lines = STEPS.slice(0, advanced).flatMap(({ title, log }) => [`◆ ${title}`, ...log.map((l) => `┊ ${l}`)]);
  return h(
    Box,
    { flexDirection: 'column' },
    lines.map((line, i) => h(Text, { key: i }, line)),
  );
}

function Body({ tab, advanced, done }) {
  if (tab === 0) {
    return h(Box, null, h(Box, { width: 30 }, h(Text, null, 'The wizard installs the SDK\nand checks the first event.')), h(Checklist, { advanced }));
  }
  if (tab === 1) return h(Log, { advanced });
  if (tab === 2) {
    const filled = Math.round((BAR * done) / STEPS.length);
    return h(Text, null, `${'█'.repeat(filled)}${'░'.repeat(BAR - filled)} ${String(done)}/${String(STEPS.length)} steps`);
  }
  return h(Text, null, 'Your own tab: put your app’s content here.');
}

/** The screen, over `clock`. `interactive` is a terminal on both ends: keys are read only then. */
function Screen({ clock, interactive }) {
  const { exit } = useApp();
  // How many steps have started: the running one is `advanced - 1`, every one before it is done.
  const [advanced, setAdvanced] = useState(0);
  const [tab, setTab] = useState(0);
  const done = Math.max(0, Math.min(STEPS.length, advanced - 1));

  useEffect(() => {
    // On the next turn, not in this effect: the last step's line is committed first, and once.
    if (advanced > STEPS.length) return clock.schedule(exit, 0);
    return clock.schedule(() => setAdvanced((n) => n + 1), advanced === 0 ? 0 : TICK);
  }, [advanced, clock, exit]);

  useInput(
    (input, key) => {
      if (key.rightArrow) setTab((t) => (t + 1) % TABS.length);
      if (key.leftArrow) setTab((t) => (t + TABS.length - 1) % TABS.length);
      if (input === 'q' || (key.ctrl && input === 'c')) exit();
    },
    { isActive: interactive },
  );

  const finished = [...STEPS.slice(0, done).map(({ title }) => `◼ ${title}`), ...(advanced > STEPS.length ? [`Done: ${progress(done)}`] : [])];
  const settled = h(Static, { items: finished }, (line) => h(Text, { key: line }, line));
  if (!interactive) return settled;
  // On a terminal the finished steps go above the screen too, into the scrollback, as Ink's
  // `<Static>` puts them: what is left when the screen ends is the run's record.
  return h(
    Box,
    { flexDirection: 'column' },
    settled,
    h(Text, null, TABS.map((label, i) => (i === tab ? `[${label}]` : label)).join(' · ')),
    h(Text, null, progress(done)),
    h(Body, { tab, advanced, done }),
    h(Text, { dimColor: true }, '←→ switch tab  q quit'),
  );
}

/**
 * Run the screen on `io` (`stdin`, `stdout`, `stderr`, `clock`, all optional), and resolve when
 * the work is done or the user quits. A terminal gets the screen and the keys; anything else gets
 * the finished steps a line each, and no key is waited for.
 */
export async function run({ stdin = process.stdin, stdout = process.stdout, stderr = process.stderr, clock = realClock } = {}) {
  const interactive = stdin.isTTY === true && stdout.isTTY === true;
  const app = render(h(Screen, { clock, interactive }), { stdin, stdout, stderr, isScreenReaderEnabled: !interactive, patchConsole: interactive });
  await app.waitUntilExit();
  return 0;
}

// Through `pathToFileURL`, so the check holds on Windows, where argv[1] is `C:\…` and the URL is `file:///C:/…`.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await run();
