#!/usr/bin/env node
import { processRuntime } from '@interlace/cli-core';

import { createProgram } from './index.js';

await createProgram(processRuntime).parseAsync(processRuntime.argv, { from: 'user' });
