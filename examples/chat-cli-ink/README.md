# chat-cli-ink — the chat boilerplate, written for Ink

[`examples/chat-cli`](../chat-cli) written as an Ink program: `ink`, `react`, `ink-text-input`
and `ink-spinner`, with no build step (`React.createElement`, not JSX). Its `package.json`
resolves `'ink'` to `controlroom/ink`, so the same file runs on the drop-in without a changed
line — and it runs on ink itself if you point that line back at ink.

It runs **inline**, as Ink draws: the transcript is `<Static>` and flows into your terminal's
scrollback, and a live region under it holds the reply as it streams, a status line with a
spinner, the elapsed time and a token count, and the input line.

```bash
npx degit ofri-peretz/burgee/examples/chat-cli-ink my-chat
cd my-chat && npm install && node chat.mjs
```

**Not on npm yet:** `controlroom/ink` ships in the first `controlroom` release that is not a
reservation. Until then this directory runs inside the repository, where CI installs it alone
against the packages built there (`scripts/ink-alias-lock.test.ts`).

| Key | What it does |
| :-- | :-- |
| `Enter` | send |
| `↑` `↓` | history |
| `Tab` | complete a `/command` |
| `Esc` | interrupt the reply |
| `Ctrl+C` | quit, and hand the terminal back |

A reply that wants to run a tool asks first: type `y` or `n`.

## What to change first

1. **`MODEL`**: the scripted model. Replace `reply(prompt)` with your client, and feed its
   tokens to `stream()` in `conversation()` instead of the scripted words.
2. **`COMMANDS`**: the slash commands, and what `submit()` does for each.
3. **`complete`**: completion for the input line. `@file` completion goes here.

## The one line that makes it controlroom

```json
"ink": "file:./ink"
```

`ink/` is a two-file package, `export * from 'controlroom/ink'`, versioned at the ink API the
drop-in implements, so `ink-text-input`'s and `ink-spinner`'s peer range on ink is met and npm
installs no other ink. Change the line to `"ink": "6.8.0"` and delete `ink/` to run on ink.

## Try every caller

```bash
node chat.mjs                                  # a terminal
printf 'hello\n/help\n' | node chat.mjs        # a pipe: one prompt per line, then exit
```

**There is no `--json`.** Ink has no structured output to project: it draws frames, and a pipe
gets its linear screen-reader output. `node chat.mjs --json` refuses with exit 2 and says so.
An agent that wants NDJSON on stderr wants [`examples/chat-cli`](../chat-cli), on
controlroom's native API.

Two smaller differences from `chat-cli`: the reply prints as its markdown source (Ink has no
markdown component; add one in the live region), and the input line is single-line, as
`ink-text-input` is.

`npm test` runs the checks this repository's CI runs on it, with `node:test`, so it needs nothing
else installed.
