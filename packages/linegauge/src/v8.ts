/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * `linegauge/v8` — string-width 8.3.0's drop-in, for a project pinned to `string-width@8`.
 *
 * The root follows string-width 9. Version 8 is still what slice-ansi 10, wrap-ansi 10,
 * cli-truncate 6, widest-line 6, boxen 9 and ink 8 resolve, and it differs from 9 on clusters
 * a terminal draws differently: a lone regional indicator, a run of Hangul jamo, an Indic
 * conjunct, a stray skin-tone modifier, a wide emoji with `U+FE0E`. Graded by 8.3.0's own suite
 * (`string-width-8`), and the measurement `slice`, `wrap`, `truncate` and `widest` use
 * (D-20261113-string-width-9).
 */
// eslint-disable-next-line import-next/no-default-export -- string-width 8's own suite imports a default; this is the drop-in surface, not a style choice.
export { lineCount, measure, width, width as default, type WidthOptions, type WidthOptions as Options } from './width.js';
