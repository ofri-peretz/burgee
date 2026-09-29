#!/usr/bin/env node
import {getCancelSignal} from '../../shim-1.js';

const cancelSignal = await getCancelSignal();
cancelSignal.addEventListener('abort', () => {});
