#!/usr/bin/env node
/* eslint-disable node/shebang */
// eslint-disable-next-line no-undef
const yargs = require('../../');
const {hideBin} = require('../../shim-1.js')
const argv = yargs(hideBin(process.argv)).help('help').completion().argv;
console.log(JSON.stringify(argv._));
