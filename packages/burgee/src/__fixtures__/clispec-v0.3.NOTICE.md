# clispec-v0.3.json

`clispec-v0.3.json` is The CLI Spec's schema v0.3 (<https://clispec.dev/schema/v0.3.json>),
vendored byte for byte from `schemas/v0.3.json` in
[rvben/clispec-cli](https://github.com/rvben/clispec-cli) at tag `v0.3.0` (commit
`070343ea69cc39f3b5e335d2ed12741dce969061`), the scorer version `benchmarks/floor-tools.ts`
pins. SHA-256 `ca0a051fbd6e5b464eefde009bf1ed2a2d53b896552e7a40a4fe02d307f4eff2`.

clispec-cli is published under the MIT License (its `Cargo.toml` and README), copyright its
author. The schema is used here only as test data: `scripts/clispec-document.test.ts` validates
burgee's `--schema` against it (clispec-conformance R1). It is not shipped: the package's
`files` publishes `dist` only, and nothing under `src/__fixtures__` is compiled there.
