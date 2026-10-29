# Vendored report schemas

`src/schemas.test.ts` validates oxmutate's two machine-readable reports against these
files (`SC4` in `.sdlc/intents/oxmutate/intent.md`). They are copied byte for byte and never
edited. To move to a newer version, replace the file, update its row below, and rerun the test.

| File | What it validates | Source | Version | Fetched |
| :-- | :-- | :-- | :-- | :-- |
| `mutation-testing-report-schema.json` | `mutation.json`, Stryker's JSON report | npm `mutation-testing-report-schema`, file `dist/src/mutation-testing-report-schema.json` (<https://www.npmjs.com/package/mutation-testing-report-schema>, source <https://github.com/stryker-mutator/mutation-testing-elements/tree/master/packages/report-schema>) | 3.8.4 | 2026-10-29 |
| `sarif-2.1.0.json` | `mutation.sarif` | <https://json.schemastore.org/sarif-2.1.0.json>, the URL oxmutate writes as the report's `$schema` | 2.1.0 | 2026-10-29 |

## Why these versions

- **3.8.4** is the version `@stryker-mutator/core` 10.0.0 and 10.1.1 depend on, and the version
  of `mutation-testing-elements` that oxmutate's HTML report loads. The vendored file is
  byte-identical to the copy that `@stryker-mutator/core` installs in this workspace.
- **SchemaStore's SARIF 2.1.0 file, not OASIS's.** OASIS publishes the same schema as JSON
  Schema draft-04
  (<https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/schemas/sarif-schema-2.1.0.json>).
  SchemaStore's copy is draft-07, so the `ajv` 8 that `@stryker-mutator/core` already brings can
  compile it without another dependency. Its `$id` names the OASIS TC's own repository
  (`oasis-tcs/sarif-spec`).

## SHA-256

```text
7ec748e7493aa685dd4013d3fc87ebcb0058451ca117966c9e4f7be85cdf79ae  mutation-testing-report-schema.json
c96eb2d311c37b0a38cbd18c52d79a68f778bbd2d831abed7412d9850740f785  sarif-2.1.0.json
```

## Licences

- `mutation-testing-report-schema` is Apache-2.0. Its licence is copied beside it as
  `LICENSE.mutation-testing-report-schema`.
- The SARIF 2.1.0 schema is an OASIS work product, published for implementers of the
  standard to use. SchemaStore serves it under its own Apache-2.0 licence.
