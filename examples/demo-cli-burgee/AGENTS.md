# AGENTS.md — demo

<!-- Generated from the program's declaration by `burgee skill`. Edit the declaration, not this file. -->

The burgee reference demo. Use it to greet someone, print one configuration value or fail on purpose.

## The contract

- `--json` prints one envelope on stdout: `{"ok":true,"data":…}`, or `{"ok":false,"error":{"kind","code","message"}}` with the exit code below.
- `--explain <option>` says where an option's value came from: a flag, an environment variable, a config file or the default.
- `demo --schema <command>` prints one command's full contract as JSON: its arguments, options, defaults and environment variables, and `--field <path>` prints one value of it.

| Exit | Kind | Retry | What it asks of the caller |
| :-- | :-- | :-- | :-- |
| `0` | `ok` | no | the command completed |
| `1` | `runtime` | no | it ran and failed; read the message |
| `2` | `usage` | no | bad arguments or an unknown command; rewrite the command |
| `3` | `config` | no | the config or environment did not load; fix it, not the command |
| `4` | `cancelled` | no | cancelled, or a decision is needed; decide, then run a next command |
| `6` | `timeout` | yes | the --timeout deadline passed; run it again with more time |
| `130` | `interrupted` | no | interrupted; stop |

## Commands

- `demo greet <name>`: Greet someone. Example: `demo greet ada --shout`
- `demo config get <key>`: Print one configuration value. Example: `demo config get user.name --json`
- `demo fail`: Fail on purpose. Example: `demo fail --code 3`

For any command's options, arguments and defaults, run `demo --schema <command>`; nothing here repeats them.
