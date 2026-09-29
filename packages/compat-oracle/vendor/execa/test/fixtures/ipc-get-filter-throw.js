#!/usr/bin/env node
import {getOneMessage} from '../../shim.js';
import {foobarString} from '../helpers/input.js';

await getOneMessage({
	filter() {
		throw new Error(foobarString);
	},
});
