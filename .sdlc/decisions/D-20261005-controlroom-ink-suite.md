---
id: D-20261005-controlroom-ink-suite
subject: 'controlroom phase 1 (spec R13, R17): at which releases are Ink''s and `@inkjs/ui`''s suites vendored, what does each row target before `controlroom/ink` exists, and what did the oracle need to grade them?'
taken: Taken
date: '2026-10-05'
superseded_by: —
---

**ink at 6.8.0 and `@inkjs/ui` at 2.0.0, both graded against the package root `controlroom` until `controlroom/ink` is built, with three harness changes: `Host.alias`, `Host.publishedInternalDir`, and a `test.todo` that is not counted as a failure.** Control, darwin, 2026-10-05: **ink 593 / 593** (internals 148 / 148), **`@inkjs/ui` 103 / 103**. Target `controlroom`: 0 / 593 and 0 / 103, measured. The Ubuntu numbers are CI's, and the baselines carry CI's reference.

**The releases.**

- **ink 6.8.0** (2026-02-19), the last 6.x. It is the release `controlroom/intent.md` names in done-when 5 and the one the phase brief asked for, and it runs on ava, which is the runner R13 names. It is **not** the current major, which C1 asks for first. ink has published 7.0.0 to 7.1.1 (still ava) and **8.0.0 on 2026-10-03**, two days before this, whose suite moved to `node --import=tsx --test`. The pin is written in `pinnedVersion`, as slice-ansi's was, so a re-vendor cannot move it silently, and the daily upstream check reports 8.0.0 against the record. Grading 8.0.0 means teaching the `node:test` arm a TypeScript loader (the `tap` arm already has `tsLoader`); grading 7.1.1 needs nothing new. Both are follow-ups, and 6.8.0 then becomes a `PREVIOUS_MAJORS` row.
- **`@inkjs/ui` 2.0.0** (2024-05-22), the latest. Its suite pins its own devDependencies: `ink ^5.0.0` and `react ^18.3.1`, resolved to **ink 5.2.1 and React 18.3.1**. So the drop-in is graded on React 19 by ink's row and on React 18 by this one. Phase 3 has to run on both reconciler lines, or re-pin this row's control to ink 6.8.0 by a new decision.

**The target is the root, not `controlroom/ink`.** D-006 says a row at zero names the root, and D-007 says a façade is named only once it exists. Naming `controlroom/ink` today would publish `target not built yet` where a measured number belongs. The root `controlroom` exports `status` and nothing else, so both rows measure 0 at link time. The change that builds R11 moves both rows to `controlroom/ink`, as `caique` moved to `caique/inquirer`.

**`Host.alias`: how `@inkjs/ui` is graded without a façade.** R17 says `@inkjs/ui` runs unmodified with `'ink'` resolved to the drop-in, and there is no `@inkjs/ui` façade. The oracle's model is the other way round: the suite's own import is swapped for the target. Swapping it here would grade `controlroom` in place of `@inkjs/ui`. So an aliasing host's shim hands the suite its library (`@inkjs/ui`) on both runs. On a target run, a resolve hook (`module.registerHooks`), loaded through `NODE_OPTIONS`, sends every resolution of `ink` to the target: the suite's own, `@inkjs/ui`'s, and `ink-testing-library`'s. A control run loads nothing. `grade.test.ts` proves it in a real child process, and it was red with the hook removed. `scripts/migrate-drop-ins-lock.test.ts` leaves an aliasing row out of `DROP_INS`: `@inkjs/ui` is not replaced, so its import is not a drop-in pair, and the pair it exercises (`ink`) is ink's own row.

**`Host.publishedInternalDir`: ink's internals ship compiled.** ink's tests import `../src/write-synchronized.js` and `../src/parse-keypress.js`, and ink publishes only `build/`. The control fell back to the package by name, whose entry has neither name, and `render.tsx` and `kitty-keyboard.tsx` died at link time against ink itself. Now the control's path is `build/<same name>`, linked rather than re-exported, because `export *` drops the `default` that `parseKeypress` is. A target run never reads the field.

**A `test.todo` is not a case.** supertap, ava's TAP, adds a todo to `# fail` and leaves it out of `# tests`. ink's one todo (`hooks › useStderr - write to stderr`) read as a failure of ink. `parseNodeTest` subtracts todo lines in that dialect only. node:test prints its own `# todo` line and never counted them.

**Two environment facts, each named in `hosts.ts`.**

- ink's own CI runs its suite with `CI=false` and `FORCE_COLOR=true` (`.github/workflows/test.yml`). Under the runner's `CI=true` ink takes its CI path, and one darwin measurement read 457 / 593 against ink itself. The host declares upstream's two variables.
- `@inkjs/ui` loads TypeScript with `--import=tsimp`, and tsimp 2.0.12 on Node 24 loads nothing: ava reports `Timed out while running tests` with 0 cases. Its block runs `--import=tsx`, the loader ink's suite uses, and no assertion is touched. This is the substitution signal-exit's `tsLoader` already made.

**PTY cases: 78, none excluded.** `exit` 13, `hooks-use-input` 16, `hooks-use-input-navigation` 17, `hooks-use-input-kitty` 15, `render` 10, `hooks` 5 and `components` 2 spawn a fixture through `node-pty`. `node-pty` 1.2.0-beta.15 ships prebuilds for linux-x64, darwin and win32, and all 78 pass in the control. If the Ubuntu control ever loses them, they become `excludes` with `exact` titles and this reason, not a lowered reference.

**Left for phase 3, and not built here.** On a target run the target's own peers (`react`, `react-reconciler`) resolve from `packages/controlroom`, outside the vendored tree, while the suite's `react` is the copy in `vendor/<host>/node_modules`. Two Reacts break hooks. The fix is the same mechanism as `alias`, applied to the peers, and it can only be proven once there is a reconciler to load.
