#!/usr/bin/env node
import process from 'node:process';
import {foobarString} from '../helpers/input.js';
import {getOneMessage} from '../../shim.js';

await getOneMessage();

process.send(foobarString, () => {
	console.log('.');
});
