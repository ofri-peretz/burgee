# Releasing oxmutate

oxmutate's core is Rust on oxc, prebuilt for six platforms (PRINCIPLES rule 9, `native-engine`:
per-platform cores, nothing runs at install time). **1.0 ships all six inside the `oxmutate` tarball**
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

## How 1.0.0 shipped

oxmutate went public at `1.0.0` in ofri-peretz/burgee#1302: `private: false`, the version set in
the manifest (npm had only the `0.0.0` name reservation), and the `## 1.0.0` section of
[`CHANGELOG.md`](./CHANGELOG.md) as the release notes. `release.yml` publishes a manifest version
npm does not have, so merging that pull request published it. Later releases go through changesets
as every other package does (`npx changeset`, then the Version PR).

## Its docs site

Live at [oxmutate.interlace.tools](https://oxmutate.interlace.tools): Vercel project `oxmutate`
(`prj_YJuNxB3xDYV2YXg9BWzXhuTt1FfO`) in the interlace team, its row under `apps` in
[`.github/vercel-apps.json`](../../.github/vercel-apps.json), and a `CNAME oxmutate →
6f09232ee449d52d.vercel-dns-016.com.` in the `interlace.tools` zone at Namecheap. `deploy-docs.yml`
deploys it like its siblings.

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
