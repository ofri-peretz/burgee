#!/usr/bin/env node
import meow from '../../../shim.js';

const cli = meow({
	importMeta: import.meta,
	input: {
		isRequired: () => true,
	},
});

console.log(cli.input.join(','));
