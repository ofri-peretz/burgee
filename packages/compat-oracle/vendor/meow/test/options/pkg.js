import test from 'ava';
import {_verifyCli, stripIndent} from '../_utils.js';
import meow from '../../shim.js';

const importMeta = import.meta;

const verifyPackage = _verifyCli('with-package-json/default/fixture.js');

test('description', t => {
	const cli = meow({
		importMeta,
		pkg: {
			description: 'Unicorn and rainbow creator',
		},
	});

	t.is(cli.help, stripIndent`

		Unicorn and rainbow creator
	`);
});

test('pkg normalization is lazy', t => {
	const pkg = {
		name: 'browser-sync',
		bin: './bin/browser-sync.js',
	};

	const cli = meow({
		importMeta,
		pkg,
	});

	t.is(pkg.bin, './bin/browser-sync.js');
	t.false(Object.hasOwn(pkg, 'version'));

	t.is(cli.pkg.bin['browser-sync'], './bin/browser-sync.js');
	t.is(pkg.version, '');
});

test('overriding pkg still normalizes', t => {
	const cli = meow({
		importMeta,
		pkg: {
			name: 'browser-sync',
			bin: './bin/browser-sync.js',
		},
	});

	t.like(cli, {
		pkg: {
			name: 'browser-sync',
			version: '',
		},
	});
});

test('process title - bin default', verifyPackage, {
	expected: 'foo',
});

test('process title - bin scoped', verifyPackage, {
	fixture: 'with-package-json/scoped-bin/fixture.js',
	expected: 'foo',
});

test('process title - bin custom', verifyPackage, {
	fixture: 'with-package-json/custom-bin/fixture.js',
	expected: 'bar',
});

test('process title - name backup', verifyPackage, {
	fixture: 'with-package-json/no-bin/fixture.js',
	expected: 'foo',
});
