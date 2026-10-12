import test from 'ava';
import widestLine from './shim.js';

test('main', t => {
	t.is(widestLine('a'), 1);
	t.is(widestLine('a\nbe'), 2);
	t.is(widestLine('古\n\u001B[1m@\u001B[22m'), 2);
});
