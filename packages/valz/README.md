<p align="center">
  <a href="https://github.com/ofri-peretz/burgee/tree/main/packages/valz" target="blank">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/ofri-peretz/burgee/main/brand-assets/valz-lockup.svg" />
      <img src="https://raw.githubusercontent.com/ofri-peretz/burgee/main/brand-assets/valz-lockup-light.svg" alt="valz" width="360" />
    </picture>
  </a>
</p>

<p align="center">
  Validation whose schemas are data: what is over the line does not sail.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/valz"><img src="https://img.shields.io/npm/v/valz?style=flat-square&color=0a6b47" alt="valz on npm: the latest version" /></a>
  <a href="https://www.npmjs.com/package/valz"><img src="https://img.shields.io/npm/dm/valz?style=flat-square" alt="valz downloads per month on npm" /></a>
  <a href="https://github.com/ofri-peretz/burgee/actions/workflows/quality.yml?query=branch%3Amain"><img src="https://img.shields.io/github/actions/workflow/status/ofri-peretz/burgee/quality.yml?branch=main&style=flat-square&label=Quality%20Gate" alt="Quality Gate: the CI status of main" /></a>
  <a href="https://app.codecov.io/gh/ofri-peretz/burgee/components"><img src="https://img.shields.io/codecov/c/github/ofri-peretz/burgee/main?component=valz&style=flat-square" alt="valz line coverage: its Codecov component" /></a>
  <a href="https://scorecard.dev/viewer/?uri=github.com/ofri-peretz/burgee"><img src="https://img.shields.io/ossf-scorecard/github.com/ofri-peretz/burgee?style=flat-square&label=OpenSSF%20Scorecard" alt="OpenSSF Scorecard for the repository" /></a>
  <a href="https://www.npmjs.com/package/valz?activeTab=code"><img src="https://img.shields.io/npm/unpacked-size/valz?style=flat-square" alt="Unpacked size of the latest valz release on npm" /></a>
  <a href="https://github.com/ofri-peretz/burgee/blob/main/packages/valz/package.json"><img src="https://img.shields.io/badge/dependencies-0-0a6b47?style=flat-square" alt="Zero dependencies" /></a>
  <a href="https://github.com/ofri-peretz/burgee/blob/main/packages/valz/package.json"><img src="https://img.shields.io/badge/types-included-blue?style=flat-square" alt="TypeScript types included for every entry point" /></a>
  <a href="https://github.com/ofri-peretz/burgee/blob/main/packages/valz/package.json"><img src="https://img.shields.io/badge/Node.js-22.13%2B-green?style=flat-square" alt="Node.js 22.13+" /></a>
  <a href="https://github.com/ofri-peretz/burgee/blob/main/packages/valz/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="License: MIT" /></a>
  <a href="https://www.npmjs.com/package/valz#provenance"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fregistry.npmjs.org%2Fvalz%2Flatest&query=%24.dist.attestations.provenance~&label=npm&style=flat-square&color=0a6b47" alt="npm provenance of the latest release, read live from its registry attestation" /></a>
</p>

<p align="center">
  Docs: <a href="https://burgee.interlace.tools/docs/packages/valz">https://burgee.interlace.tools/docs/packages/valz</a><br />
  Migrating from: <a href="https://github.com/ofri-peretz/burgee/tree/main/packages/valz#migrating">zod</a>
</p>

**valz** is a JS/TS validator whose schemas are plain data. You write them in TypeScript and the
static type is inferred from the schema; `check` validates with no `eval`
and no `new Function`, so it runs under a strict Content-Security-Policy; and `valz/jit` and
`valz/emit` compile the same schema to a function or to source ahead of time when speed matters
more. Every issue is a JSON Pointer path and a message that ends in `fix:`, so an agent reads the
same record a person does.

Where you write zod schemas today, the builders keep zod's names. It implements Standard Schema and
Standard JSON Schema, so it plugs in wherever a library accepts a zod schema through those interfaces, and it reads and writes JSON Schema. contractdiff's
`validator` target generates valz schemas from an OpenAPI or AsyncAPI contract.

