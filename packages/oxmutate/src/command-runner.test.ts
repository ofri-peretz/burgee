import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { makeSandbox } from "./command-runner.js";
import { discard } from "./__fixtures__/scratch-dir.js";

describe("makeSandbox", () => {
  it("keeps a tsconfig extends that climbs out of the project resolvable from the sandbox", () => {
    // The package's tsconfig extends a file above it, as a monorepo's packages do.
    const outer = mkdtempSync(path.join(tmpdir(), "oxmutate-sandbox-"));
    try {
      const root = path.join(outer, "pkg");
      mkdirSync(root);
      writeFileSync(
        path.join(outer, "tsconfig.base.json"),
        '{"compilerOptions":{"strict":true}}',
      );
      writeFileSync(
        path.join(root, "tsconfig.json"),
        '{ "extends": "../tsconfig.base.json" }',
      );

      const sandbox = makeSandbox(root);
      try {
        const ext = (
          JSON.parse(
            readFileSync(path.join(sandbox, "tsconfig.json"), "utf8"),
          ) as { extends: string }
        ).extends;
        expect(existsSync(path.resolve(sandbox, ext))).toBe(true);
        expect(
          JSON.parse(readFileSync(path.resolve(sandbox, ext), "utf8")),
        ).toEqual({ compilerOptions: { strict: true } });
      } finally {
        discard(sandbox);
      }
    } finally {
      discard(outer);
    }
  });
});
