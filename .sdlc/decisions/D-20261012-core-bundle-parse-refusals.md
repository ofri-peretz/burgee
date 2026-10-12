---
id: D-20261012-core-bundle-parse-refusals
subject: 'B4''s core bundled-bytes ceiling moves from 24,282 to 24,290 B for parse-refusals R1–R4'
taken: Accepted
date: '2026-10-12'
superseded_by: —
---

**The owner's ruling on #1064, 2026-10-12 (a delegated budget call): allow the core bundle to
grow by what parse-refusals measures, with the ceiling set at the measurement rounded up to the
next 10 B, not further, and kept a downward-only ratchet from there.** The ceiling is `burgee` in
`benchmarks/axes/weight.ts`. It moves 24,282 → 24,290.

## The bytes

Measured with `npm run bench -- --axis weight` on `main` at `a2ba5ad` (burgee 1.3.0) plus #1064.
The core bundle is `import { run } from 'burgee'`, bundled, minified and split by esbuild,
initial load only.

| Tree | Core bundle |
| :-- | --: |
| `main` | 24,277 B (#1064's base, reading the CI-equivalent local measure) |
| #1064 first version, the gate as a helper | 24,340 B |
| #1064 R1–R3, the gate inline and the export named `refuse` | 24,281 B |
| #1064 R1–R4 | 24,285 B |

The ruling was written against the 24,340 B reading and allowed up to 24,350 B. Most of that
came back first, without changing behaviour:

- `schemaOf` and `summaryOf` share one tail (`withProgram`);
- the missing-argument check moved into the same lazy chunk;
- the gate went inline;
- a repeated option is found by count, not by a filter.

What remains is R4's two extra arguments to the chunk (`rest`, `typed`), which tell it whether
the words it would leave out are the line's. That is 4 B over the old ceiling, so the ceiling is
24,290.

## What it buys

A native command no longer drops a surplus positional or the first value of a single-value flag
given twice and exits 0. It refuses with exit 2, kind `usage`, and a `fix:` line that runs (R4).
commander 15 also refuses an excess argument by name (`packages/burgee/src/compat.ts`, its
excess-arguments error); the commander and yargs façades are unchanged by this. An agent's
malformed call no longer reads as success. clispec and cli-agent-lint both score a usage error
that names the input and the fix.

## Reversal

Move the gate back into a helper and drop R4's `rest`/`typed` arguments, then lower the ceiling
to what is measured. R4 alone is the 4 B; without it the core reads 24,281 B and the old 24,282
holds. The ceiling only moves down from here.
