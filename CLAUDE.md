# Commands

- `npm run ci:local` — mirrors the entire pre-push gate (`lefthook run pre-push --all-files`).
  Run this instead of the individual steps; it is the only check that matches CI exactly.
- `npm test` — vitest at the root config, then `turbo run test` per package.
- `npm run bench` — `tsx benchmarks/run.ts`.

# Workflow

- Branch `<type>/<slug>`. Commit `<type>(<scope>): <subject>` — commitlint enforces the scope.
- `git commit` and `git push` run lefthook and can take **3–4 minutes**. That is not a hang.
  If one is killed mid-flight, check `git log origin/<branch> -1` before retrying — a timed-out
  push may still have landed.
- IMPORTANT: never `--no-verify`. The hooks are the gate.
- Waiting on CI? Use `pr-blockers watch`. Never hand-roll `until … gh pr view … sleep` —
  those loops get killed by the harness timeout and end knowing nothing.

# Gotchas

- This is a monorepo driven by turbo: a change in `packages/*` rebuilds dependents, so
  `turbo run test` can be far slower than the package's own vitest run.
