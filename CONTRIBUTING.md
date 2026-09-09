# Contributing

The most useful contribution to this project is **an adopter we did not write** — a real CLI
ported over, and a report of what broke. That is the only compatibility evidence that counts,
and every failure becomes a case in the conformance suite.

## The loop

```bash
npm install
npm test                    # every lock and unit test; exits non-zero on failure
npm run lint                # eslint, workflows, markdown, and the brand drift check
npm run ci:local            # the whole pre-push battery, before GitHub runs it
```

`lefthook` installs on `npm install`: commits are linted for conventional-commit format, and
`pre-push` runs typecheck, test and build across every workspace so you find out locally
rather than in Actions.

## How changes are shaped

This repo follows the AI-native SDLC: a change of any size lands its intent and design as
files before it lands as code, in [`.sdlc/intents/<slug>/`](./.sdlc/intents/). The four rules
that bind every session are worth reading before opening a pull request:

1. **Hand off through a file.** A decision that lives only in a chat log cannot be reviewed,
   diffed, or replayed.
2. **Give yourself a feedback loop before you start** — one command that exits non-zero on
   failure. Never edit the test to make it pass.
3. **A human accepts at Design→Build and at Deploy.** The agent that wrote the code does not
   approve it.
4. **A fix is not done until a check would have caught it**, and the check is proven to fail
   on the unfixed state.

## What the checks will hold you to

- **Zero runtime dependencies** in every published package. This is not negotiable; it is the
  reason the numbers in the README are what they are.
- **Every ESLint rule at `error`**, across 11 Interlace plugins, with no warnings allowed.
  Exceptions are named in `eslint.config.mjs` with a reason.
- **The shape lock (`Z1`)**: the published tarball must still work from one file, with no
  build step, no config and no scaffold. A change that needs a second file turns CI red.
- **The brand drift check**: every asset in `brand-assets/` is generated. Edit the
  declaration in [`scripts/brand.mts`](./scripts/brand.mts) and run `npm run brand`; never
  edit an asset by hand.
- **A compat façade is never called "compatible"** below 100% on its host's own suite. Pass
  rates are published, not rounded.
- **A changeset, whenever a PR touches `packages/*/src` or a `package.json`.** Run
  `npm run changeset` and commit what it writes; CI fails without one. If the change really
  is internal, the `skip-changeset` label is the override — a decision someone signs, rather
  than an omission that reaches a release with no version bump and no changelog line.

## Reporting

- **Ported a CLI and something broke?** [Open an issue](https://github.com/ofri-peretz/burgee/issues)
  with the smallest program that shows it. This is the highest-value report we get.
- **Found a bug?** Same place. Include the Node version and the exact argv.
- **Security?** See [SECURITY.md](./SECURITY.md) — please do not open a public issue.
