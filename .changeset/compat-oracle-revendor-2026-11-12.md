---
"compat-oracle": patch
---

Re-vendored suites, each control level with its reference:

- commander 15.1.0 (1418 / 1418) and extra-typings 15.1.0 (369 / 369);
- slice-ansi 10.0.1 (129 / 129) and lilconfig 3.1.5 (81 / 81);
- dotenv 18.0.10 (198 / 198);
- clack 1.9.0 (23 / 23);
- inquirer-prompts 8.8.0 (228 / 228) and inquirer-core 12.1.0 (47 / 47).

dotenv's row gains a `dist/cli.cjs` entry, for the CLI bundle that 18.0.10's suite spawns. Without it every spawned `run` failed against dotenv itself.
