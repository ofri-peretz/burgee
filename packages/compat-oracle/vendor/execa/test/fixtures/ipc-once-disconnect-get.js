#!/usr/bin/env node
import process from 'node:process';
import {getOneMessage} from '../../shim.js';

await getOneMessage();

process.once('disconnect', () => {
	console.log('.');
});

process.send('.');
