# Intent — faster help

**Status:** approved

## What is wanted

`tool --help` prints from the command declarations alone, without importing any command's module.

## Why now

Help takes 900 ms on a cold start because it loads every command to read its description, and
agents call it before every unfamiliar command.

## Constraints

No change to what help prints.
