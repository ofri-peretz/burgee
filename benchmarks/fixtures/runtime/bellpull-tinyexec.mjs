/**
 * bellpull ÷ tinyexec: spawn `node --version` by name, wait for it to close, read what it printed.
 *
 * bellpull R8's spawn half — "spawn delta at or under `tinyexec`". Each call is the one a program
 * makes to run a tool and read its answer: `run(cmd, args, { runtime })` against `x(cmd, args)`,
 * both awaited to the child's close with its stdout collected. The child is the same binary on
 * both sides, so the ratio moves only with what each library adds around the spawn — resolution,
 * the environment it builds, how it collects the output. `node --version` rather than `true`
 * because every machine that runs this has it, Windows included, and it exits before it
 * initialises V8, so the child is as cheap as a portable child can be.
 *
 * The `PATH` both sides read starts with the directory of the `node` running this, so a bare
 * `node` resolves to the same file for bellpull (which searches `PATH` itself) and for tinyexec
 * (which prepends `node_modules/.bin` and that same directory, then lets the OS search). Without
 * it an nvm shell could hand each side a different node, and `check()` would stop the run.
 */
import assert from 'node:assert/strict';
import { delimiter, dirname } from 'node:path';

import { ambientRuntime, run } from 'bellpull';
import { x } from 'tinyexec';

process.env.PATH = `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ''}`;

const COMMAND = 'node';
const ARGS = ['--version'];

const ours = async () => (await run(COMMAND, ARGS, { runtime: ambientRuntime() })).stdout;
const theirs = async () => (await x(COMMAND, ARGS)).stdout;

export default {
  n: 20,
  async check() {
    const [a, b] = [await ours(), await theirs()];
    // `trim()` for the line ending alone: a Windows child writes `\r\n`, and either side reading
    // a different node, or nothing, still fails here.
    assert.equal(a.trim(), process.version);
    assert.equal(a, b);
  },
  ours,
  theirs,
};
