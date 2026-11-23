# Design — protobuf in apicontract, through buf

Intent: [`intent.md`](./intent.md). **Status:** approved.

---

## Requirements

- **R1. The `protobuf` adapter** (`input-protobuf.ts`, imports only `apicontract/core`). Detects a
  JSON object whose `file` is a non-empty list of objects each with a string `name` ending `.proto`.
  It is tried after `openapi`, `swagger2`, `asyncapi` and `mcp`, none of which has a `file` list, and
  before `jsonschema`, which reads almost any object.
  - One operation per `file[i].service[j].method[k]`, id `<package>.<Service>.<Method>` (the
    package omitted when empty), source `/file/i/service/j/method/k`.
  - Payloads: `request` (direction `request`, required) and `response` (direction `response`,
    required), each `{ $ref: '#/$defs/<full name>' }`. The contract's document is the image with a
    `$defs` beside it holding every message and enum a payload reaches, so the references resolve
    where every generator and `diff` resolve them.
  - Messages to JSON Schema, by the proto3 JSON mapping: an object of properties keyed by `jsonName`
    (else the field name), left open, since adding a field is protobuf's safe change; 32-bit
    integers `integer`; 64-bit integers `string` or `integer`; `float`/`double` `number`; `bool`
    `boolean`; `string` `string`; `bytes` `string` with `contentEncoding: base64`; an enum the list
    of its value names; a repeated field an array; a map entry an object of the value type; a proto2
    `required` field required. Well-known types as the mapping writes them (`Timestamp` and
    `Duration` strings, wrappers nullable scalars, `Struct` and `Empty` objects, `Value` anything,
    `FieldMask` a string, `Any` an object with `@type`).
  - Each field's number is kept as `x-protobuf-field` so a reader can see it; the model's diff does
    not judge it (R3 does).
  - A `oneof` is written as the JSON mapping writes it, each member an ordinary optional property;
    the group is kept as `x-protobuf-oneof: { <group>: [<property>…] }` on the message, and its
    "at most one" constraint, which the schema does not enforce, is the finding `oneof-not-enforced`.
    A proto3 `optional` field's synthetic oneof is not a group.
  - Findings, never a silent loss: `stream-read-as-message` for a client- or server-streaming
    method, `any-payload-unread` for `google.protobuf.Any`, `oneof-not-enforced` for a oneof,
    `type-not-found` for a type the image does not hold (read as anything),
    `group-read-as-message` for a proto2 group, `no-service` for an image with no service.
- **R2. `.proto` inputs.** An input path ending `.proto`, or a directory holding `buf.yaml` or
  `buf.work.yaml`, is compiled with `buf build <path> -o -#format=json` run through bellpull in the
  input's folder; its stdout is the image. No `buf` on the PATH refuses with
  ``fix: install buf (https://buf.build/docs/installation), or hand over `buf build -o image.json` ``.
  buf's own errors pass through as a usage error (exit 2) quoting its stderr. `diff` (each side,
  and each release with `--transitive`, where a buf module is one release, not a folder of files),
  `props` (the contract and `--against`) and `lint` build their protobuf inputs this way. A
  protobuf source at a git ref (`git:<ref>:x.proto`) is refused with
  ``fix: `buf build '.git#ref=<ref>' -o old.json` and pass old.json`` (with `,subdir=<path>` for a
  module), naming the actual ref. A module that exists only at the ref has no `buf.yaml` in the
  working tree to be known by, so it is read as a file and git's error stands. `lint --since` reads a
  `.proto` at the ref as new. `gen` and `explain` read images only for now.
- **R3. `diff --level <file|package|wire-json|wire>`.** Only for protobuf inputs (any other format
  refuses: protobuf is the one with a wire encoding). Runs
  `buf breaking <new> --against <old> --error-format json --config <v2 config using that category>`,
  and turns each line into a `breaking` finding: rule id `buf:<type>`, scheme `buf`, its `path` as
  the operation and `path:line` as the source, its message verbatim at the head of the fix line.
  apicontract's own model findings are reported beside them; the verdict and exit code are the worse
  of the two. buf's exit 100 means it found changes; any other failure passes its stderr through.
  `--level` compares two contracts, so `--transitive` is refused, and so is a side at a git ref
  (``fix: `buf build '.git#ref=<ref>' -o old.json` and pass old.json``).

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
