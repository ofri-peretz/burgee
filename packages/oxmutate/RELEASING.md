# Releasing oxmutate

oxmutate's core is Rust on oxc, prebuilt for six platforms (PRINCIPLES rule 9, `native-engine`:
per-platform cores, nothing runs at install time). **0.1 ships all six inside the `oxmutate` tarball**
as `binding/oxmutate.<tag>.node`, with tag `darwin-arm64`, `darwin-x64`, `linux-x64-gnu`,
`linux-arm64-gnu`, `linux-x64-musl` or `win32-x64-msvc`. `src/native.ts` loads the one
`src/platform.ts` names for the machine. That makes the tarball about 9.6 MB heavier than one
platform's worth, which is the price of publishing through OIDC trusted publishing alone: npm
configures a trusted publisher only on a package that already exists (`npm help trust`: "Package
must exist"), and nobody logs in to create the six `oxmutate-<platform>` names.

The per-platform packages, the oxc / Rolldown / napi-rs layout where npm installs only the matching
one, stay in [`npm/`](./npm), each `"private": true`, until a person creates the names (below).

`release.yml` does the rest once `oxmutate` is public. Its `native` job (calling
[`oxmutate-native.yml`](../../.github/workflows/oxmutate-native.yml)) builds and smoke-loads each
core. Its `publish` job places each core at `packages/oxmutate/binding/oxmutate.<tag>.node` and
refuses to publish `oxmutate` unless all six are there. Then it publishes through trusted
publishing with provenance. The cores exist only on that runner: `binding/*.node` is gitignored and
the committed tree carries no binary.

## The manual steps

1. In [`package.json`](./package.json), set `"private": false`.
2. In the root [`README.md`](../../README.md), change "Ten packages, one repository" to "Eleven
   packages, one repository". `dependency-claim-lock` counts the published manifests, so this one
   sentence is right in only one state; it stays right for the private one until this flip.
3. Add a changeset for `oxmutate` (`npx changeset`). Merging the Version PR it opens publishes
   oxmutate with its six cores.

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

`oxmutate` exists on npm (0.0.0, a name reservation). It needs one trusted publisher: on npmjs.com,
**oxmutate → Settings → Trusted publishing**, repository `ofri-peretz/burgee`, workflow
`release.yml`, environment `production`. Or run, from an account with 2FA:

```sh
npm trust github oxmutate --file release.yml --repository ofri-peretz/burgee --environment production --allow-publish --yes
```

**Needs owner action.** Rehearse with `npm run release:dry-run`. A dry run builds every native core
even while oxmutate is private.

## Later: publishing the six platform packages

This is a one-time human step, because CI cannot create a package name. Do it once, then the release
job publishes the six itself:

1. Log in with 2FA: `npm login`.
2. Create each name with a placeholder 0.0.0, then give it the same trusted publisher. The 2FA prompt
   comes on the first `npm trust`; tick the five-minute skip on the npm page and the rest go through
   (npm suggests a 2-second pause between calls):

   ```sh
   for p in darwin-arm64 darwin-x64 linux-arm64-gnu linux-x64-gnu linux-x64-musl win32-x64-msvc; do
     d=$(mktemp -d)
     printf '{"name":"oxmutate-%s","version":"0.0.0","description":"Reserved for the oxmutate native core (%s). Install oxmutate.","license":"MIT","repository":{"type":"git","url":"git+https://github.com/ofri-peretz/burgee.git"}}\n' "$p" "$p" > "$d/package.json"
     (cd "$d" && npm publish --access public)
     npm trust github "oxmutate-$p" --file release.yml --repository ofri-peretz/burgee --environment production --allow-publish --yes
     rm -rf "$d"
     sleep 2
   done
   npm logout
   ```

3. In one pull request, delete `"private": true` from each `npm/*/package.json`, and add a changeset
   for `oxmutate` so the version moves:

   ```sh
   for f in packages/oxmutate/npm/*/package.json; do
     node -e 'const fs=require("fs"),f=process.argv[1],m=JSON.parse(fs.readFileSync(f,"utf8"));delete m.private;fs.writeFileSync(f,JSON.stringify(m,null,2)+"\n")' "$f"
   done
   ```

   The release then publishes the six first, and gives `oxmutate`'s published manifest
   `optionalDependencies` naming them at its version (`scripts/sync-platform-versions.mjs --publish`).
   The cores are still bundled too. To stop bundling them, drop `binding/oxmutate.*.node` from
   `files` in the same pull request; the loader falls through to the platform package.
   `scripts/oxmutate-platforms-lock.test.ts` checks whichever layout the flags say.

## What keeps oxmutate and its platform packages in step

- **Versions.** changesets versions only `oxmutate`; the platform packages are not workspaces.
  `node packages/oxmutate/scripts/sync-platform-versions.mjs` copies oxmutate's version into every
  `npm/*/package.json`. It belongs in the root `changeset:version` script, right after
  `changeset version`, so the Version PR carries it. Without that,
  `scripts/oxmutate-platforms-lock.test.ts` fails the Version PR.
- **`optionalDependencies`.** These are written on the release runner, only for platform packages that
  are public, and never committed. A committed optional dependency that npm does not serve yet
  cannot be recorded in `package-lock.json`, and `npm ci` then refuses the whole monorepo with
  EUSAGE ("Missing: oxmutate-darwin-arm64@ from lock file").
- **Shape.** `scripts/oxmutate-platforms-lock.test.ts` checks each platform package's name, `os`,
  `cpu`, `libc`, version, `files` and `main`, and that the six agree on `private`. While they are
  private it checks the bundle: `files` ships `binding/oxmutate.<tag>.node`, each tag is what
  `src/platform.ts` computes, every matrix leg is uploaded, downloaded and copied into `binding/`,
  and the publish loop refuses oxmutate without all six. The published manifest then names no
  optional dependency. Once they are public, it checks that the published manifest lists exactly
  the six.
- **Size.** `check:artifacts` measures oxmutate's tarball without its cores (`measuredPack` in
  `scripts/check-published-artifacts.ts`). The build job packs before any core exists, and a laptop
  that ran `build:native` holds one. The baseline records 52,636 B gzipped and 167,395 B unpacked
  for the JavaScript and declarations. Each core is about 1.6 MB (darwin-arm64: 1,608,120 B), and
  each `oxmutate-native.yml` leg writes its core's size to the run summary.

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
