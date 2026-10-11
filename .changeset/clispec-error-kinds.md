---
"burgee": minor
---

Every failure names its kind. The `--json` envelope's `error` carries `kind` beside the numeric `code` (`runtime`, `usage`, `config`, `cancelled`, `auth`, `timeout`, `interrupted`, or your own), and `--schema` lists every kind under a new `errors` key with its `exit_code`, whether it is `retryable`, and a `description`, in clispec v0.3's shape. `schemaVersion` stays 1: the key is new and nothing changes meaning.

`defineError` takes an optional `kind`, `retryable` and `description`. Without `kind`, a class's kind is its name in snake case less a trailing `Error` (`QuotaError` is `quota`); a declared one must be snake_case and one class's alone. A name whose kind is already held, such as `TimeoutError` beside the contract's `timeout`, is told apart by its code (`timeout_12`), so every class that defined before still defines.

stderr ends with the failure as one JSON line, `{"error":{"kind","code","message"}}`, whenever it is not a terminal: always under `--json` (stdout's envelope is unchanged), and after the prose when stderr is piped or captured. At a terminal stderr is unchanged. The commander and yargs front-ends are unchanged.
