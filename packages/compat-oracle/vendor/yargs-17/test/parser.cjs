'use strict';
/* global it */

const yargs = require('../build/index.cjs');
const Parser = require('../shim-2.cjs');

require('chai').should();

it('should expose yargs-parser as Parser', () => {
  yargs.Parser.should.equal(Parser);
});
