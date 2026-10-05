# dashboard — a controlroom boilerplate

A full-screen dashboard in the shape of PostHog's setup wizard: tabs, a checklist with
progress, a log tail, and a status line that collapses, in the alternate screen. The same
program prints clean lines to a pipe, in CI and for a screen reader, and NDJSON under `--json`.
It never waits for a key that nobody can press.

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

The tab bar and the hint line are `liveOnly`: a pipe gets every pane's own static projection
instead, under its label.

## Try every caller

```bash
node dashboard.mjs               # a terminal: the full screen
node dashboard.mjs | cat         # a pipe: one clean line per change
node dashboard.mjs --json        # an agent: NDJSON on stderr
CLI_ACCESSIBLE=1 node dashboard.mjs
```

`npm test` runs the same checks this repository's CI runs on it.
