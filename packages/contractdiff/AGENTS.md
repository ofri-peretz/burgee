# contractdiff, for agents

contractdiff turns specs into code and code into specs through plugins. This file is the plugin
authoring guide: how to write a plugin that contractdiff accepts, and how to prove it.

## Write a plugin

```sh
contractdiff plugin new my-target                      # a generator: spec to code
contractdiff plugin new my-source --kind extractor     # an extractor: code to spec
contractdiff plugin new my-format --kind adapter       # an input format, with a generator that reads it
```

Each writes three files, all yours: `plugin-<name>.ts` with a one-operation `sample`, a
`plugin-<name>.test.ts` that calls the conformance suite, and a `README.md`. A second run writes
nothing and never overwrites a file you changed.

A plugin is one plain object (`Plugin` in `contractdiff/testing`):

- `generators.<name>`: `{ description, inputs, sample: { document, files }, run(contract, options) }`.
  `run` returns files, `{ path, content, owner }`; `owner: 'user'` is written once and never again.
- `extractors.<name>`: `{ description, sample: { options, document }, run(options) }`.
- `adapters.<name>`: `{ description, detect(document), read(document) }`.

`sample` is the plugin's static projection: a small input and exactly what `run` returns for it.

## Prove it

```ts
import { test } from 'node:test';
import { conformance } from 'contractdiff/testing';
import { plugin } from './plugin-my-target.js';

test('conforms', async () => {
  await conformance(plugin);
});
```

`conformance(plugin, options?)` throws a `ConformanceError` naming every rule the plugin breaks,
each with a `fix:` line. It runs under `node:test`, vitest and jest alike.

| Rule | What it asks |
|---|---|
| `schema` | `validate` accepts the plugin, and it contributes a generator, an extractor or an adapter |
| `sample` | `run` on `sample.document` returns exactly `sample.files` |
| `deterministic` | two runs give the same bytes, on the sample and on every `corpus` document |
| `regeneration` | after a spec change, every `owner: 'user'` file is byte for byte what it was |
| `roundtrip` | with `{ extractor }`: extracting what the generator wrote gives back the sample contract |
| `fix-lines` | every refusal and every finding says what to do: `fix: …` |
| `paths` | every path stays inside the output folder, even for an operation id with `../` in it |

Options: `corpus` (more documents), `mutate` (the sample after a spec change, for a sample that
is not OpenAPI or Swagger), `extractor` and `generator` (the round trip, and which generator it pairs).

## Switch from another tool

```sh
contractdiff migrate openapi-typescript   # or openapi-fetch, hey-api, orval
contractdiff migrate orval --dry-run --json
```

It reads the incumbent's config as data (never runs it), writes `contractdiff.config.json` beside
it, rewrites the scripts that ran it, and reports every option it could not carry as a finding
with a `fix:`. It deletes nothing; it prints the uninstall command.
