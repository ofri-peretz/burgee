#!/usr/bin/env node
import {sendMessage, getOneMessage} from '../../shim.js';
import {foobarString} from '../helpers/input.js';

await Promise.all([
	getOneMessage(),
	sendMessage(foobarString),
]);
