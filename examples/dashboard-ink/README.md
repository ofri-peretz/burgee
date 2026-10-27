# dashboard-ink — the reference dashboard's screen, written for Ink

[`examples/dashboard`](../dashboard)'s screen as an Ink program: `Box`, `Text` and `useInput`
from `ink`, `Spinner` from `@inkjs/ui`, and `React.createElement` instead of JSX, so there is no
build step. A tab line, a learn panel beside a checklist, a log pane, and `←` `→` to switch tabs.

It is controlroom's **Ink screen fixture**: the program an Ink user would write for this screen
today. Its `package.json` resolves `'ink'` to `controlroom/ink`, for `screen.mjs` and for
`@inkjs/ui` alike, so the same file runs on the drop-in without a changed line, with
`react-reconciler` installed. It is also the other side of controlroom's W3 weight gate: the
benchmark bundles this file against ink itself and `examples/dashboard` against controlroom.

```bash
npx degit ofri-peretz/burgee/examples/dashboard-ink my-screen
cd my-screen && npm install && node screen.mjs
```

| Key | What it does |
| :-- | :-- |
| `←` `→` | switch tab |
| `q`, `Ctrl+C` | quit |

## The one line that makes it controlroom

```json
"ink": "file:./ink"
```

`ink/` is a two-file package, `export * from 'controlroom/ink'`, versioned at the ink API the
drop-in implements, so `@inkjs/ui`'s peer range on ink is met and npm installs no other ink.
Change the line to `"ink": "8.0.0"` and delete `ink/` to run on ink.

## Off a terminal

```bash
node screen.mjs | cat            # one line per finished step, then exit
node screen.mjs < /dev/null      # the same: no key is ever waited for
```

Off a terminal it reads no key (`useInput` is active only when stdin and stdout are both
terminals) and prints each finished step once, through Ink's screen-reader output, then exits
when the work ends. **There is no `--json`**: Ink has no structured output to project. The
native-API [`examples/dashboard`](../dashboard) writes NDJSON to stderr.

`npm test` runs the checks this repository's CI runs on it, with `node:test`, so it needs nothing
else installed: the `'ink'` resolution, the clean pipe, 100 runs each with stdin at `/dev/null`
and at a pipe nobody writes to, and the keys on a stand-in terminal.
