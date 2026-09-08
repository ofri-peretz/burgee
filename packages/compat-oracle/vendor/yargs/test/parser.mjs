'use strict';
/* global it */

import {Parser} from '../shim-1.js';
import * as parser from '../shim-2.js';
import {should} from 'chai';

should();

it('should expose yargs-parser as Parser', () => {
  Parser.should.equal(parser.default);
});
