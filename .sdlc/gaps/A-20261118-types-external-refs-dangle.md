---
id: A-20261118-types-external-refs-dangle
section: A
status: open
source: 'corpus reading 2026-11-18 with the fixed grader (benchmarks/apicontract/results/2026-11-18-39d59662d1-fixed): 9 of 100 sampled documents generate and do not type-check'
done_when: 'the types target either bundles a $ref to a sibling file the spec can reach, or refuses it with a fix line naming the file, so no generated file names a type it does not declare; the corpus sample reads 0 documents that generate and fail tsc'
---

**A `$ref` into another file becomes a type the generated file never declares.** Eight Azure
Swagger 2.0 documents in the sampled corpus reference sibling files (`./loadBalancer.json#/definitions/…`)
that APIs.guru does not ship. `input-swagger2.ts` keeps the reference and the types generator writes
`definitions["FrontendIPConfiguration"]`, which tsc rejects (TS2304). Hey API refuses the same eight
("Input file not found"); openapi-typescript fails them too. Generating something that does not
compile is worse than refusing: the corpus counts it as generated, the user finds out at build time.

Two parts: refuse with a `fix:` line today (the default the types lane already uses for a dangling
local `$ref`), and bundle sibling files when they exist, which the types spec lists as the 6 open
multi-file upstream cases.

A ninth document, `apis-guru:APIs/surevoip.co.uk/9dcb0dc8/openapi.yaml`, generates and fails tsc for
a reason not yet read; it belongs to the same `done_when`.
