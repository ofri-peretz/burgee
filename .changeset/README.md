# Changesets

Same loop as `ofri-peretz/eslint`:

1. In a PR that changes `packages/*/src` or a `package.json`, run `npm run changeset`,
   answer which packages and what semver level, commit the generated `.changeset/*.md`.
   Internal-only work gets the `skip-changeset` label instead.
2. On merge, `changesets-pr.yml` opens or refreshes the "Version Packages" PR and enables
   auto-merge on it.
3. When that PR merges, `release.yml` publishes every package whose version is ahead of npm.
