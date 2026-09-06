#!/usr/bin/env node
import { processRuntime } from '@interlace/cli-core';
import yargs from 'yargs';

import { buildCli } from './index.js';

await buildCli(yargs(processRuntime.argv), processRuntime).parseAsync();
