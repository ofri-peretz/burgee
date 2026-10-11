# OpenSSF Best Practices (bestpractices.dev): draft answers, passing level

Drafted 2026-10-10 from the repository's real state; **not submitted**. The badge is registered
under the owner's GitHub account at <https://www.bestpractices.dev/en/projects/new>. Each answer
cites where it is true. Scorecard's `CII-Best-Practices` check reads 0 until a badge exists.

## Fix first

- **Private vulnerability reporting is off.** `SECURITY.md` sends reporters to GitHub's private
  vulnerability reporting, but `gh api repos/ofri-peretz/burgee/private-vulnerability-reporting`
  returns `{"enabled": false}`, so the link dead-ends. Owner action: Settings → Code security →
  Private vulnerability reporting → Enable (or
  `gh api -X PUT repos/ofri-peretz/burgee/private-vulnerability-reporting`). The `vulnerability_report_private`
  criterion below is only Met after that.

## Basics

| criterion | answer | evidence |
| :-- | :-- | :-- |
| description_good | Met | README opening; npm descriptions (positioning R7) |
| interact | Met | GitHub issues (946+), PRs, `CONTRIBUTING.md` |
| contribution | Met | `CONTRIBUTING.md` |
| contribution_requirements | Met | `CONTRIBUTING.md`, commitlint, `PULL_REQUEST_TEMPLATE.md` |
| floss_license / floss_license_osi | Met | MIT, `LICENSE`, every `package.json` |
| license_location | Met | `LICENSE` at the root |
| documentation_basics | Met | ten docs sites (`*.interlace.tools`), READMEs |
| documentation_interface | Met | generated API reference (`scripts/api-reference.ts`, `/docs/api`) |
| sites_https | Met | GitHub, npm, `*.interlace.tools` all HTTPS |
| discussion | Met | GitHub issues and PRs, searchable and linkable |
| english | Met | |
| maintained | Met | commits daily; releases weekly |

## Change control

| criterion | answer | evidence |
| :-- | :-- | :-- |
| repo_public / repo_track / repo_interim / repo_distributed | Met | public git on GitHub, every change by PR |
| version_unique | Met | semver, a git tag `<pkg>@<version>` per release (`release.yml`) |
| version_semver | Met | changesets; all ten packages ≥ 1.0 |
| release_notes | Met | per-package `CHANGELOG.md`; each GitHub Release carries that version's section |
| release_notes_vulns | Met | changelog entries name a security fix; none so far |

## Reporting

| criterion | answer | evidence |
| :-- | :-- | :-- |
| report_process / report_tracker | Met | GitHub issues, `ISSUE_TEMPLATE/` |
| report_responses | Met | issues answered; the acknowledgement promise is in `SECURITY.md` |
| enhancement_responses | Met | |
| report_archive | Met | GitHub issues are public and archived |
| vulnerability_report_process | Met | `SECURITY.md` |
| vulnerability_report_private | **Met only after the fix above** | `SECURITY.md` + private vulnerability reporting |
| vulnerability_report_response | Met | `SECURITY.md`: acknowledgement within 7 days |

## Quality

| criterion | answer | evidence |
| :-- | :-- | :-- |
| build / build_common_tools | Met | `npm ci && npx turbo run build` |
| build_floss_tools | Met | npm, TypeScript, turbo, vitest |
| test / test_invocation | Met | `npm test`; `npm run ci:local` is the pre-push battery |
| test_most | Met | 100% statement/branch/function/line coverage on the published packages (codecov, `vitest-coverage.config.ts`) |
| test_continuous_integration | Met | `quality.yml`, `quality-full.yml` on every PR, Node 24/26 × Linux/macOS/Windows |
| test_policy | Met | `CONTRIBUTING.md`; AI_NATIVE_SDLC rule 4: a fix ships with a check proven red first |
| tests_are_added | Met | e.g. #926, #952, #961: each adds a test proven to fail before the fix |
| tests_documented_added | Met | `CONTRIBUTING.md`, `AGENTS.md` |
| warnings / warnings_fixed / warnings_strict | Met | `eslint --max-warnings 0`, TypeScript `strict` |

## Security

| criterion | answer | evidence |
| :-- | :-- | :-- |
| know_secure_design / know_common_errors | Met | maintainer authors the Interlace ESLint security plugins; `SECURITY.md` |
| crypto_* | N/A | the packages implement no cryptography |
| delivery_mitm | Met | npm over HTTPS; trusted publishing (OIDC) with SLSA provenance, `trusted-publishing-lock` |
| delivery_unsigned | Met | provenance and Sigstore bundle attached to each GitHub Release; CycloneDX SBOM from #962 |
| vulnerabilities_fixed_60_days | Met once the OSV fix lands | Scorecard listed 9 OSV advisories in docs/dev dependencies on 2026-10-10; fix in flight (`check:osv`) |
| vulnerabilities_critical_fixed | Met | none critical in a published package; published packages have no external dependency |
| no_leaked_credentials | Met | no npm token anywhere (`trusted-publishing-lock`); secret scanning and push protection enabled |

## Analysis

| criterion | answer | evidence |
| :-- | :-- | :-- |
| static_analysis | Met | CodeQL (`codeql.yml`), ESLint including the maintainer's security plugins |
| static_analysis_common_vulnerabilities | Met | CodeQL's default JavaScript/TypeScript suite, which includes the common-vulnerability queries |
| static_analysis_fixed | Met, with a caveat | CodeQL alerts are triaged, but CodeQL is **not** a required check on `main` today; making it one is an owner decision |
| static_analysis_often | Met | every PR and push |
| dynamic_analysis | Met | the incumbents' own test suites run against each drop-in (`compat-oracle`) in CI |
| dynamic_analysis_unsafe | N/A | TypeScript, no memory-unsafe code |
| dynamic_analysis_enable_assertions | Met | tests run with assertions on |
| dynamic_analysis_fixed | Met | |
