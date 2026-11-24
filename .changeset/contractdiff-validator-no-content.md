---
"contractdiff": patch
---

`gen validator` writes a payload that says nothing is sent (a response or a request body with no content) as a guard of `undefined`: `export type X = undefined` and `(value): value is X => value === undefined`. It used to write `!(true)`, which rejected every value, `undefined` included, beside a type of `unknown`.
