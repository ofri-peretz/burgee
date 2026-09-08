import test from 'ava';
import chalk, {Chalk} from '../shim.js';

chalk.level = 1;

test('create an isolated context where colors can be disabled (by level)', t => {
	const instance = new Chalk({level: 0});
	t.is(instance.red('foo'), 'foo');
	t.is(chalk.red('foo'), '\u{1B}[31mfoo\u{1B}[39m');
	instance.level = 2;
	t.is(instance.red('foo'), '\u{1B}[31mfoo\u{1B}[39m');
});

test('the `level` option should be a number from 0 to 3', t => {
	/* eslint-disable no-new -- Ignore */
	t.throws(() => {
		new Chalk({level: 10});
	}, {message: /should be an integer from 0 to 3/v});

	t.throws(() => {
		new Chalk({level: -1});
	}, {message: /should be an integer from 0 to 3/v});
	/* eslint-enable no-new */
});

test('an omitted `level` option is detected rather than rejected', t => {
	t.is(new Chalk({level: undefined}).level, new Chalk().level);
});

test('assigning `level` is validated', t => {
	const instance = new Chalk({level: 1});

	// Unlike the option, `undefined` is not a way to ask for detection here
	for (const level of [10, -1, 1.5, ' 1', undefined]) {
		t.throws(() => {
			instance.level = level;
		}, {message: /should be an integer from 0 to 3/v}, `level: ${level}`);
	}

	// A style in the chain writes through to the instance, so it is validated too
	t.throws(() => {
		instance.red.level = 10;
	}, {message: /should be an integer from 0 to 3/v});

	t.is(instance.level, 1);

	instance.level = 0;
	t.is(instance.level, 0);
	t.is(instance.red('foo'), 'foo');
});

test('a cached model style keeps following the level', t => {
	const instance = new Chalk({level: 3});

	// Reading it once installs the cached function on the instance
	t.is(instance.rgb, instance.rgb);
	t.is(instance.rgb(255, 0, 0)('foo'), '\u{1B}[38;2;255;0;0mfoo\u{1B}[39m');

	instance.level = 1;
	t.is(instance.rgb(255, 0, 0)('foo'), '\u{1B}[91mfoo\u{1B}[39m');

	instance.level = 0;
	t.is(instance.rgb(255, 0, 0)('foo'), 'foo');
});

test('a model style cached on a style in the chain keeps following the level', t => {
	const instance = new Chalk({level: 3});
	const {bold} = instance;

	// The cache is installed on the builder here, not on the instance
	t.is(bold.rgb, bold.rgb);
	t.is(bold.rgb(255, 0, 0)('foo'), '\u{1B}[1m\u{1B}[38;2;255;0;0mfoo\u{1B}[39m\u{1B}[22m');

	instance.level = 1;
	t.is(bold.rgb(255, 0, 0)('foo'), '\u{1B}[1m\u{1B}[91mfoo\u{1B}[39m\u{1B}[22m');
});

test('a deep chain reads the level from the instance it started on', t => {
	const instance = new Chalk({level: 1});
	const chain = instance.red.bold.underline;

	t.is(chain.level, 1);

	instance.level = 0;
	t.is(chain.level, 0);
	t.is(chain('foo'), 'foo');

	// Writing through the chain reaches the instance, however deep
	chain.level = 2;
	t.is(instance.level, 2);
});
