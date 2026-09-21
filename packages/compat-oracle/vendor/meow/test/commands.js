import test from 'ava';
import meow from '../shim.js';
import {_verifyCli, stripIndent, stripIndentTrim} from './_utils.js';

const importMeta = import.meta;
const verifyCommandsCli = _verifyCli('commands/fixture.js');

test('command is undefined without commands option', t => {
	const cli = meow({importMeta, argv: ['foo']});
	t.is(cli.command, undefined);
	t.deepEqual(cli.input, ['foo']);
});

test('command is undefined when commands is set but no command given', t => {
	const cli = meow({importMeta, argv: [], commands: ['run', 'list']});
	t.is(cli.command, undefined);
	t.deepEqual(cli.input, []);
});

test('commands with no trailing input', t => {
	const cli = meow({
		importMeta,
		argv: ['run'],
		commands: ['run', 'list'],
	});

	t.is(cli.command, 'run');
	t.deepEqual(cli.input, []);
});

test('commands pass unknown post-command flags through when allowUnknownFlags is true', t => {
	const cli = meow({
		importMeta,
		argv: ['run', '--unknown-child'],
		allowUnknownFlags: true,
		commands: ['run', 'list'],
	});

	t.is(cli.command, 'run');
	t.deepEqual(cli.input, ['--unknown-child']);
});

test('commands with flags-only argv return undefined command', t => {
	const cli = meow({
		importMeta,
		argv: ['--verbose'],
		flags: {verbose: {type: 'boolean'}},
		commands: ['run', 'list'],
	});

	t.is(cli.command, undefined);
	t.deepEqual(cli.input, []);
});

test('commands parse command and pass-through input', t => {
	const cli = meow({
		importMeta,
		argv: ['--parent-flag', 'run', '--child', 'value'],
		allowUnknownFlags: false,
		flags: {
			parentFlag: {
				type: 'boolean',
			},
		},
		commands: ['run', 'list'],
	});

	t.is(cli.command, 'run');
	t.deepEqual(cli.input, ['--child', 'value']);
	t.is(cli.flags.parentFlag, true);
});

test('commands reject non-array', t => {
	const error = t.throws(() => {
		meow({
			importMeta,
			commands: 'run',
		});
	});

	t.is(error.message, 'The `commands` option must be an array of strings.');
});

test('commands reject empty array', t => {
	const error = t.throws(() => {
		meow({
			importMeta,
			commands: [],
		});
	});

	t.is(error.message, 'The `commands` option must contain at least one command.');
});

test('commands reject whitespace', t => {
	const error = t.throws(() => {
		meow({
			importMeta,
			commands: ['bad command'],
		});
	});

	t.is(error.message, 'The `commands` option must be an array of non-empty strings without whitespace that do not start with `-`.');
});

test('commands reject empty string', t => {
	const error = t.throws(() => {
		meow({
			importMeta,
			commands: [''],
		});
	});

	t.is(error.message, 'The `commands` option must be an array of non-empty strings without whitespace that do not start with `-`.');
});

test('commands reject dash-prefixed', t => {
	const error = t.throws(() => {
		meow({
			importMeta,
			commands: ['--run'],
		});
	});

	t.is(error.message, 'The `commands` option must be an array of non-empty strings without whitespace that do not start with `-`.');
});

test('commands returns undefined command when no command is given', verifyCommandsCli, {
	expected: stripIndentTrim`
		undefined

		false
	`,
});

test('commands validate the command', verifyCommandsCli, {
	args: 'nope',
	error: stripIndent`
		Unknown command: nope
		Available commands: run, list

		Usage
		  foo <command>

		Options
		  --parent-flag  Parent flag
	`,
});

test('commands pass post-command flags through without unknown flag check', verifyCommandsCli, {
	args: '--parent-flag run --child value',
	expected: stripIndentTrim`
		run
		--child,value
		true
	`,
});

test('commands still report unknown flags before the command', verifyCommandsCli, {
	args: '--unknown run',
	error: stripIndentTrim`
		Unknown flag
		--unknown
	`,
});

test('commands do not report child flags as unknown parent flags', verifyCommandsCli, {
	args: '--unknown run --child value',
	error: stripIndentTrim`
		Unknown flag
		--unknown
	`,
});

test('commands treat post-separator args as positional commands, not flags', verifyCommandsCli, {
	args: '-- --unknown run',
	error: stripIndent`
		Unknown command: --unknown
		Available commands: run, list

		Usage
		  foo <command>

		Options
		  --parent-flag  Parent flag
	`,
});

test('commands still report unknown flags before --', verifyCommandsCli, {
	args: '--unknown -- run',
	error: stripIndentTrim`
		Unknown flag
		--unknown
	`,
});
