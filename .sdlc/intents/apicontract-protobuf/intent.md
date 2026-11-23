# Intent — protobuf in apicontract, through buf

> Opened from [`D-20261122-open-formats`](../../decisions/D-20261122-open-formats.md) ("each 'no'
> becomes its own intent before it is built") and roadmap Phase 8 ([`../apicontract/roadmap.md`](../apicontract/roadmap.md)):
> protobuf arrives through its owner's engine, spawned from the user's install, never a dependency.
> Unblocks [`contractdiff-compat-depth`](../contractdiff-compat-depth/intent.md) R5.

**Status:** approved · **Opened:** `2026-11-23` · **Owner:** `@ofri-peretz` · **Lane:** `ac-inputs` ·
**Accepted under:** the owner's standing delegation of 2026-11-23 (proceed on reasonable defaults;
publishing and naming stay with the owner)

---

## What is wanted

- **R1. Read protobuf into the one model.** A protobuf API (services, methods, messages) read as a
  `Contract`: one operation per RPC method, its request and response messages as JSON Schemas in the
  shape the proto3 JSON mapping gives them. Everything apicontract does on the model (diff, lint, gen,
  agent surface) then works on protobuf with no core change.
- **R2. buf does the parsing.** `.proto` sources are compiled by the user's own `buf` into a
  descriptor image; apicontract reads the image. A pre-built image (`buf build -o image.json`) is read
  with no `buf` at all.
- **R3. buf decides wire compatibility.** `diff --level file|package|wire-json|wire` runs
  `buf breaking` at that category and passes its verdicts through unchanged, beside apicontract's own
  findings on the model (contractdiff-compat-depth R5).

## Why now

`contractdiff` is the one diff under every format; protobuf is the largest API format it does not
read, and compat-depth R5 has been parked on it. buf is the reference implementation of protobuf
compatibility: re-deriving its rules would be a second, weaker opinion.

## Constraints

- No new dependency: buf is the user's install, spawned through bellpull (already a dependency);
  `core/` does not change.
- Never a silent loss: every protobuf construct the model cannot carry is a finding with a `fix:`.
- buf's verdicts pass through unchanged; apicontract adds its explanation and agent surface on top.

## Success criteria

- A `.proto` service (unary and streaming) reads into the model; every construct the model cannot
  carry (streaming, `google.protobuf.Any`'s payload, custom options) produces a finding.
- The same contract read from `.proto` via buf and from a committed `image.json` is identical.
- `diff --level wire` on a field renumbering reports buf's `FIELD_SAME_NUMBER`-family rule id and
  message verbatim; without buf installed the run refuses with a `fix:` naming the install.
- apicontract's dependency list does not change.

## Defaults taken

- The image's JSON form (proto3 JSON of a `FileDescriptorSet`) is the input. The binary form needs a
  protobuf decoder, which is a dependency; `buf build -o image.json` makes the JSON form.
- 64-bit integers are read as the JSON mapping writes them: a string, also accepting a number.
- `protoc`'s descriptor sets are binary only; protoc users run `buf build` or hand over JSON.

## Out of scope

gRPC/Connect code generation; Avro, GraphQL, OpenRPC (their own intents); a protobuf decoder of our own.
