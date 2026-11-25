---
name: verify
description: Run the burgee CLI you changed from its build and read back exit code and output. Use before committing a behaviour change.
---

# Verify a change by running it

Tests say the parts work; this says the command a user types works. Paste the command and what it
printed into the commit's `Verified-by:` receipt.

## Boot

Build the package and what it depends on, then run its bin from `dist/`:

```sh
npx turbo run build --filter=<package>... --concurrency=2
node packages/<package>/dist/<bin> --help
```

Ready means `--help` exits 0 and lists the command you changed. A docs-site change runs
`npm run dev -w apps/docs-<package>` and is read in the browser at the port it prints.

## Drive and inspect

Run the changed command with real arguments against a real target (this checkout, a scratch git
repo under the scratchpad), never only `--help`. Read back three things: the exit code, the text
output, and `--json` where the command has it. A failing path is driven too: give it the bad input
the change is about and check the error names the fix.

## Feature map

| Feature | Reach it by | Working means |
| --- | --- | --- |
| burgee program | `node packages/burgee/dist/cli.js --help` | exit 0, lists its commands |
| hookset check | `node packages/hookset/dist/bin.js check --cwd ../eslint` | `hookset: ok` or named problems, exit 1 on errors |
| provedone gate | `printf 'x\n\nVerified-by: none (doc)\n' > m && node packages/provedone/dist/bin.js gate m --mode enforce` | exit 0; without the trailer, exit 1 naming the fix |
| triggerlist | `node packages/triggerlist/dist/bin.js match origin/main` | the checklist items the diff fires |
| truepass | `node packages/truepass/dist/bin.js diff --base origin/main` | exit 0 on a clean diff; names a weakened assertion |
| contractdiff | `node packages/contractdiff/dist/bin.js --help` | exit 0 |
| oxmutate | `node packages/oxmutate/dist/bin.js --help` | exit 0 |
| replz | `node packages/replz/dist/bin.js check` | the cases are ready, or which are not |
| other CLIs | `node packages/<name>/dist/cli.js --help` | exit 0 |
| Claude pack | `node packages/hookset/claude/<hook>.mjs --self-test` | `ok: …` |

## When it fails

Fix the code, not this skill. If a row no longer runs, fix the row in its own commit and say so.
After three failed rounds, stop and show the person the output.
