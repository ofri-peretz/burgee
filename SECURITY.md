# Security policy

## Reporting a vulnerability

Please report privately through
[GitHub's private vulnerability reporting](https://github.com/ofri-peretz/burgee/security/advisories/new)
rather than opening a public issue. Include the affected package and version, the Node
version, and the smallest program that demonstrates the problem.

You will get an acknowledgement within 7 days, and a fix or an explanation of why it is not one. If a
report turns out to be a real vulnerability, the advisory credits you unless you ask
otherwise.

## Supported versions

Every package but `oxmutate` is at 1.0 or later, and its public API is under semver. A fix, a
security fix included, ships as a patch or minor release of the current major, so a caret
range on that major installs it without a breaking change. `oxmutate` is pre-1.0 (0.x): a
minor release may change its API, and a fix ships in its next 0.x release. Only the latest
release of each package is supported, and there are no long-term support branches: a fix lands
on the newest release and is not backported.

## What reduces the attack surface here

- **Zero external runtime dependencies** in every published package: the supply chain a
  caller inherits from burgee is this repo. The packages that depend on anything depend only
  on their siblings, each of them built, reviewed and published here — one chain to audit,
  and no transitive install from anywhere else.
- **`node:util.parseArgs`** does the parsing, rather than a hand-rolled tokeniser.
- **CodeQL** runs on every push, and `secure-coding` and `node-security` lint rules run at
  `error` on every file — those rules caught a prototype-pollution vector in our own option
  parsing during development.
- **Dependabot** keeps the development dependencies current, and they are the only
  dependencies: no published package depends on anything outside this repository.

## Where this repo stands against OpenSSF Scorecard

[Scorecard](.github/workflows/scorecard.yml) runs weekly and uploads its findings to Security
→ Code scanning, so every check it fails is an open alert. Three of them cannot be closed by
anything in this repository, and are recorded here so the next person does not re-derive that:

| Check | Why it is open | What closes it |
| --- | --- | --- |
| Maintained | The repository was created inside the last 90 days. Scorecard scores that 0 regardless of commit activity. | Time. |
| Code-Review | 0 of 28 changesets carry an approval — a solo maintainer merging their own pull requests. | A branch protection rule on `main` requiring an approving review, which is a repository setting and not a file. |
| CII-Best-Practices | No OpenSSF Best Practices badge. | Registering the project at [bestpractices.dev](https://www.bestpractices.dev) and putting the badge in the README. A pull request cannot do the registering half. |

The rest are code, and are treated as bugs: Vulnerabilities is kept at zero against
`npm audit` (with `overrides` where an upstream pins a vulnerable version, as it does for
`smol-toml`), SAST by running CodeQL on every commit that reaches `main` as well as on the
promote gate, and Fuzzing by the fast-check property in
`packages/flagstaff/src/plugin-fuzz.test.ts` over the one function here that eats input it
did not write.
