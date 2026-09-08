# What AI agents actually need from a CLI

Researched 2026-09-07 against the MCP specification revision `2026-07-28`, ~35 sources, with
a second verification pass on every circulating benchmark claim. **That second pass is the
most valuable part of this document**: three of the numbers this project was likely to
quote do not survive it.

## 1. Claims we must never use

**"CLI is 32× cheaper and 100% reliable against MCP's 72%."** Traced to a single vendor
blog by a company selling agent-auth infrastructure. Its own committed repository
contradicts the post — reporting a *single* run and "both modalities achieve 100% task
completion" — and all seven claimed MCP failures were TCP timeouts against one hosted
endpoint on one day. Every downstream citation restates it without methodology.

**Anthropic's 150,000 → 2,000 tokens (98.7%).** A worked *illustrative example* in
[Code execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp),
not a benchmark: no methodology, sample or validation. Usable as a design argument from the
protocol's own authors; not as evidence. The load-bearing part is the mechanism, not the
number: *"the full call transcript flows through twice."*

**"Filtering verbose CLI output saves agents money."** The only rigorous test contradicts
it. JetBrains ran **425 paired trials, ~$320, 86 SkillsBench tasks, Docker-sandboxed with
verifiers**. At low reasoning effort the filtering tool was **+7.6% median cost per task
(p=0.004)** and +13.8% more turns; at high effort, +0.1% (p=0.99). Quality unchanged. The
mechanism: most session input arrives as **cached re-reads billed at one-tenth price**,
while lossy output causes extra turns that cancel the saving.

### What this changes for us

`cli-benchmarks` B1 currently promises "≥40% fewer tokens". **That target is now suspect**
and must be treated as a hypothesis to test, not a claim to defend. If prompt caching
absorbs most of the input cost, the honest headline is not token savings.

**Justify O2, O5 and F1 as correctness and parse-reliability requirements, not as token
economy.** An agent that misreads a spinner-mangled line takes a wrong action; that is the
real damage, and it is not priced in tokens.

The one credible number: an independent AWS replication (n=10/task, 5 tasks, boto3
ground-truth verification) found CLI used **43–60% fewer input tokens at equal success
rates**. Real, defensible, and an order of magnitude smaller than the viral figure.

## 2. The strongest empirical finding: silent failure is the killer

