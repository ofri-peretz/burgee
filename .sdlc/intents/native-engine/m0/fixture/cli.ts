#!/usr/bin/env node
/**
 * The M0 fixture: one file with a specifier in every position `migrate` reads, and decoys in
 * the positions it must not touch. Its names are all ones the façades export, so the JavaScript
 * build moves every site and refuses nothing.
 */
import { Command, Option } from 'commander';
import type { OptionValues } from "commander";
import { hideBin } from 'yargs/helpers';
import 'commander';
export { InvalidArgumentError } from 'commander';
export * from 'yargs/helpers';
import chalk from 'chalk';

const { CommanderError } = require('commander');
const lazy = async () => await import('commander');
type Help = typeof import('commander').Help;

// Decoys: not specifiers, so neither build may touch them.
const label = 'commander';
const doc = { from: 'commander' };
console.log('commander', `import x from 'commander'`); // import { y } from 'commander'
/* require('commander') */

vi.mock('commander', () => ({}));
jest.requireActual('yargs/helpers');
require.resolve('commander');

const program = new Command('m0').addOption(new Option('-d, --debug')).version('0.0.0');
program.parse(hideBin(process.argv), { from: 'user' });
const opts: OptionValues = program.opts();
console.log(chalk.green(String(opts['debug'])), label, doc, lazy, CommanderError as unknown as Help);
