# demo-cli-large

The fixture for `cli-modularity` (M1–M6): 30 commands across 5 groups, shared options
declared once, three handlers loaded lazily, one deprecated command, a plugin contributing
two more. `loads()` reports which handler modules have been imported, so the conformance
suite can prove that `--help` and `--schema` import none and one command imports one.
