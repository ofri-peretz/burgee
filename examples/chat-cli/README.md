# chat-cli — a controlroom boilerplate

A chat CLI in the shape of Claude Code, on controlroom's native API. It runs **inline**: the
transcript flows into your terminal's own scrollback, and a live region under it shows the
reply as it streams, a status line, and the input line.

```bash
npx degit ofri-peretz/burgee/examples/chat-cli my-chat
cd my-chat && npm install && node chat.mjs
```

| Key | What it does |
| :-- | :-- |
| `Enter` | send; `Meta+Enter` or `Ctrl+J` for a new line |
| `↑` `↓` | history |
| `Tab` | complete a `/command` |
| `Esc` | interrupt the reply |
| `Ctrl+C` | quit, and hand the terminal back as it was |

A reply that wants to run a tool asks first: type `y` or `n`.

## What to change first

1. **`MODEL`**: the scripted model. Replace `reply(prompt)` with your client, and stream
   its tokens into `stream()` instead of the scripted words.
2. **`COMMANDS`**: the slash commands, and what `submit()` does for each.
3. **`complete`**: completion for the input line. `@file` completion goes here.

The reply, the status line and the hint line are `liveOnly`: a pipe and an agent get the
transcript itself.

## Try every caller

```bash
node chat.mjs                                  # a terminal
printf 'hello\n/help\n' | node chat.mjs        # a pipe: one prompt per line, then exit
printf 'hello\n' | node chat.mjs --json        # an agent: NDJSON on stderr
```

`npm test` runs the same checks this repository's CI runs on it.
