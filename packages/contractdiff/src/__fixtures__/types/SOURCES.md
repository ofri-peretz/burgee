# Types fixtures

Hand-written documents for the `types` target's multi-file and reference cases
(gap `A-20261118-types-external-refs-dangle`).

- `external/`: an OpenAPI 3.1 document split over five files. `openapi-typescript.7.13.0.txt` is
  what `openapi-typescript@7.13.0 external/openapi.yaml` writes, unchanged; the drop-in must match it
  byte for byte.
- `naming/`: the names Redocly gives hoisted members when the first choice is taken. Checked
  against openapi-typescript 7.13.0, which agrees on every name but `a/b` (it writes `a~1b` and
  refers to `a/b`, a member it never declares).
- `swagger2/`: the Azure shape the corpus failed on: `./loadBalancer.json#/definitions/…` from a
  Swagger 2.0 document, with the sibling files present.
- `refusals/`: a missing sibling (`network.json`, the same shape without `loadBalancer.json`), a
  pointer that leads nowhere, a sibling that does not parse, a remote address, and a path item
  that contains itself.
- `surevoip/`: the shape of `apis-guru:APIs/surevoip.co.uk/9dcb0dc8/openapi.yaml`, which refers
  to a schema under a Media Type Object.
