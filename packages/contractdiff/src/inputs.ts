/**
 * The input adapters in detection order (apicontract-inputs R1): `openapi` and `swagger2` first,
 * `jsonschema` last because almost any object is a schema. Created by PLAN.md 6.0.
 */
import { type Adapter } from './host.js';
import { adapter as asyncapi } from './input-asyncapi.js';
import { adapter as jsonschema } from './input-jsonschema.js';
import { adapter as mcp } from './input-mcp.js';
import { adapter as protobuf } from './input-protobuf.js';
import { adapter as swagger2 } from './input-swagger2.js';
import { openapi } from './openapi.js';

/** The built-in adapters, by the name a generator's `inputs` lists. */
export const builtinAdapters: Readonly<Record<string, Adapter>> = { openapi, swagger2, asyncapi, mcp, protobuf, jsonschema };
