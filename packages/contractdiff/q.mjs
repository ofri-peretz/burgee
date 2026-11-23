import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gen } from "contractdiff";

const dir = mkdtempSync(join(tmpdir(), "contractdiff-"));
writeFileSync(join(dir, "openapi.json"), JSON.stringify({
  openapi: "3.1.0",
  info: { title: "Pets", version: "1.0.0" },
  paths: {
    "/pets/{id}": {
      get: {
        operationId: "getPet",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "A pet", content: { "application/json": { schema: { type: "object", required: ["name"], properties: { name: { type: "string" } } } } } } },
      },
    },
  },
}));
writeFileSync(join(dir, "contractdiff.config.json"), JSON.stringify({ input: "openapi.json", targets: { types: { generator: "types", out: "src/api" } } }));

const report = await gen({ cwd: dir });
console.log(report.files.map((f) => `${f.action} ${f.path}`).join("\n"));
