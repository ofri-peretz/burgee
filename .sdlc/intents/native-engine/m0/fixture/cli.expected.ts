#!/usr/bin/env node
/**
 * The M0 fixture: one file with a specifier in every position `migrate` reads, and decoys in
 * the positions it must not touch. Its names are all ones the façades export, so the JavaScript
 * build moves every site and refuses nothing.
 */
import { Command, Option } from 'burgee/commander';
import type { OptionValues } from "burgee/commander";
import { hideBin } from 'burgee/yargs/helpers';
import 'burgee/commander';
export { InvalidArgumentError } from 'burgee/commander';
export * from 'burgee/yargs/helpers';
import chalk from 'roundel/chalk';

const { CommanderError } = require('burgee/commander');
const lazy = async () => await import('burgee/commander');
type Help = typeof import('burgee/commander').Help;

// Decoys: not specifiers, so neither build may touch them.
const label = 'commander';
const doc = { from: 'commander' };
console.log('commander', `import x from 'commander'`); // import { y } from 'commander'
/* require('commander') */

vi.mock('burgee/commander', () => ({}));
jest.requireActual('burgee/yargs/helpers');
require.resolve('burgee/commander');

const program = new Command('m0').addOption(new Option('-d, --debug')).version('0.0.0');
program.parse(hideBin(process.argv), { from: 'user' });
const opts: OptionValues = program.opts();
console.log(chalk.green(String(opts['debug'])), label, doc, lazy, CommanderError as unknown as Help);
