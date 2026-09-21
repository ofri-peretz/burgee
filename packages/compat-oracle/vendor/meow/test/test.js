import test from 'ava';
import indentString from 'indent-string';
import meow from '../shim.js';
import {_verifyCli, stripIndentTrim} from './_utils.js';

const importMeta = import.meta;
const verifyCli = _verifyCli();

test('return object', t => {
	const cli = meow({
		importMeta,
		argv: ['foo', '--foo-bar', '-u', 'cat', '--', 'unicorn', 'cake'],
		help: `
			Usage
			  foo <input>
		`,
		flags: {
			unicorn: {shortFlag: 'u'},
			meow: {default: 'dog'},
			'--': true,
		},
	});

	t.like(cli, {
		input: ['foo'],
		flags: {
			fooBar: true,
			meow: 'dog',
			unicorn: 'cat',
			'--': ['unicorn', 'cake'],
		},
		pkg: {
			name: 'meow',
		},
		help: indentString('\nCLI app helper\n\nUsage\n  foo <input>\n', 2),
	});
});

test('flags option can be undefined', t => {
	const cli = meow({
		importMeta,
		flags: undefined,
	});

	t.deepEqual(cli.flags, {});
});

test('throws if input option is invalid type', t => {
	const error = t.throws(() => {
		meow({
			importMeta,
			input: true,
		});
	});

	t.is(error.message, 'The `input` option must be a string or an object.');
});

test('throws if input isRequired option is invalid type', t => {
	const error = t.throws(() => {
		meow({
			importMeta,
			input: {
				isRequired: 1,
			},
		});
	});

	t.is(error.message, 'The `input.isRequired` option must be a boolean or a function.');
});

test('spawn cli and disabled autoVersion and autoHelp', verifyCli, {
	args: '--version --help',
	expected: stripIndentTrim`
		version
		help
		meow
		camelCaseOption
	`,
});

test('spawn cli and test input', verifyCli, {
	args: '-u cat',
	expected: stripIndentTrim`
		unicorn
		meow
		camelCaseOption
	`,
});

test('spawn cli and test input flag', verifyCli, {
	args: '--camel-case-option bar',
	expected: 'bar',
});

test('disable autoVersion/autoHelp if `cli.input.length > 0`', t => {
	t.is(meow({importMeta, argv: ['bar', '--version']}).input.at(0), 'bar');
	t.is(meow({importMeta, argv: ['bar', '--help']}).input.at(0), 'bar');
	t.is(meow({importMeta, argv: ['bar', '--version', '--help']}).input.at(0), 'bar');
});
