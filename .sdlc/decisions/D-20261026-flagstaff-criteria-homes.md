---
id: D-20261026-flagstaff-criteria-homes
subject: 'flagstaff: four success criteria name a home their checks never lived in (a demo, `burgee/testing`, a piped demo run, `burgee plugin check`). Are they held where the checks actually are, or open?'
taken: 'Taken by the coordinator under the owner''s delegation (burgee-owner-delegates-tradeoffs), 2026-10-26, in the umbrella sweep'
date: '2026-10-26'
superseded_by: —
---

**Held where the checks are, for criteria 1–3. Criterion 7 is renamed and still open.** Each
restatement changes the address of a check and never the behaviour it asserts. The old text stays
in `intent.md`. The roadmap tracker has asked for this edit since 2026-10-18 ("S1–S3, restate
where they live"), and `spec.md` § Requirements restated (2026-09-16) already made the same move
for R5.

| # | written | where the check is | why the address changed |
| :-- | :-- | :-- | :-- |
| 1 | "the five plugin conformance cases pass on the demo" | the caller matrix, `examples/conformance/src/callers.ts`, rows `spinner` and `plugins` × the five callers, held by `scripts/callers-lock.test.ts` › "names, in every held cell, a test file that exists and a test title that file contains" and published at `/docs/callers` (`caller-matrix`, shipped). The cells cite `packages/flagstaff/src/loop.test.ts` (describe "one component, five modes") and `packages/flagstaff/src/cli.test.ts` › "prints the plugin in all five modes side by side and exits 0". The refusal case is `packages/flagstaff/src/plugin.test.ts` › "R2 · a contribution without a static projection is refused", and through the family's command `scripts/plugin-example-lock.test.ts` › "burgee check refuses a spinner with no static projection, with flagstaff’s own code and fix" | no `examples/demo-cli-*` program draws with flagstaff, and the demos exist to compare commander, yargs and burgee on the same commands. The behaviour is asserted per mode in-package, and the caller matrix is the place that collects "every caller, every feature" |
| 2 | "a spinner snapshot test in `burgee/testing` is deterministic across 20 runs in CI" | `packages/flagstaff/src/loop.test.ts` › "the tty transcript is the same bytes twenty runs over", under `manualClock()`. It runs in `quality-full.yml`'s `turbo run test` on every non-draft PR (restated by `cli-output-stack` S6) | `burgee/testing` is the engine's harness. A spinner is flagstaff's, and burgee reaches the output stack only through guarded `import()` (U13), so a spinner surface in `burgee/testing` would be an engine-to-layer edge the family forbids |
| 3 | "`grep -c $'\r'` over a piped run of the demo reads 0" | `packages/flagstaff/src/shape.test.ts` › "prints one line per state through a pipe: no carriage return, no escape", a real piped child process of the **installed tarball**; plus `loop.test.ts` (describe "off a terminal, no carriage return and no cursor escape") across pipe, ci, json and accessible | same as 1. The tarball run is stricter than a demo run, because it proves the published artifact |
| 7 | "passes `burgee plugin check`" | the command shipped as `flagstaff check`. `burgee check` runs every installed layer's check (`plugin-contract` C3, restated in [D-20261025-plugin-contract-design-accepted](./D-20261025-plugin-contract-design-accepted.md)). The case is `evals/cases/flagstaff-plugin-from-schema.json` | `burgee plugin check` never existed (`error: unknown command "plugin"`). **Still open**: every executed weekly run has passed (2026-10-08, 2026-10-09), and the two since were `not-run` (usage limit, 2026-10-15 and 2026-10-22). It is held when the next scheduled run executes and passes, and it is read the way `plugin-contract` C4 is |

**Not restated: criterion 8**, "a plugin registered once appears in help (theme), in a prompt's
spinner, and as events under `--json`, one conformance case per surface". It stays open as
written. `plugin-example-lock` proves one object registers in every host and renders flagstaff's
spinner in five modes. Nothing asserts the three named surfaces with one case each. One of them
is not buildable as written: caique does not depend on flagstaff
(`packages/caique/package.json`; `cli-output-stack` records it), so "a prompt's spinner" from a
flagstaff registration has no path today. Closing it needs either the three cases, or a decision
that names caique's own spinner surface as the prompt half. That is a design choice for the
output stack, and it is not made here.
