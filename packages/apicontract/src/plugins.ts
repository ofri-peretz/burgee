/**
 * The built-in plugins, in the order a target name is resolved. Created by PLAN.md 6.0 with a line
 * for every planned plugin, so no lane edits this file: a lane replaces its own `plugin-<name>.ts`.
 */
import { type Plugin } from './host.js';
import { plugin as express } from './plugin-express.js';
import { plugin as extractHono } from './plugin-extract-hono.js';
import { plugin as extractNest } from './plugin-extract-nest.js';
import { plugin as extractOpenapi } from './plugin-extract-openapi.js';
import { plugin as extractStandardSchema } from './plugin-extract-standard-schema.js';
import { plugin as extractTrpc } from './plugin-extract-trpc.js';
import { plugin as extractTsRest } from './plugin-extract-ts-rest.js';
import { plugin as fastify } from './plugin-fastify.js';
import { plugin as fetch } from './plugin-fetch.js';
import { plugin as hono } from './plugin-hono.js';
import { plugin as jsonSchema } from './plugin-json-schema.js';
import { plugin as markdown } from './plugin-markdown.js';
import { plugin as mcp } from './plugin-mcp.js';
import { plugin as msw } from './plugin-msw.js';
import { plugin as nest } from './plugin-nest.js';
import { plugin as swr } from './plugin-swr.js';
import { plugin as tanstackQuery } from './plugin-tanstack-query.js';
import { plugin as types } from './plugin-types.js';
import { plugin as validator } from './plugin-validator.js';

const planned: readonly (Plugin | undefined)[] = [types, validator, jsonSchema, nest, hono, fastify, express, fetch, tanstackQuery, msw, swr, mcp, markdown, extractStandardSchema, extractOpenapi, extractNest, extractHono, extractTrpc, extractTsRest];

/** The built-ins that exist so far. */
export const builtins: readonly Plugin[] = planned.filter((p): p is Plugin => p !== undefined);
