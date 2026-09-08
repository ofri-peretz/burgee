#!/usr/bin/env node
import { processRuntime } from 'burgee/testing';
import yargs from 'yargs';

import { buildCli } from './index.js';

await buildCli(yargs(processRuntime.argv), processRuntime).parseAsync();
