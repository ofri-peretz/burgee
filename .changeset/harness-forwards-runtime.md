---
'burgee': patch
---

`runBurgee` forwards `cwd`, `stdin` and TTY-ness to the engine. It did not.

The harness built a whole `fakeRuntime` — argv, env, cwd, stdin, per-stream TTY-ness, exit,
clock — and then passed **six of those nine** to `execute`. The other three were computed and
dropped, which `.sdlc/intents/burgee/spec.md` records as T1 and calls *"the row most likely to
make a test pass for the wrong reason"*. It is, and precisely:

- **`tty: true` changed nothing.** `execute` reads TTY-ness off `opts.stdout.isTTY` and hands it
  to `detectAgent`; the harness passed a bare `{ write }`. A test asking for a terminal got the
  non-interactive floor and asserted on it happily.
- **`cwd` changed nothing.** Config discovery starts at `io.cwd`, which fell through to
  `host.cwd()` — the *real* process directory. A test pointing at a fixture tree was reading the
  repository it was running in.
- **`stdin` changed nothing**, so nothing that reads it could be driven through the harness at all.

`testing-harness-forward.test.ts` is the check and both cases were proved to fail on the
six-field version: `interactive` read `[false, false]` for `tty: true`/`false`, and a
`<name>.config.json` under the given `cwd` never reached the handler.

The cost is **92 bytes** on `burgee/testing`, which is test-time only.
