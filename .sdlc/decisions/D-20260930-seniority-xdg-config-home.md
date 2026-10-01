---
id: D-20260930-seniority-xdg-config-home
subject: "After #778, `burgee migrate` rewrites cosmiconfig to seniority because the row is level as published (240 / 243). On Linux, though, the control reaches 242 / 243 and seniority does not, because the drop-in never reads `XDG_CONFIG_HOME` (R11). Does the drop-in keep deriving the global directory from the home directory alone, or read the environment the way cosmiconfig does?"
taken: Taken
date: "2026-09-30"
superseded_by: —
---

**It reads the environment the way cosmiconfig does, through `runtime.ts`.** When `globalConfigDir` is not passed, the cosmiconfig drop-in's `global` search now ends in `env-paths(name, { suffix: '' }).config`, worked out as env-paths 2.2.1 does it. env-paths 2.2.1 is the version cosmiconfig 10.0.1 resolves.

- Linux and every other non-darwin, non-win32 platform: `$XDG_CONFIG_HOME/<name>`, or `~/.config/<name>` when the variable is unset **or empty**. env-paths writes `env.XDG_CONFIG_HOME || …`, so empty means unset. A `??` would send the search to the relative path `<name>/`.
- win32: `%APPDATA%\<name>\Config`, falling back to `~/AppData/Roaming/<name>/Config` on the same terms.
- darwin: `~/Library/Preferences/<name>`. Neither variable is read.

The variable is read at each search, not at import. env-paths destructures `process.env` once and reads the key on each call, so this matches it. On a runtime with no process, the drop-in behaves as though neither variable is set.

**Why the answer changed.** R11 kept this façade off the process, so the global directory was derived from `os.homedir()` and the platform. It was a listed divergence: the linux-only XDG pair in `conditionalCases` counted against the target. That was tolerable while the row was a gap and `migrate` never rewrote it. D-20260930-seniority-yaml then made the row level _as published_, and D-137 made `burgee migrate` rewrite `cosmiconfig` → `seniority`. The published control column was the darwin-shaped 240, but the ubuntu control is 242. The divergence therefore became a silent behaviour change that `migrate` applied for the user: a Linux user whose `XDG_CONFIG_HOME` is not `~/.config` lost their global config lookup. D-135 already opened `runtime.ts` for exactly this kind of read. The incumbent reads the process by default, its own suite asserts that, and a drop-in that refuses the read is not a drop-in. dotenv and rc went through the seam on those grounds. cosmiconfig's global directory is the third read of that kind. The resolver (`precedence`, `config`, `explain`) still never imports the seam.

**What was built.**

- `packages/seniority/src/cosmiconfig.ts`: `defaultGlobalConfigDir` reads `ambientEnv()` from `runtime.ts`. An explicit `globalConfigDir` still outranks the environment and never reads it.
- `packages/seniority/src/cosmiconfig.test.ts`: six in-process cases inject the environment by mocking `./runtime.js` and the platform by mocking `node:os`. They never read the real `process.env`, because GitHub's ubuntu image sets `XDG_CONFIG_HOME`. The existing per-platform case now injects an empty environment for the same reason.
- `compat-oracle`'s cosmiconfig host now declares the XDG pair `passing: 2`, so a darwin run credits exactly the two cases it cannot register. Its baseline is **242 / 243**. `GRADED.cosmiconfig` is `passed: 242, control: 242`, which is the ubuntu control the compatibility page now publishes.

**Evidence.**

- **Each new case fails on the old code where it can.** With `cosmiconfig.ts` reverted to `origin/main`, three of the six fail: the non-default `XDG_CONFIG_HOME` case, the set → unset → empty case and the win32 `APPDATA` case. The old code already does what the other three assert: darwin ignores the variables, a process-less runtime falls back, and `globalConfigDir` wins. Each of those three is instead proven by a mutant it kills. `??` in place of `||` fails the empty-string rows. Reading `XDG_CONFIG_HOME` on darwin fails the darwin case. Dropping the `?? {}` for a missing process fails the no-process case. Letting the environment outrank `globalConfigDir` fails that case.
- **Coverage** stays at 100 / 100 / 100 / 100 for the package (726 tests).
- **The grade.** On darwin, the target reads 240 / 243 with the pair unregistered, unchanged. The ubuntu grade comes from the Ratchet job on the PR: it is the only place the pair registers, and `compat:page --check` there holds the published target column to 242 / 243.

**What it costs.** Nothing in burgee's bundle. burgee imports `seniority/config` lazily, and the change lives in the cosmiconfig façade, which burgee does not bundle.
