#!/usr/bin/env node
import {getCancelSignal, sendMessage} from '../../shim-1.js';

const cancelSignal = await getCancelSignal();
await sendMessage(cancelSignal.aborted);
