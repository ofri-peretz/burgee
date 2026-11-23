# Design — protobuf in apicontract, through buf

Intent: [`intent.md`](./intent.md). **Status:** approved.

---

## Requirements

- **R1. The `protobuf` adapter** (`input-protobuf.ts`, imports only `apicontract/core`). Detects a
  JSON object whose `file` is a non-empty list of objects each with a string `name` ending `.proto`.
  - One operation per `file[i].service[j].method[k]`, id `<package>.<Service>.<Method>` (the
    package omitted when empty), source `/file/i/service/j/method/k`.
  - Payloads: `request` (direction `request`, required) and `response` (direction `response`,
    required), each `{ $ref: '#/$defs/<full name>', $defs }` holding every message it reaches.
  - Messages to JSON Schema, by the proto3 JSON mapping: an object of properties keyed by `jsonName`
    (else the field name), `additionalProperties: false`; 32-bit integers `integer`; 64-bit
    integers `string` or `integer`; `float`/`double` `number`; `bool` `boolean`; `string` `string`;
    `bytes` `string` with `contentEncoding: base64`; an enum the list of its value names; a repeated
    field an array; a map entry an object of the value type. Well-known types as the mapping writes
    them (`Timestamp` and `Duration` strings, wrappers nullable scalars, `Struct` an object, `Value`
    anything, `Empty` an empty object, `FieldMask` a string, `Any` an object with `@type`).
  - Each field's number is kept as `x-protobuf-field` so a reader can see it; the model's diff does
    not judge it (R3 does).
  - Findings, never a silent loss: `stream-read-as-message` for a client- or server-streaming method,
    `any-payload-unread` for `google.protobuf.Any`, `type-not-found` for a type the image does not
    hold (read as anything), `group-read-as-message` for proto2 groups.
- **R2. `.proto` inputs.** An input path ending `.proto`, or a directory holding `buf.yaml`, is
  compiled with `buf build <path> -o -#format=json` run through bellpull in the input's folder; its
  stdout is the image. No `buf` on the PATH refuses with
  `fix: install buf (https://buf.build/docs/installation), or hand over \`buf build -o image.json\``.
  buf's own errors pass through with its exit status.
- **R3. `diff --level <file|package|wire-json|wire>`.** Only for protobuf inputs (any other format
  refuses, naming the formats that have a wire encoding). Runs
  `buf breaking <new> --against <old> --error-format json` with a config using that category, and
  turns each line into a `breaking` finding: rule id `buf:<type>`, its message verbatim, its
  `path:line` as the location. apicontract's own model findings are reported beside them; the exit
  code is the worse of the two. `git:<ref>:<path>` old sides become buf's own `.git#ref=<ref>,subdir=…`.

## Design

R1 is pure: the image is data, and tests use committed images. R2 and R3 are the only places a
process runs, both through bellpull with an injectable `Runtime`, as `lint-history.ts` runs git;
tests hand in a fake buf. Nothing here changes `core/`.

Order: R1 → R2 → R3. Each a PR.

## Verification

- `input-protobuf.test.ts`: a committed image covering every scalar, enums, nested and recursive
  messages, maps, oneofs, well-known types, and a streaming method; 100% coverage, mutation lane clean.
- R2/R3 tests with a fake `buf` (bellpull runtime): the command lines are exact, a missing buf and a
  failing buf each refuse with a `fix:`.
- A manual reading against a real `buf` before R3 merges, its output committed beside the fixtures.

## Rejected alternatives

- **Our own `.proto` parser or binary decoder.** A second protobuf implementation to keep correct, and
  a dependency or several thousand lines; buf already compiles every edge of the language.
- **Re-deriving buf's breaking rules on the model.** The model is the JSON shape; wire rules (field
  numbers, reserved ranges, packing) live in buf, which is the authority users already run.
- **`protoc` as the compiler.** Its descriptor output is binary only.
