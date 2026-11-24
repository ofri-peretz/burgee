---
"contractdiff": minor
---

`extract --from standard-schema` reads truefit's schemas. A plain truefit schema, or one wrapped by `truefit/standard`, has no `~standard.jsonSchema`, so the extractor dropped it without a word and wrote an empty `$defs`; it now writes it through `truefit/json-schema`, as `standardJson(…)` would. A module that exports no schema the extractor reads is a `no-schemas` finding instead of an empty document alone. `extract --help` names only the extractors that run (`standard-schema`, `openapi-from-schemas`, `ts-rest`): the NestJS, Hono and tRPC extractors it named are not built yet.
