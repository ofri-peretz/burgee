#!/usr/bin/env node
import {onAbortedSignal} from '../helpers/graceful.js';
import {getCancelSignal, sendMessage} from '../../shim-1.js';

const cancelSignal = await getCancelSignal();
await onAbortedSignal(cancelSignal);
await sendMessage(cancelSignal.reason);
