# Third-party material shipped in this package

flagstaff has one runtime dependency (`roundel`) and writes its own code. Two things in
the tarball are not ours, and are here with their licence.

## `dist/spinners.json` — cli-spinners

The spinner corpus reached through `flagstaff/ora` is `spinners.json` from
[cli-spinners](https://github.com/sindresorhus/cli-spinners) 3.2.0, unedited. It is data,
not code: `flagstaff/ora` re-exports it as `spinners` because ora does, and ora's own test
suite reads it. Nothing else in the package loads it — the core (`flagstaff`,
`flagstaff/loop`, `flagstaff/plugin`, `flagstaff/spinner`) ships two spinners of its own
and a lock that fails if any entry reaches this file.

> MIT License
>
> Copyright (c) Sindre Sorhus \<sindresorhus@gmail.com\> (https://sindresorhus.com)
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this
> software and associated documentation files (the "Software"), to deal in the Software
> without restriction, including without limitation the rights to use, copy, modify,
> merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
> permit persons to whom the Software is furnished to do so, subject to the following
> conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or
> substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
> INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
> PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
> LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT
> OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
> OTHER DEALINGS IN THE SOFTWARE.

## The East Asian Width ranges in `dist/width.js`

The `WIDE` table is derived from the Unicode Character Database's `EastAsianWidth.txt`
(Unicode 17), the same derivation `get-east-asian-width` publishes. The Unicode data files
are distributed under the [Unicode licence](https://www.unicode.org/license.txt), which
permits redistribution of derived data with the notice above kept.

Neither package is a dependency: nothing is installed, and both are here as data compiled
into the build.