*Failure as a Process: An Anatomy of CLI Coding Agent Trajectories* (Zhao et al., UCL /
Nanjing, [arXiv 2607.09510](https://arxiv.org/html/2607.09510v1)) analysed **1,794
trajectories across 89 tasks, 3 scaffolds and 7 models**.

| Finding | Number |
| :--- | :--- |
| Observable failure emerges *after* the decisive error by | median **~10 steps** |
| Median recovery window before failure is unrecoverable | **1 execution step** |
| Failed runs performing checks that cannot change the outcome | 28% |
| Failed runs repairing the wrong problem | 24% |

Their case study: a `cd` fails silently with no output, the agent reads the empty result as
success, and the failure stays invisible for **17 steps** until `git add -A` reports "not a
git repository."

**This is the single best justification for the whole exit-code and envelope contract**,
and it is worth more than any token argument. It also adds a requirement we do not have:
**a no-op must announce itself.** A command that changed nothing must say so, or an agent
reads silence as success.

## 3. Requirements, ordered by severity

### Liveness and correctness

| | Requirement | Maps to |
| :-- | :--- | :--- |
| A1 | **Never prompt when stdin is not a TTY.** Refuse with a distinct exit code and name the bypass flag. It does not degrade — it deadlocks | P2, E3 |
| A2 | A stable, documented, **distinct exit code per error kind**; no code shared between an error and an outcome | E1 |
| A3 | stdout carries data, stderr carries diagnostics — in **every** output mode | O1, O2 |
| A4 | Errors **enumerate valid alternatives** and name the recovery command | E3 |
| A5 | **Never succeed silently.** Emit `changed: true \| false` on every idempotent command | **new** |
| A6 | No ANSI, spinners or progress redraws when stdout is not a TTY | O2 |

On A1, the pattern worth copying is Arcjet's: a mutation returns **exit code 4** plus a JSON
envelope containing the proposed change and the exact command to re-run with `--confirm`.
That turns a deadlock into a two-step protocol that also works in CI. Our `CANCELLED` is
already 4 — the envelope is the missing half.

**A2 is where the incumbents are worst, and it is our opening.** Of the major agent CLIs,
only Gemini CLI publishes a numeric table. Codex CLI, GitHub Copilot CLI, aider and opencode
document none; Codex has open issues for exiting `0` with empty stdout and for hanging
forever. Cursor documents "non-zero on failure" but warns **no well-formed JSON is emitted
on failure** — so an agent cannot parse its way to the error.

### The manifest

| | Requirement | Maps to |
| :-- | :--- | :--- |
| A7 | A `schema` command that works with **no auth, no config file, no network** | F1 — *precondition is new* |
| A8 | The manifest carries what a tool definition needs and a flag parser does not | **new — see below** |
| A9 | Generate the CLI *and* the tool definitions from **one** schema | the thesis |
| A10 | Enforce naming consistency **mechanically**, as a lint pass over the manifest | eslint-plugin-cli-floor |

### Context economy

| | Requirement |
| :-- | :--- |
| A11 | Bounded output by default: pagination, limits, field selection, explicit truncation hints. Claude Code caps tool responses at 25,000 tokens |
| A12 | `--json` always overrides TTY detection, and structured output on **every failure**, not only success |
| A13 | Keep the generated tool surface small — the bloat is `inputSchema`, not descriptions |

On A13, the best-methodology measurement available (o200k_base, committed raw JSON) found
Notion's 24 tools cost **17,161 tokens**, GitHub's 26 cost 3,546, and Slack's 8 cost 679 —
a **25× spread**, with **97% of the worst server's cost in `inputSchema`**. Notion later
redesigned to 773 tokens, a 95.5% reduction. **Cost is a per-server design property, not a
property of MCP** — which means our generated `tools/list` can be good or bad and we should
measure ours.

## 4. The flag/schema gap — our actual engineering problem, named

Cobra issue #2362 (Feb 2026) inventories exactly what a normal CLI framework cannot give a
tool definition:

| MCP needs | A typical CLI framework has | |
| :--- | :--- | :--- |
| type, description, default, required | the same | ✅ recoverable |
| `enum` / valid values | completion **functions** — dynamic callables | ❌ not readable as data |
| `minimum` / `maximum` | — | ❌ absent |
| output schema | — | ❌ absent |
| destructive / read-only marker | — | ❌ absent |

> *"There's no way to read back 'this flag accepts only these values' as data."*

**These must be first-class in burgee's manifest, not annotations bolted on later.** This is
the concrete reason S1 (Standard Schema) matters: a schema validator carries `enum`,
`minimum` and `maximum` as data, which a completion callback never can.

## 5. The MCP tool-definition fields, exactly

From `schema/2026-07-28/schema.ts`. `Tool extends BaseMetadata, Icons`:

```ts
interface Tool {
  name: string;              // REQUIRED. 1–128 chars, [A-Za-z0-9_-.] only, no spaces
  title?: string;            // precedence: title > annotations.title > name
  description?: string;      // "a hint to the model"
  inputSchema: {             // REQUIRED. type:"object" at the root
    $schema?: string;        //   defaults to JSON Schema 2020-12
    type: "object";
  };
  outputSchema?: { … };      // shape of CallToolResult.structuredContent
  annotations?: ToolAnnotations;
  _meta?: Record<string, unknown>;
}

interface ToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;     // default false
  destructiveHint?: boolean;  // default TRUE   ← only meaningful when readOnlyHint is false
  idempotentHint?: boolean;   // default false
  openWorldHint?: boolean;    // default TRUE
}
```

### The trap, and what it forces on our design

**`destructiveHint` and `openWorldHint` default to `true`. Silence is the *dangerous*
reading.** A read-only `list` command that omits annotations is presented to every client as
destructive and open-world.

So the manifest needs a **required `effects` field per command** —
`read_only | idempotent | non_idempotent` — which maps directly onto the three hints. This
is now requirement **N6**, and it is required rather than optional precisely because the
default is unsafe.

Three more generation notes:

- **Zero-parameter commands** emit `{ "type": "object", "additionalProperties": false }`,
  not `{}`.
- **A subcommand path must be flattened** — `foo bar baz` becomes `foo.bar.baz`, since names
  may not contain spaces.
- **Errors inside a tool go in `isError: true`, never as a protocol error** — *"Otherwise,
  the LLM would not be able to see that an error occurred and self-correct."* Our non-zero
  exit code plus a teaching stderr message maps onto exactly that.
- **Annotations are untrusted by contract**: *"clients MUST consider tool annotations to be
  untrusted unless they come from trusted servers."* They are client UX hints, never a
  security boundary — so N2's opt-in gating must not rely on them.

## 6. Two existing specs we should conform to rather than reinvent

- **[clispec.dev](https://clispec.dev/) v0.3** (Aug 2026) — an actual specification for
  agent-facing CLIs, with MUSTs that match our floor almost line for line: works without a
  TTY; every error kind declares an exit code; no code shared between error and outcome;
  schema succeeds without auth, config or network; `cardinality` declared per data command.
  We should measure the floor against it and cite it rather than claim originality.
- **[cli-agent-lint](https://github.com/Camil-H/cli-agent-lint)** — 34 checks across Flow
  Safety, Token Efficiency, Self-Describing, Automation Safety and Predictability. An
  off-the-shelf conformance gate. **Running burgee's own demo through it belongs in wave 1**,
  because a floor that fails someone else's published checklist is not a floor.

## 7. The production precedent, and the positioning correction

Cloudflare, [Building a CLI for all of Cloudflare](https://blog.cloudflare.com/cf-cli-local-explorer/)
(April 2026), drives **100+ products and nearly 3,000 API operations** from a single
TypeScript schema that generates CLI commands, API clients, MCP servers, Agent Skills,
config files *and* OpenAPI schemas. Their CTO: *"agents love CLIs."* Their engineers:
*"Increasingly, agents are the primary customer of our APIs."*

On why OpenAPI was not enough — directly relevant to our manifest design:

> "OpenAPI schemas describe REST APIs, but we have interactive CLI commands that involve
> multiple actions that combine both local development and API requests… along with Agent
> Skills and documentation that ties this all together."

### The correction to our positioning

The debate is **converging, not resolving in our favour**, and both leading CLI-over-MCP
advocates have softened. Simon Willison reversed in July 2026: giving an agent a shell is
fraught, whereas *"MCP tools are easier to audit and control."* Anthropic frames Skills as
**complementary** to MCP. And there is a documented *correctness* failure of the MCP-only
path — an agent building a Postgres view on an RLS table without `security_invoker`,
silently exposing data — which cuts both ways.

The real axis turned out to be **when tool definitions enter context** — progressive
disclosure — not CLI versus MCP. Everyone converged there.

**So burgee should not be positioned as MCP-replacing.** That invites the security
counter-argument and picks a fight with a moving target. The stronger, better-evidenced
claim is the one Cloudflare actually shipped:

> **One declaration. A `--help` for exploration, a manifest for machine consumption, and a
> generated `tools/list` when a protocol is genuinely required.**

We generate both, and let the caller choose. That is also exactly what §1 of
`architecture.md` already describes — the positioning just needs to stop saying "instead of
MCP" and start saying "and MCP, from the same source."
