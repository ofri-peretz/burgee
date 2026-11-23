# Overlay fixtures

From [`OAI/Overlay-Specification`](https://github.com/OAI/Overlay-Specification) (Apache-2.0) at
commit `be39b56020da12b8db56080da90fecb470701831`, unchanged. Read 2026-11-18. 33 overlays.

| Folder | Source | What it is |
| :-- | :-- | :-- |
| `compliant-sets/<set>/` | `compliant-sets/<set>/` | 8 sets of `openapi.yaml`, `overlay.yaml` and the `output.yaml` applying it must produce |
| `tests/v1.0/pass/`, `tests/v1.1/pass/` | the same paths | 25 overlays the specification's schema tests accept |

URL pattern: `https://raw.githubusercontent.com/OAI/Overlay-Specification/<commit>/<path>`.

The specification publishes no 1.2 test documents yet; the 1.2 reusable actions are tested on
documents written in the test file.
