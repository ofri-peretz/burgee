#!/usr/bin/env node
import {getCancelSignal, sendMessage} from '../../shim-1.js';

const id = setTimeout(() => {}, 1e8);
const cancelSignal = await getCancelSignal();
// eslint-disable-next-line unicorn/prefer-add-event-listener
cancelSignal.onabort = async () => {
	await sendMessage(cancelSignal.reason);
	clearTimeout(id);
};

await sendMessage('.');
