# Intent — quiet mode

**Status:** review

## What is wanted

`--quiet` makes the tool print only its result.

## Why now

A script that calls the tool cannot silence its progress lines.

## Success criteria

- `tool build --quiet` prints exactly one line.
