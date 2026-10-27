# Releasing oxmutate

oxmutate ships as seven npm packages, the way oxc, Rolldown and napi-rs do it (PRINCIPLES rule 9,
`native-engine`): `oxmutate` itself, plus one `oxmutate-<platform>` per directory under [`npm/`](./npm),
each holding one prebuilt `oxmutate.node` and declaring the `os`, `cpu` and `libc` it runs on. npm
installs only the one that matches. Nothing runs at install time.

`release.yml` does all of it once `oxmutate` is public. Its `native` job (calling
[`oxmutate-native.yml`](../../.github/workflows/oxmutate-native.yml)) builds and smoke-loads each core.
Its `publish` job then publishes the six platform packages, then `oxmutate`, through npm trusted
publishing with provenance. Just before `oxmutate` publishes it gains `optionalDependencies` naming the
six at its own version (`scripts/sync-platform-versions.mjs --publish`).

## The two manual steps

1. In [`package.json`](./package.json), set `"private": false`.
2. Add a changeset for `oxmutate` (`npx changeset`). Merging the Version PR it opens publishes all seven.

## Once, on npmjs.com, before the first release

Each of these seven packages needs a trusted publisher. On npmjs.com, open the package's
**Settings → Trusted publishing** and add repository `ofri-peretz/burgee`, workflow `release.yml`, and
environment `production`:

- `oxmutate` (already on npm at 0.0.0, a name reservation)
- `oxmutate-darwin-arm64`
- `oxmutate-darwin-x64`
- `oxmutate-linux-arm64-gnu`
- `oxmutate-linux-x64-gnu`
- `oxmutate-linux-x64-musl`
- `oxmutate-win32-x64-msvc`

The six platform names do not exist on npm yet. When this was written, npm let you configure trusted
publishing only on a package that already exists (check this again on the day). So each one first needs a one-off placeholder publish from your own account (for
example `0.0.0`, the way `oxmutate` was reserved). Doing that also stops anyone else from taking the names.

**Needs owner action.** Rehearse with `npm run release:dry-run`. A dry run builds every native core even
while oxmutate is private.

## What keeps the seven in step

- **Versions.** changesets versions only `oxmutate`; the platform packages are not workspaces.
  `node packages/oxmutate/scripts/sync-platform-versions.mjs` copies oxmutate's version into every
  `npm/*/package.json`. It belongs in the root `changeset:version` script, right after
  `changeset version`, so the Version PR carries it. Without that,
  `scripts/oxmutate-platforms-lock.test.ts` fails the Version PR.
- **`optionalDependencies`.** These are written on the release runner and never committed. A
  committed optional dependency that npm does not serve yet cannot be recorded in `package-lock.json`,
  and `npm ci` then refuses the whole monorepo with EUSAGE ("Missing: oxmutate-darwin-arm64@ from lock
  file"). The monorepo never needs them, because development loads `binding/`.
- **Shape.** `scripts/oxmutate-platforms-lock.test.ts` checks each platform package's name, `os`,
  `cpu`, `libc`, version, `files` and `main`. It checks that the published manifest lists exactly the six,
  and that the build matrix builds each one for its own Rust target.

## Flipping `private` also turns these locks red

Measured on 2026-10-27 by flipping `private` locally. These are decisions about oxmutate itself, not
about the release pipeline. Settle them before (or with) the flip:

- `package-shape-lock`:
  - the `vitest` peer is an external install;
  - `burgee` is not an earlier family package for oxmutate's tier;
  - `engines` is `>=22.13.0`, while the family floor is `^20.19.0 || >=22.13.0`;
  - the code entries in `exports` do not each carry the `types`, `import` and `default` conditions (K2).
- `package-readme-header-lock`: the README lacks the family header and shape.
- `dependency-claim-lock`: the root README says "Ten packages"; there would be eleven.
- `independence-install-lock`: the packed tarball does not install and load alone offline.
