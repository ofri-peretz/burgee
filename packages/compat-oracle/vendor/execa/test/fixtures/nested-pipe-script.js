#!/usr/bin/env node
import {$, getOneMessage} from '../../shim.js';

const {
	file,
	commandArguments = [],
	options: {
		sourceOptions = {},
		destinationFile,
		destinationArguments = [],
		destinationOptions = {},
	},
} = await getOneMessage();
await $(sourceOptions)`${file} ${commandArguments}`
	.pipe(destinationOptions)`${destinationFile} ${destinationArguments}`;
