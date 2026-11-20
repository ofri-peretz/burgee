import { expect, it } from "vitest";

import { drain } from "./drain.js";

const FROM = 3;

it("drains to zero or below", () => {
  expect(drain(FROM)).toBe(0);
  expect(drain(0)).toBe(0);
});
