import test from 'ava';
import indentString from 'indent-string';
import {_verifyCli, stripIndentTrim, meowVersion} from '../_utils.js';

const fixtureFolder = 'allow-unknown-flags';

const allowUnknownFlags = `${fixtureFolder}/fixture.js`;
const allowUnknownFlagsCamelCase = `${fixtureFolder}/fixture-camelcase.js`;
const allowUnknownFlagsWithHelp = `${fixtureFolder}/fixture-with-help.js`;

const verifyFlags = _verifyCli(allowUnknownFlags);
const verifyFlagsCamelCase = _verifyCli(allowUnknownFlagsCamelCase);

test('specifying unknown flags', verifyFlags, {
	args: '--foo bar --unspecified-a --unspecified-b input-is-allowed',
	error: stripIndentTrim`
		Unknown flags
		--unspecified-a
		--unspecified-b
	`,

});

test('specifying known flags', verifyFlags, {
	args: '--foo bar',
	expected: 'bar',
});

test('help as a known flag', verifyFlags, {
	args: '--help',
	expected: indentString('\nCustom description\n\nUsage\n  foo <input>\n\n', 2),
});

test('version as a known flag', verifyFlags, {
	args: '--version',
	expected: meowVersion,
});

test('help as an unknown flag', verifyFlags, {
	args: '--help --no-auto-help',
	error: stripIndentTrim`
		Unknown flag
		--help
	`,
});

test('version as an unknown flag', verifyFlags, {
	args: '--version --no-auto-version',
	error: stripIndentTrim`
		Unknown flag
		--version
	`,
});

test('help with custom config', verifyFlags, {
	fixture: allowUnknownFlagsWithHelp,
	args: '-h',
	expected: indentString('\nCustom description\n\nUsage\n  foo <input>\n\n', 2),
});

test('version with custom config', verifyFlags, {
	fixture: allowUnknownFlagsWithHelp,
	args: '-v',
	expected: meowVersion,
});

test('accepts camelCase flag with allowUnknownFlags: false', verifyFlagsCamelCase, {
	args: '--outDir models',
	expected: 'models',
});

test('accepts kebab-case flag with allowUnknownFlags: false', verifyFlagsCamelCase, {
	args: '--out-dir models',
	expected: 'models',
});

test('does not treat arguments after -- as unknown flags', verifyFlags, {
	args: '-- --unspecified-a',
	expected: 'undefined',
});

test('does not treat negative integer input as an unknown flag', verifyFlags, {
	args: '-1',
	expected: 'undefined',
});

test('does not treat negative decimal input as an unknown flag', verifyFlags, {
	args: '-0.5',
	expected: 'undefined',
});

test('does not treat a lone dash input as an unknown flag', verifyFlags, {
	args: '-',
	expected: 'undefined',
});
