/**
 * controlroom R17: the Ink ecosystem runs unchanged. `ink-spinner`, `ink-text-input` and
 * `ink-select-input` come from npm as published and import from `'ink'`; this project's
 * package.json resolves `'ink'` to `controlroom/ink` with one line (`"ink": "file:./ink"`, a
 * two-line package that re-exports the drop-in), and each component is run, unmodified, on a
 * terminal stand-in, with a check on what it drew and what it reported.
 *
 * The first block is what keeps the rest honest: each component's own `import 'ink'` must land on
 * the drop-in. A package manager that hoisted a component beside a real ink would let all of the
 * behaviour below pass on ink itself, and say nothing.
 */
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { PassThrough } from 'node:stream';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { render, Text } from 'ink';
import SelectInput from 'ink-select-input';
import Spinner from 'ink-spinner';
import TextInput from 'ink-text-input';
import React, { useState } from 'react';

const h = React.createElement;
const COMPONENTS = ['ink-spinner', 'ink-text-input', 'ink-select-input'];

describe("each component's 'ink' is controlroom/ink", () => {
  const shim = realpathSync(fileURLToPath(new URL('ink/index.js', import.meta.url)));
  for (const name of COMPONENTS) {
    it(name, () => {
      const from = fileURLToPath(import.meta.resolve(name));
      assert.equal(realpathSync(createRequire(from).resolve('ink')), shim);
    });
  }

  it('and the shim is the drop-in itself', async () => {
    const [shimmed, dropIn] = await Promise.all([import('ink'), import('controlroom/ink')]);
    assert.equal(shimmed.render, dropIn.render);
  });
});

/** A terminal stand-in: the frames written to it, and a stdin that can go raw. */
function terminal() {
  const frames = [];
  const stdout = Object.assign(new PassThrough(), { isTTY: true, columns: 80, rows: 24 });
  stdout.on('data', (chunk) => frames.push(String(chunk)));
  const stdin = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode: () => undefined, ref: () => undefined, unref: () => undefined });
  // `debug` writes each frame whole, so the last write is exactly what the terminal shows.
  const mount = (node) => render(node, { stdout, stdin, debug: true, patchConsole: false });
  return { frames, stdin, mount, last: () => plain(frames.at(-1) ?? '') };
}
/**
 * A frame as words: without its colour, and without the space at the end of a line. Both depend
 * on the colour level: ink-text-input draws its cursor as an inverse space, which Ink trims from
 * the line when it is a bare space and keeps when it is wrapped in an escape sequence.
 */
const plain = (s) =>
  s
    .replaceAll(/\u001B\[[\d;]*m/gu, '')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n');
/** cli-spinners' `dots`, ink-spinner's default: 80 ms a frame. */
const DOTS = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
/** Three distinct frames: the first and two moves, so one stray redraw is not an animation. */
const AT_LEAST = 3;
/**
 * How long a wait for a frame or a callback goes on before it fails: only a ceiling for one that
 * never comes. The spinner's 80 ms interval and Ink's 33 ms throttle run on the real clock, and a
 * busy macOS runner (2026-11-13) drew 2 distinct frames in the fixed 300 ms this used to wait.
 */
const NEVER_MS = 10_000;
/** How often `until` asks again. */
const POLL_MS = 5;
/** Resolve once `done()` holds, asked again every few ms; fail after `NEVER_MS`, with `what()` saying what there was instead. */
const until = (done, what) =>
  new Promise((resolve, reject) => {
    const started = Date.now();
    const poll = () => {
      if (done()) resolve();
      else if (Date.now() - started > NEVER_MS) reject(new assert.AssertionError({ message: what() }));
      else setTimeout(poll, POLL_MS);
    };
    poll();
  });

describe('ink-spinner 5.0.0', () => {
  it('draws the dots spinner beside its label, and animates it', async () => {
    const t = terminal();
    const distinct = () => [...new Set(t.frames.map(plain).filter((f) => f.endsWith(' working')))];
    const app = t.mount(h(Text, null, h(Spinner, { type: 'dots' }), ' working'));
    try {
      await until(
        () => distinct().length >= AT_LEAST,
        () => `only ${String(distinct().length)} distinct frames`,
      );
    } finally {
      // Also on a failure: a mounted spinner's interval would hold the process open instead.
      app.unmount();
    }
    const drawn = distinct();
    assert.equal(drawn[0], '⠋ working');
    assert.ok(drawn.length >= AT_LEAST, `only ${String(drawn.length)} distinct frames`);
    for (const frame of drawn) assert.ok(DOTS.includes(frame.slice(0, 1)), frame);
  });
});

describe('ink-text-input 6.0.0', () => {
  it('shows its placeholder, takes typed text through onChange, and submits it on Enter', async () => {
    const t = terminal();
    const seen = { changed: [], submitted: undefined };
    function Field() {
      const [value, setValue] = useState('');
      const change = (next) => {
        seen.changed.push(next);
        setValue(next);
      };
      return h(TextInput, { value, onChange: change, onSubmit: (v) => (seen.submitted = v), placeholder: 'type here' });
    }
    const app = t.mount(h(Field));
    try {
      await until(() => t.last() === 'type here', t.last);
      t.stdin.write('hi');
      await until(() => t.last() === 'hi', t.last);
      t.stdin.write('\r');
      await until(
        () => seen.submitted !== undefined,
        () => JSON.stringify(seen),
      );
    } finally {
      app.unmount();
    }
    assert.deepEqual(seen, { changed: ['hi'], submitted: 'hi' });
  });
});

describe('ink-select-input 6.2.0', () => {
  it('marks the first item, moves the mark with ↓, and selects on Enter', async () => {
    const t = terminal();
    const items = [
      { label: 'First', value: 'one' },
      { label: 'Second', value: 'two' },
    ];
    let selected;
    const app = t.mount(h(SelectInput, { items, onSelect: (item) => (selected = item) }));
    // `figures` draws the pointer as ❯, or as > where the terminal is not known to be Unicode (Windows).
    const marked = () => /^([❯>]) First\n {2}Second$/u.exec(t.last())?.[1];
    try {
      await until(() => marked() !== undefined, t.last);
      const pointer = marked();
      t.stdin.write('\u001B[B');
      await until(() => t.last() === `  First\n${pointer} Second`, t.last);
      t.stdin.write('\r');
      await until(
        () => selected !== undefined,
        () => 'nothing was selected',
      );
    } finally {
      app.unmount();
    }
    assert.deepEqual(selected, { label: 'Second', value: 'two' });
  });
});
