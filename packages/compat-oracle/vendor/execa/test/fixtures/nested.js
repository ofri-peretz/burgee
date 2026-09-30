#!/usr/bin/env node
import {
	execa,
	execaSync,
	getOneMessage,
	sendMessage,
} from '../../shim.js';
import {getNestedOptions} from '../helpers/nested.js';

const {
	isSync,
	file,
	commandArguments,
	options,
	optionsFixture,
	optionsInput,
} = await getOneMessage();

const commandOptions = await getNestedOptions(options, optionsFixture, optionsInput);

try {
	const result = isSync
		? execaSync(file, commandArguments, commandOptions)
		: await execa(file, commandArguments, commandOptions);
	await sendMessage(result);
} catch (error) {
	await sendMessage(error);
}
