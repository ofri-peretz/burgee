---
'burgee': minor
---

A mistyped option now says which one was meant: `error: unknown option --nmae` / `hint: did you mean --name?`, taken from the options the command declared. Exit 2 already told an agent to rewrite the command; this is the half that says how. Previously the native path printed `node:util.parseArgs`'s own message — three lines about `--` and positional arguments, which never mentions the option the caller almost typed — while the commander façade had suggestions all along.

The edit-distance code is loaded on the failure path only, so `import { defineCommand } from 'burgee'` does not carry it. The core entry point got *smaller*, because the single-dash hint moved out of it too.
