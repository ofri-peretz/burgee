# dashboard — a controlroom boilerplate

A full-screen dashboard in the shape of PostHog's setup wizard: four tabs (Status, Tail logs,
Visualizer, HN), a checklist with progress and the wizard's `◼ ▶ ◻` marks, a log tail, and a
status line that collapses, in the alternate screen. The same program prints clean lines to a
pipe, in CI and for a screen reader, and NDJSON under `--json`. It never waits for a key that
nobody can press. [`examples/dashboard-ink`](../dashboard-ink) is the same screen written for
Ink.

```bash
npx degit ofri-peretz/burgee/examples/dashboard my-dashboard
cd my-dashboard && npm install && node dashboard.mjs
```

| Key | What it does |
| :-- | :-- |
| `←` `→` | switch tab |
| `s` | collapse or expand the status line |
| `q`, `Ctrl+C` | quit, and hand the terminal back as it was |

## What to change first

1. **`STEPS`**: the work. Each step has a `title` and the `log` lines it produces. In your
   program, run the real work where `advance()` marks a step running, and push its output into
   `lines`.
2. **`layout()`**: the arrangement per tab. Sizes are cells, `{ fr, min }` or `'fit'`; see
   [controlroom's layout](https://github.com/ofri-peretz/burgee/tree/main/packages/controlroom#api).
3. **`KEYMAP` and `LABELS`**: the keys. The hint line is generated from them, so it can never
   name a key that does nothing.
4. **The `register()` call**: the marks, as a flagstaff plugin. Delete it to keep flagstaff's own
   `✔`, a blank pending mark and a spinner.
5. **The `visualizer` and `hn` panes**: the tabs that are your app's own. The Visualizer draws
   the run as a bar and is `liveOnly`, because off a terminal the status line already prints the
   same count.

The tab bar, the hint line and the Visualizer are `liveOnly`: a pipe gets every other pane's own
static projection instead, under its label.

## Try every caller

```bash
node dashboard.mjs               # a terminal: the full screen
node dashboard.mjs | cat         # a pipe: one clean line per change
node dashboard.mjs --json        # an agent: NDJSON on stderr
CLI_ACCESSIBLE=1 node dashboard.mjs
```

`npm test` runs the same checks this repository's CI runs on it.