## Install

```bash
npm install valz
pnpm add valz
yarn add valz
bun add valz
```

It has zero dependencies.

## Quick start

```bash
npm install valz
```

```js
import { check, number, object, optional, parse, string } from "valz";

const User = object({ name: string(), age: number(), email: optional(string()) });

console.log(check(User, { name: "Ada", age: 36 }));
const result = parse(User, { name: "Ada", age: "36" });
console.log(result.ok ? result.value : result.issues);
```

```text
true
[
  {
    path: '/age',
    keyword: 'type',
    message: 'expected a number, got string "36". fix: send a finite number'
  }
]
```

`check` narrows a value to the schema's type; `parse` returns the value or every issue at once.

## What it does

- **Builders that infer the type.** `object`, `string`, `number`, `array`, `union`,
  `discriminated`, `optional` and the rest; `Infer<typeof User>` is the static type.
- **Checks with no eval.** `check`, `parse` and `assert` walk the schema as data, so they run
  where a Content-Security-Policy forbids `new Function`.
- **Compiled when it pays.** `valz/jit` builds a function at run time and `valz/emit`
  writes its source ahead of time, from the same schema.
- **JSON Schema both ways.** `valz/json-schema` writes a schema out and reads one in, and
  `valz/standard` gives every schema the Standard Schema interface.

## Migrating

valz has no command, so there is no `npx valz` to run: the switch is the import.
The builders keep zod's names where zod has one, so most schemas move by their import:

```diff
- import { z } from "zod";
- const User = z.object({ name: z.string(), age: z.number(), email: z.string().optional() });
- const user = User.parse(input);
+ import { assert, number, object, optional, string } from "valz";
+ const User = object({ name: string(), age: number(), email: optional(string()) });
+ assert(User, input); // throws on an issue, and narrows `input` to the schema's type
```

A library that takes a Standard Schema takes a valz schema as it is.

## Compatibility

Not graded: no incumbent's own suite runs against valz through compat-oracle. Its features are
read beside zod's and ajv's in `benchmarks/validator`.

## Benchmarks

