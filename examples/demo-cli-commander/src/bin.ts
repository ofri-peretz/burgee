#!/usr/bin/env node
import { processRuntime } from 'burgee/testing';

import { createProgram } from './index.js';

await createProgram(processRuntime).parseAsync(processRuntime.argv, { from: 'user' });
