---
id: A-20261009-chat-ink-windows-lost-line
section: A
status: open
source: 'Compatibility run 37977377554, job "Node 24 · windows-latest" (release PR #923)'
done_when: 'the next failure''s status, signal, stdout and stderr are written here, and either a test that fails on the unfixed code reproduces the cause and the fix makes it pass, or the evidence shows a runner artefact'
---

`ink-alias-lock` installs `examples/chat-cli-ink` alone and runs its own tests. On
Windows, in one run, `prints each entry once` failed. It pipes `hello\n` into the app and
expects `> hello` to appear exactly once. It appeared **zero** times
(`stdout.split('> hello').length` was 1). The case before it, which pipes nine lines,
passed in the same job. This is the first such failure in about 30 recent Compatibility
runs. Every other cell, macOS and Linux included, passed.

**First hypothesis, ruled out.** The readline listeners attach in `useEffect`, so a fast
pipe might deliver the line before them. But `render()` without concurrent mode goes through
`updateContainerSync` then `flushSyncWork` (`packages/controlroom/src/ink/host.ts`), and React
flushes a sync render's passive effects inside the commit. So the listener exists before
`render()` returns, and stdin cannot emit before then. 40 in-process runs on macOS, with stdin
written before `run()` and in the same tick as `render()`, lost the line 0 times.

**Cause unknown.** The assertion counted `> hello` and threw away the rest, so the one failing
run says only that stdout lacked it. It is not known whether stdout was empty, whether stderr
had anything, or how the process exited. The case now puts status, signal, stdout and stderr
in its failure message, so the next occurrence names itself.
