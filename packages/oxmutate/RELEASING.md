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

## The manual steps

1. In [`package.json`](./package.json), set `"private": false`.
2. In the root [`README.md`](../../README.md), change "Ten packages, one repository" to "Eleven
   packages, one repository". `dependency-claim-lock` counts the published manifests, so this one
   sentence is right in only one state; it stays right for the private one until this flip.
3. Add a changeset for `oxmutate` (`npx changeset`). Merging the Version PR it opens publishes all
   seven.

Do all three in the pull request that lands this work, before it merges. Every other surface is
already written for the released package: oxmutate has a pending docs app in
[`.github/vercel-apps.json`](../../.github/vercel-apps.json), and `released` in
`apps/docs-chassis/src/packages.ts` treats a private package with a pending app as released, so the
family table in every README, the front door's package map and section, the weight page, the install
graph and `SECURITY.md` already list it and do not change at the flip. Until the flip lands those
pages describe a package npm does not serve yet, which is why it should not wait for a later pull
request.

## Its docs site

`apps/docs-oxmutate` is built and tested (`npx turbo run build --filter=docs-oxmutate`), and filed
under `pending`: nothing deploys it. **Needs owner action**, best before the release so the npm
README's `Docs:` links land:

1. Create a Vercel project for `apps/docs-oxmutate` in the team `orgId` names, with an Environment
   `production`, root directory empty, build command `npx turbo run build --filter=docs-oxmutate` and
   output directory `apps/docs-oxmutate/.next`, the other family sites' settings.
2. Add the DNS record for `oxmutate.interlace.tools` and attach the domain to that project.
3. Then one pull request: move `pending.oxmutate` into `apps` with the `projectId`, delete
   `excluded.oxmutate`, run `npx tsx scripts/sync-package-docs.ts` (the front door's section gives
   way to the site), and point the README's *For agents* line at
   `https://oxmutate.interlace.tools/llms.txt`. It links the front door's `llms.txt` until then,
   because a README section projected onto the front door may not link a host that serves nothing
   (`vercel-apps-lock`).

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

## What the flip still turns red

Measured on 2026-10-27 by running the root lock suite (`npx vitest run --config
vitest.root.config.ts`) with `"private": false` and again with `true`. With `true` it is green. With
`false` three cases fail, and each needs a change outside this release checklist:

- `dependency-claim-lock` › the root README counts the published packages: step 2 above.
- `bin-help-lock` › `oxmutate` with no arguments is usage, never a crash. `run` is the default
  command, so a bare `oxmutate` starts a mutation run of the current directory, and from the
  repository root that outlives the lock's 30 s. It needs a decision in `src/cli.ts`: drop
  `default: true` (every page here already writes `oxmutate run`), or have the lock admit a default
  command that does work.
- `independence-install-lock` › oxmutate loads every module entry. Installed alone, without Vitest,
  `import('oxmutate/runner')` fails with `Cannot find module 'vitest/package.json'`. The lock already
  expects `oxmutate/runner` to refuse the way `controlroom/ink` does, with `code: 'E_PEER_MISSING'`
  and a `fix` containing `npm install vitest`, so `src/runner.ts` (or `src/resolve.ts`) has to throw
  that, or `./runner` leaves `exports` and the coordinator loads it by path.

The locks that took the released set rather than the published one, so that the flip moves nothing
they read: `package-readme-header-lock` (through `FAMILY` in `scripts/readme-benchmarks.ts`),
`extension-surface-lock`, `independence-install-lock`, `readme-quick-start-lock`,
`stable-status-lock`, `subpath-weight-lock`, `sync-package-docs`, `install-graph-lock` and
`vercel-apps-lock` (a pending row may name a private package).
