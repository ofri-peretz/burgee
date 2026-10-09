---
id: A-20261009-chat-ink-windows-lost-line
section: A
status: open
source: 'Compatibility run 37977377554, job "Node 24 · windows-latest" (release PR #923)'
done_when: 'the cause is reproduced by a test that fails on the current examples/chat-cli-ink/chat.mjs, and the fix makes it pass; or the case is shown to be a runner artefact with the evidence written here'
---

`ink-alias-lock` installs `examples/chat-cli-ink` alone and runs its own tests. On
Windows, in one run, `prints each entry once` failed. It pipes `hello\n` into the app and
expects `> hello` to appear exactly once. It appeared **zero** times
(`stdout.split('> hello').length` was 1). The case before it, which pipes nine lines,
passed in the same job. This is the first such failure in about 30 recent Compatibility
runs. Every other cell, macOS and Linux included, passed.

**Leading hypothesis, not proven.** `run()` creates the readline interface before
`render()`, but the `'line'` and `'close'` listeners are attached in `useEffect`, after the
first commit. If a fast pipe delivers the line before the effect runs, `'line'` fires with
no listener and is dropped. `'close'` then arrives after subscription and the program exits
0 with an empty transcript. That matches the log exactly.

**Why it is not fixed yet.** An in-process reproduction on macOS, 20 runs of `run()` with
stdin fully buffered and ended before render (both `Readable.from` and a pre-ended
`PassThrough`), lost the line 0 times. Moving `createInterface` into the effect is the
obvious change, but a fix without a test that fails first is not done (AI_NATIVE_SDLC
rule 4). The next step is the same reproduction on a Windows runner, or forcing the
effect to run late (for example, delaying passive effects) to show the drop on any OS.
