---
"contractdiff": patch
---

`migrate` writes `out` as the folder `gen` writes into. `migrate openapi-typescript` copied `-o src/api/types.ts` into `out`, which `gen` reads as a folder, so the next `gen` wrote `src/api/types.ts/types.ts`; it now writes `out: "src/api"`, and an output file named other than `types.ts` is an `output-renamed` finding naming the import to change. `migrate openapi-fetch` puts the `fetch` target in the same folder, and `migrate orval` uses the folder of orval's `target`. The `read` field lists what the settings were read from (the incumbent's config file and `package.json`) instead of `null` when there was no config file.
