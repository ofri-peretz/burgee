import { beforeAll, expect, it } from "vitest";

import { label } from "./label.js";

// A `beforeAll` that outlasts even the dry run's 3x hook timeout (child.ts DRY_TIMEOUT_SCALE), in the
// dry run alone (OXMUTATE_MODE, child.ts). Vitest skips the tests under it, so no test would cover
// `label` and every mutant of it would be reported NoCoverage, with the run passing.
const HOOK_MS = 2000;

beforeAll(async () => {
  if (process.env["OXMUTATE_MODE"] === "dry")
    await new Promise((resolve) => setTimeout(resolve, HOOK_MS));
});

it("labels the count", () => {
  expect(label(2)).toBe("2 items");
});
