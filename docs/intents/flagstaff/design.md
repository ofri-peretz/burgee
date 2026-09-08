# Design — flagstaff

Intent: [`intent.md`](./intent.md). **Status:** approved.

---

## Requirements

- **R1** `hoist(component, rt)` returns `{ update(state), lower() }`. On `tty` it repaints
  in place through `node:readline` cursor ops on a clock injected via `rt.clock`
  (`now()`, `schedule(fn, ms)`); on `pipe` and `ci` it writes `component.static(state)`
  once per *state change*; on `json` it writes one NDJSON event
  `{ "event": "<name>", "state": … }` per change to `rt.stderr`; on `accessible` it writes
  the static text with no cursor ops. Mode comes from `roundel/policy`, never computed here.
- **R2** A component is `{ name, static(state): string, frame?(t, state): string }`;
  `register()` throws `E_NO_STATIC_PROJECTION` with `fix` when `static` is missing.
- **R3** A plugin is `{ name, spinners?, glyphs?, tokens?, components? }`, validated at
  `register()` against `schema.json` shipped in the tarball. A spinner is
  `{ frames: string[], interval: number, static: string }`.
- **R4** Built-ins `spinner`, `progress`, `tasks`, `box`, `table` are registered through
  the public `register()` from `src/builtins.ts`; a test asserts no private path exists.
- **R5** Under any mode but `tty`, the output contains no `\r` and no ESC sequence; a
  conformance case greps a piped run.
- **R6** Façades, each its own subpath and graded by the incumbent's suite in
  `compat-oracle`: `flagstaff/ora`, `flagstaff/log-update`, `flagstaff/boxen`,
  `flagstaff/table` (cli-table3).
- **R7** No layout engine: `src/` has no `layout*` file and no measure pass; `box` and
  `columns` are string functions over `string-width`-equivalent logic in `src/width.ts`.
- **R8** `flagstaff check <file>` (the package `bin`) loads a plugin file, validates it, and
  prints its rendering in all five modes side by side; exit 1 on a schema error.
- **R9** Deterministic: with a fake clock, a spinner's TTY output for N ticks is a fixed
  string; a snapshot test runs 20 times in CI.
- **R10** Subpath isolation and weight rules per entry; ceilings: `./spinner` ≤ ora,
  `./box` ≤ boxen, `./table` ≤ cli-table3, `./log-update` ≤ log-update — recorded when
  vendored. Depends on `roundel` only.

## Design

```text
packages/flagstaff/src/
  loop.ts         hoist(): mode switch → repaint | static-per-change | ndjson | plain
  projection.ts   the per-mode writers; the only module that emits cursor ops
  plugin.ts       register(), validate() against schema.json, the plugin registry
  schema.json     the contract (also copied to apps/docs llms.txt at build)
  width.ts        display width of a string (East Asian wide, combining, ANSI-stripped)
  components/     spinner.ts progress.ts tasks.ts box.ts table.ts   (each: static + frame)
  builtins.ts     registers the five above through the public API
  facades/        ora.ts log-update.ts boxen.ts table.ts
  cli.ts          `flagstaff check <file>`
  index.ts        re-exports, no side effects
```

**The static projection is the primary artifact.** `frame()` is optional and decorative;
`static()` is required and is what the pipe, the agent, the screen reader, the docs gallery
and `flagstaff check` all read. This inverts ora's model, where the animation is the thing
and non-TTY is a fallback, and it is what makes a third-party plugin safe by construction.

**The plugin gallery is a projection too.** `apps/docs` renders every registered plugin's
`static('running')` at build time; nothing is hand-drawn.

**Order.** `loop` + `projection` with `spinner` only → `plugin` + `schema` + `check` →
the U9 eval (an agent writes a plugin from the schema) → `progress`, `tasks`, `box`,
`table` → façades one at a time, each with its scoreboard row before the next.

## Verification

- `npm test -w flagstaff` — R1 per-mode snapshots with a fake clock, R2/R3 registration
  errors, R4 built-ins-through-public-API, R5 no-escape grep, R7 file-list lock, R9
  determinism ×20, isolation, weight, shape (Z1).
- `examples/` conformance: the five plugin cases (tty animates, pipe one line per state,
  json events, accessible text, missing `static` refused).
- `npm run compat -- ora` (then log-update, boxen, cli-table3).
- `npm run evals` — U9: schema + one example → a passing plugin in one turn.
- The check that would have caught the original problem (clack #510, `\r` spam captured by
  agents): R5's grep on a piped run, red today against ora, green here by construction.

## Rejected alternatives

- **A React reconciler (Ink's model).** React plus yoga is the dependency bill this layer
  exists to remove, and a React tree has no static projection.
- **A layout engine.** U8. Box and columns are string functions; the day someone needs
  flexbox is a recorded decision.
- **Plugin discovery through `package.json`.** Configuration by another name (Z1);
  explicit `register()` only.
- **Character plugins as a separate concept.** A spinner with named states is the same
  shape; a new key would be a second contract to document.
- **Emitting `--json` events on stdout.** stdout is the envelope's; events go to stderr
  as NDJSON so a JSON consumer never sees them interleaved.

## Out of scope

- Full-screen applications, alternate screen buffer, mouse, key input (that is `caique`
  for prompts; anything more is a TUI framework and a different product).
- Ink and listr2 façades (umbrella).
- Windows legacy console quirks beyond what `node:readline` already handles.
