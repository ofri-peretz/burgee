import {supportsColor} from '../shim.js';

// A string, as `console.log` colorizes numbers when the environment forces color.
console.log(String(supportsColor ? supportsColor.level : 0));
