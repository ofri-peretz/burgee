import { beforeAll, expect, it } from "vitest";

import { label } from "./label.js";

// A `beforeAll` that throws in the dry run alone: the same silent NoCoverage.
beforeAll(() => {
  if (process.env["OXMUTATE_MODE"] === "dry")
    throw new Error("fixture cannot start");
});

it("labels one", () => {
  expect(label(1)).toBe("1 items");
});
