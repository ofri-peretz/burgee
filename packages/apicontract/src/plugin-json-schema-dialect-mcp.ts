/**
 * MCP 2026-07-28 tool schemas (`inputSchema`, `outputSchema`). Read 2026-11-18 from
 * https://modelcontextprotocol.io/specification/2026-07-28/basic/index.md (JSON Schema 2020-12 by
 * default) and https://modelcontextprotocol.io/specification/2026-07-28/server/tools.md (SEP-2106:
 * any 2020-12 keyword). A network `$ref` must not be followed: the generated document has none,
 * since every reference is a pointer into it. `structuredContent` may be any JSON value, so the
 * root is not held to be an object here.
 */
import { KEYWORDS } from './plugin-json-schema-build.js';
import { type Dialect, type Rule } from './plugin-json-schema-dialect.js';

export const dialect: Dialect = {
  source: 'https://modelcontextprotocol.io/specification/2026-07-28/server/tools.md',
  read: '2026-11-18',
  keywords: Object.fromEntries([...KEYWORDS.keys()].map((keyword): [string, Rule] => [keyword, 'keep'])),
  rootMustBeObject: false,
  additionalPropertiesFalseRequired: false,
  allRequired: false,
  recursion: true,
  refs: 'keep',
  flat: false,
  limits: [],
};
