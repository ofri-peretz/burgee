---
id: D-20261008-ok-follows-exit-code
subject: 'Is a `--json` envelope `ok` when the command returned a non-zero `exitCode` (E1), as `burgee check` does on a refused plugin and `burgee migrate` does with refusals present?'
taken: Taken
date: '2026-10-08'
superseded_by: —
---

**No: `ok` is false exactly when the process exits non-zero, and `data` stays.** `emit()` wrote
`ok: true` for every command that returned, so `burgee check <plugin> --json` on a refusal
printed `{"ok":true,"data":{"refused":{…},"exitCode":1},…}` and exited 1. D-140 already says
`ok: false` is what stops a failure being read as a result; an agent that branched on `ok` read
a pass on a run the shell was told failed, and the README had to tell plugin authors to ignore
`ok` (#848). `--mcp` already disagreed with the envelope it carried: its `isError` is the exit
code, so the same run was `isError: true` around `ok: true`.

The envelope keeps `data` and gains no `error`. E1's point is that a run can report *and* fail
in one answer: the refusal list is what an agent acts on, and the code is what it branches on
(see `exitCodeOf`). A thrown failure stays `{ ok: false, error }` from `report()`; a returned
one is `{ ok: false, data, meta }`. A caller tells them apart by which key is present. `ok` now
has one meaning on every path: the exit status was 0.

Breaking only for a caller that read `ok: true` alongside a non-zero exit, which is the reading
this removes. Shipped as a patch while burgee is 0.x.

Cost: `import { run } from 'burgee'` bundled 24,260 -> 24,270 B (ceiling 24,282, unchanged);
`dist/execute.js` 15,037 -> 15,076 B, inside the `.` budget. `agent-format.test.ts` (a returned
`exitCode: 1` under `--json`) and `migrate-cli.test.ts` (refusals present), both proven to fail
on the unfixed `emit()`.