Every number here is produced by `npm run bench` and published at [burgee.interlace.tools/docs/benchmarks](https://burgee.interlace.tools/docs/benchmarks).

No suite is graded against this package yet, so there is no compatibility number to quote.

## For agents

- **Every issue is data**: a JSON Pointer `path`, the `keyword` that failed and a message that ends
  in `fix:`, the same record an agent reads and a person reads.
- **Schemas are JSON**: `valz/json-schema` writes a schema out as JSON Schema and reads one
  back, so an agent can hand a schema across a tool boundary.
- **The docs are machine-readable** at
  [burgee.interlace.tools/llms.txt](https://burgee.interlace.tools/llms.txt).

## API

| Import                 | What it gives you                                                                        |
| :--------------------- | :--------------------------------------------------------------------------------------- |
| `valz`             | the builders (`object`, `string`, `number`, `array`, `union`, …), `check`, `parse`, `assert` |
| `valz/jit`         | `compile()`: the schema as a function, for a hot path where `eval` is allowed            |
| `valz/emit`        | `emit()`: the schema as source, written ahead of time                                    |
| `valz/formats`     | string formats: `email`, `uuid`, `url`, `datetime` and the rest                          |
| `valz/json-schema` | `toJsonSchema()`, `fromJsonSchema()`, `jsonSchemaReader()` (many schemas, one document) |
| `valz/standard`    | `standard()`: the Standard Schema and Standard JSON Schema interfaces                    |

## Requirements

Node 22.13 or later.

## Where it sits

It hosts no plugin key of its own.

`contractdiff` builds on it, and it builds on nothing in this family.

## The family

14 packages, one repository, one release pipeline. Each installs and works on its own, and each owns
one job. Seven of them — `bellpull`, `closeout`, `linegauge`, `paratext`, `roundel`, `seniority`,
`valz` — depend on nothing; the others depend only on packages in this table, and every dependency
points one way, down the [layers](https://burgee.interlace.tools/docs/concepts/family).

No package declares a dependency from outside the family; `react` and `react-reconciler` are
optional peers of `controlroom`, which npm does not install; `eslint` is an optional peer of `fibz`,
which npm does not install; `vitest` is an optional peer of `oxmutate`, which npm does not install.
[`package-shape-lock`](https://github.com/ofri-peretz/burgee/blob/main/scripts/package-shape-lock.test.ts)
holds that for every manifest, and
[`independence-install-lock`](https://github.com/ofri-peretz/burgee/blob/main/scripts/independence-install-lock.test.ts)
installs each package alone and finds nothing but the family packages it declares.

Releases are published by one workflow through npm trusted publishing: no npm token is used, and
each release carries SLSA provenance, which `npm view <package> dist.attestations` shows.
[`trusted-publishing-lock`](https://github.com/ofri-peretz/burgee/blob/main/scripts/trusted-publishing-lock.test.ts)
keeps both true.

| Package | What it is | Migrates from |
| :-- | :-- | :-- |
| [burgee](https://burgee.interlace.tools/docs/packages/burgee) | The CLI framework: one declaration, every surface | commander, yargs and meow |
| [roundel](https://roundel.interlace.tools/docs) | Colour: one output policy, semantic tokens, a theme | chalk, colorette, kleur, picocolors, supports-color and yoctocolors |
| [flagstaff](https://flagstaff.interlace.tools/docs) | The frame loop: spinners, progress, boxes and tables | ora, log-update, boxen and cli-table3 |
| [caique](https://caique.interlace.tools/docs) | Prompts that are flags first, and never hang | @inquirer/core |
| [linegauge](https://linegauge.interlace.tools/docs) | Measuring, wrapping, truncating and slicing styled text | string-width, wrap-ansi, strip-ansi, slice-ansi, cli-truncate and widest-line |
| [paratext](https://paratext.interlace.tools/docs) | Hyperlinks, images, title, clipboard and notifications | ansi-escapes, terminal-link and term-img |
| [seniority](https://seniority.interlace.tools/docs) | Configuration precedence and discovery, with provenance | cosmiconfig, lilconfig, dotenv and rc |
| [closeout](https://closeout.interlace.tools/docs) | Exit handlers, terminal restore and a bounded shutdown | signal-exit, exit-hook, restore-cursor, cli-cursor and onetime |
| [bellpull](https://bellpull.interlace.tools/docs) | Subprocesses, and which executable actually ran | cross-spawn and which |
| [controlroom](https://controlroom.interlace.tools/docs) | Keyboard-driven terminal screens, inline or full-screen | ink |
| [oxmutate](https://oxmutate.interlace.tools/docs) | Mutation testing on the oxc engine, inside your own Vitest | Stryker |
| [fibz](https://burgee.interlace.tools/docs/packages/fibz) | Lint rules and a pre-push check that keep a test suite honest | @vitest/eslint-plugin |
| [contractdiff](https://burgee.interlace.tools/docs/packages/contractdiff) | API contracts: breaking-change diff, lint, and code from the spec | openapi-typescript |
| **valz** (this package) | Validation whose schemas are data, with no eval | zod |

Every migration guide, and the family-wide [compatibility](https://burgee.interlace.tools/docs/compatibility)
and [benchmarks](https://burgee.interlace.tools/docs/benchmarks) pages, are on
[burgee.interlace.tools](https://burgee.interlace.tools/docs/packages).

## Contributing

Issues and pull requests are welcome at [ofri-peretz/burgee](https://github.com/ofri-peretz/burgee/issues); read
[CONTRIBUTING.md](https://github.com/ofri-peretz/burgee/blob/main/CONTRIBUTING.md) first. Report a vulnerability privately, as
[SECURITY.md](https://github.com/ofri-peretz/burgee/blob/main/SECURITY.md) describes — never in a public issue.

## Licence

MIT © Ofri Peretz — see [LICENSE](https://github.com/ofri-peretz/burgee/blob/main/packages/valz/LICENSE).
