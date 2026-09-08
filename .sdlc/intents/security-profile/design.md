# Design — `security-profile`

Intent: [`intent.md`](./intent.md). **Status:** review.

---

## Requirements

| id | Requirement |
| :-- | :-- |
| Q1 | Reserved taxonomy: `0` clean · `1` findings at or above the gate · `2` tool or internal failure · `3` invalid configuration or rules · `4` authentication or entitlement · `5` partial scan. Binding two classes to one code fails at startup |
| Q2 | SARIF 2.1.0 with the OASIS schema URL, `properties.tags`, `precision`, and **`security-severity` always populated** — derived from declared severity, overridden by a real CVSS score when the finding carries one |
| Q3 | `--severity` (display) and `--fail-on` (gate) are independent; one scan answers both |
| Q4 | Every report carries a `schemaVersion`, with a written stability policy: within a version, optional fields may appear or vanish and consumers ignore unknown fields; a removal, rename, type change or meaning change requires a bump |
| Q5 | `render` re-emits the canonical JSON as SARIF, JUnit, CycloneDX or HTML **without re-scanning** |
| Q6 | Telemetry off unless explicitly enabled; **one** flag disables all egress including version checks; `DO_NOT_TRACK` honoured; a local inspection mode prints what would be sent without sending it |
| Q7 | A findings report distinguishes *scanned and clean* from *could not scan*, so `0` never means "we skipped everything" |

## Design

```
burgee/security
  ├── codes.ts      Q1 — the reserved taxonomy, and the collision check
  ├── sarif.ts      Q2 — emitter + the severity ladder
  ├── gate.ts       Q3 — --fail-on, evaluated over findings independently of display
  ├── report.ts     Q4/Q7 — the canonical envelope, schemaVersion, coverage
  └── render.ts     Q5 — canonical JSON in, other formats out
```

**Q1 is enforced at startup, not documented.** The profile owns codes 0–5; a command that
declares an error class already bound to another raises before any argv is read. This is
the direct answer to oxlint collapsing a 20-variant internal enum to `{0,1}` and to trivy's
`--exit-code 1` colliding with `log.Fatal`.

**The severity ladder** follows trivy: `CRITICAL 9.5 · HIGH 8.0 · MEDIUM 5.5 · LOW 2.0 ·
default 0.0`, overwritten by a finding's own CVSS v3 base score when present. Chosen over
semgrep's pass-through deliberately — a missing `security-severity` does not error, it
silently renders without severity in GitHub Code Scanning, and silent degradation is the
failure mode compliance cannot absorb.

**Q3 exists because both scanners conflate display and gating**, to the point that trivy's
documentation recommends running the scanner twice. Findings are collected once; `--severity`
filters what is printed; `--fail-on` is evaluated over the unfiltered set.

**Q6's single switch** is the answer to trivy's two-flag trap, where disabling telemetry
still contacts the version endpoint. One flag, all egress, and a test that fails if a socket
opens.

## Verification

- `sarif.test.ts` validates emitted documents against the OASIS 2.1.0 schema, and asserts
  `security-severity` is present on **every** result including findings whose rule carries
  no metadata — the exact case semgrep degrades on.
- `codes.test.ts`, proven red first: a configuration binding findings and internal failure to
  one code must throw at startup. Written against an implementation that permits it.
- `egress.test.ts` runs the demo scanner with the quiet flag under a stubbed socket layer and
  fails if anything connects.
- `gate.test.ts` asserts a run with `--severity CRITICAL --fail-on HIGH` displays only
  criticals and still exits 1 for a high — the case both scanners need two runs for.

## Rejected alternatives

- **Putting the taxonomy in the core engine.** A non-scanner CLI should not inherit a
  scanner's codes; E1 stays the general contract and Q1 refines it under an opt-in profile.
- **Pass-through `security-severity`.** semgrep's approach, rejected: it fails silently
  downstream, and the framework has the declared severity available in every case.
- **A `--quiet-network` flag per behaviour.** trivy's trap. One switch means one switch.
- **Emitting SARIF from the core.** It would put a schema and an emitter in every CLI's
  bundle for a feature most never use (K6).

## Out of scope

- Vulnerability databases, rule formats, or scanning of any kind. This is the reporting and
  exit contract a scanner plugs into, not a scanner.
- Compliance frameworks and control mapping (trivy's `--compliance`). A later intent if a
  real adopter needs it.
