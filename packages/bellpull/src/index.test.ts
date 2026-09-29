/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The root entry is the package's one public surface — this is what it carries.
 *
 * Every other suite imports the module it tests, so nothing loaded `index.ts` itself: a name
 * dropped from its one export statement, or the `cross-spawn` drop-in added to it, would have
 * shipped with every suite green. The list is written out, so either change is a diff here.
 */
import { describe, expect, it } from 'vitest';

import { run } from './run.js';
import { whichSync } from './which.js';

const bellpull = await import('./index.js');

describe('the root entry', () => {
  it('exports exactly the surface its header describes', () => {
    expect(Object.keys(bellpull).sort()).toEqual([
      'DEFAULT_GRACE',
      'DEFAULT_TIMEOUT',
      'NotFoundError',
      'SpawnError',
      'ambientRuntime',
      'escapeArgument',
      'escapeCommand',
      'extensionCandidates',
      'format',
      'isWindows',
      'name',
      'pathDelimiter',
      'pathExtensions',
      'pathKey',
      'pathOf',
      'readShebang',
      'resolveExecutable',
      'run',
      'runPath',
      'searchPath',
      'shebangCommand',
      'toEvent',
      'toJson',
      'whichAllSync',
      'whichOrThrowSync',
      'whichSync',
    ]);
  });

  it('keeps the name it was reserved under, so nothing that read it breaks', () => {
    expect(bellpull.name).toBe('bellpull');
  });

  it('re-exports the modules’ own bindings, not copies', () => {
    expect(bellpull.run).toBe(run);
    expect(bellpull.whichSync).toBe(whichSync);
  });
});
