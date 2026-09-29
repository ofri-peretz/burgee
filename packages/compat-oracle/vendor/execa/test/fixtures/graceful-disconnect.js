#!/usr/bin/env node
import process from 'node:process';
import {once} from 'node:events';
import {onAbortedSignal} from '../helpers/graceful.js';
import {getCancelSignal, sendMessage} from '../../shim-1.js';

const cancelSignal = await getCancelSignal();
await onAbortedSignal(cancelSignal);
await Promise.all([
	once(process, 'disconnect'),
	sendMessage(cancelSignal.reason),
]);
