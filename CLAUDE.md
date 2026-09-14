# Commands

- `npm run ci:local` — runs the full pre-push gate (`typecheck` + `test` + `build` via turbo).
  Run this before pushing. **Lint is not included**: `npm run lint` (eslint + workflows + md) is
  a separate CI job, so run it independently.
- `npm test` — vitest at the root config, then `turbo run test` per package.
- `npm run bench` — `tsx benchmarks/run.ts`.

# Workflow

- Branch `<type>/<slug>`. Commit `<type>(<scope>): <subject>` — commitlint enforces the scope
  against a fixed enum (package names plus `docs ci deps release workspace benchmarks`).
- `git commit` is fast — `pre-commit` is a no-op and only commitlint runs on the message.
  **`git push` is the slow one**: it runs the `pre-push` battery (typecheck + test + build) and
  can take **3–4 minutes**. That is not a hang. If a push is killed mid-flight, check
  `git log origin/<branch> -1` before retrying — a timed-out push may still have landed.
- IMPORTANT: never `--no-verify`. The hooks are the gate.
- Waiting on CI? `gh pr checks <PR> --watch`. Never hand-roll `until … gh pr view … sleep` —
  those loops get killed by the harness timeout and end knowing nothing.

# Gotchas

- This is a monorepo driven by turbo: a change in `packages/*` rebuilds dependents, so
  `turbo run test` can be far slower than the package's own vitest run.
