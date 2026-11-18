# apicontract corpus — 2026-11-18-39d59662d1-fixed-bench

One row per tool over the same sampled documents. A share counts only the documents where the step was reached and measured;
"read" is ours alone (an incumbent reads and generates in one step). "Usable" = generated and type-checked under TS 5.9, 6.0 and 7.0.

| Tool | Docs | Read | Generate | TS 5.9 | TS 6.0 | TS 7.0 | Usable | Median ms | p90 ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ours:types | 127 | 100.0% (127/127) | 100.0% (127/127) | 100.0% (127/127) | 100.0% (127/127) | 100.0% (127/127) | 100.0% (127/127) | 166 | 195 |
| hey-api | 127 | — | 100.0% (127/127) | 100.0% (127/127) | 100.0% (127/127) | 100.0% (127/127) | 100.0% (127/127) | 621 | 872 |
| openapi-typescript | 127 | — | 99.2% (126/127) | 99.2% (126/127) | 99.2% (126/127) | 99.2% (126/127) | 99.2% (126/127) | 511 | 608 |

## ours:types vs hey-api

Usable for hey-api only (where we lose): 0

- none

Usable for ours:types only: 0

- none

## ours:types vs openapi-typescript

Usable for openapi-typescript only (where we lose): 0

- none

Usable for ours:types only: 1

- `kubernetes:api/openapi-spec/swagger.json`

## Most frequent errors

### ours:types

- none

### hey-api

- none

### openapi-typescript

- 1 × `Error: Unsupported Swagger version: 2.x. Use OpenAPI 3.x instead.`
