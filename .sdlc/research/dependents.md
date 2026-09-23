# Top dependents of commander and yargs

Generated 2026-09-23 by `scripts/rank-dependents.ts` (intent `first-adopter`).

```sh
npm run rank:dependents -- --limit 500 --top 10000 --json
```

Candidates: 500 for commander, 500 for yargs, from the ecosyste.ms dependents feed (79,001 commander and 37,183 yargs rows scanned, shortlisted by its monthly download figure). The feed omits many well-known users outright, so the 10,000 most-downloaded packages on npm (floor: 3,992,862 downloads/month) were checked as well: the head of each table is complete down to roughly that rate, and below it only what the feed lists. Each candidate was confirmed against `registry.npmjs.org/<name>/latest`: only a package that lists the host under `dependencies` at its latest release is kept. Weekly downloads are `api.npmjs.org/downloads/point/last-week`.

Score = log10(weekly downloads) × host weight (commander 1, yargs 1.5). yargs users carry the larger open backlog (see `competitor-open-issues.md`), so they weigh more at equal downloads.

## commander — top 50

| # | Package | Weekly downloads | Host | Range | Repository | Score |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `terser` | 61,735,239 | commander | `^2.20.0` | <https://github.com/terser/terser> | 7.79 |
| 2 | `sucrase` | 35,632,108 | commander | `^4.0.0` | <https://github.com/alangpierce/sucrase> | 7.55 |
| 3 | `svgo` | 31,363,506 | commander | `^11.1.0` | <https://github.com/svg/svgo> | 7.50 |
| 4 | `katex` | 18,821,385 | commander | `^15.0.0` | <https://github.com/KaTeX/KaTeX> | 7.27 |
| 5 | `html-minifier-terser` | 15,840,915 | commander | `^10.0.0` | <https://github.com/terser/html-minifier-terser> | 7.20 |
| 6 | `d3-dsv` | 15,807,552 | commander | `7` | <https://github.com/d3/d3-dsv> | 7.20 |
| 7 | `react-native` | 9,743,087 | commander | `^12.0.0` | <https://github.com/react/react-native> | 6.99 |
| 8 | `webpack-bundle-analyzer` | 9,245,804 | commander | `^14.0.2` | <https://github.com/webpack/webpack-bundle-analyzer> | 6.97 |
| 9 | `editorconfig` | 8,527,407 | commander | `^14.0.3` | <https://github.com/editorconfig/editorconfig-core-js> | 6.93 |
| 10 | `webpack-cli` | 8,361,332 | commander | `^14.0.3` | <https://github.com/webpack/webpack-cli> | 6.92 |
| 11 | `expo-modules-autolinking` | 6,759,516 | commander | `^7.2.0` | <https://github.com/expo/expo> | 6.83 |
| 12 | `shadcn` | 6,740,699 | commander | `^14.0.0` | <https://github.com/shadcn-ui/ui> | 6.83 |
| 13 | `seek-bzip` | 6,655,855 | commander | `^6.0.0` | <https://github.com/cscott/seek-bzip> | 6.82 |
| 14 | `@solana/errors` | 6,241,158 | commander | `15.0.0` | <https://github.com/anza-xyz/kit> | 6.80 |
| 15 | `nearley` | 5,770,549 | commander | `^2.19.0` | <https://github.com/hardmath123/nearley> | 6.76 |
| 16 | `@nestjs/cli` | 5,635,797 | commander | `15.0.0` | <https://github.com/nestjs/nest-cli> | 6.75 |
| 17 | `topojson-client` | 4,667,062 | commander | `2` | <https://github.com/topojson/topojson-client> | 6.67 |
| 18 | `cypress` | 4,649,846 | commander | `^6.2.1` | <https://github.com/cypress-io/cypress> | 6.67 |
| 19 | `xss` | 4,178,752 | commander | `^2.20.3` | <https://github.com/leizongmin/js-xss> | 6.62 |
| 20 | `@swc/cli` | 3,739,941 | commander | `^8.3.0` | <https://github.com/swc-project/pkgs> | 6.57 |
| 21 | `knex` | 3,701,130 | commander | `^10.0.0` | <https://github.com/knex/knex> | 6.57 |
| 22 | `@hey-api/openapi-ts` | 3,373,199 | commander | `15.0.0` | <https://github.com/hey-api/hey-api> | 6.53 |
| 23 | `precinct` | 3,321,615 | commander | `^14.0.3` | <https://github.com/dependents/node-precinct> | 6.52 |
| 24 | `@capacitor/cli` | 3,302,072 | commander | `^12.1.0` | <https://github.com/ionic-team/capacitor> | 6.52 |
| 25 | `postject` | 3,260,704 | commander | `^9.4.0` | <https://github.com/nodejs/postject> | 6.51 |
| 26 | `wait-port` | 3,245,370 | commander | `^9.3.0` | <https://github.com/dwmkerr/wait-port> | 6.51 |
| 27 | `@babel/cli` | 3,058,316 | commander | `^14.0.2` | <https://github.com/babel/babel> | 6.49 |
| 28 | `html-minifier` | 3,032,920 | commander | `^2.19.0` | <https://github.com/kangax/html-minifier> | 6.48 |
| 29 | `react-email` | 3,032,112 | commander | `^13.0.0` | <https://github.com/resend/react-email> | 6.48 |
| 30 | `dependency-cruiser` | 2,874,211 | commander | `15.0.0` | <https://github.com/sverweij/dependency-cruiser> | 6.46 |
| 31 | `pm2` | 2,587,010 | commander | `2.15.1` | <https://github.com/Unitech/pm2> | 6.41 |
| 32 | `filing-cabinet` | 2,567,501 | commander | `^14.0.3` | <https://github.com/dependents/node-filing-cabinet> | 6.41 |
| 33 | `sass-lookup` | 2,567,470 | commander | `^14.0.3` | <https://github.com/dependents/node-sass-lookup> | 6.41 |
| 34 | `nunjucks` | 2,565,747 | commander | `^5.1.0` | <https://github.com/mozilla/nunjucks> | 6.41 |
| 35 | `module-lookup-amd` | 2,559,259 | commander | `^14.0.3` | <https://github.com/dependents/node-module-lookup-amd> | 6.41 |
| 36 | `dependency-tree` | 2,559,001 | commander | `^14.0.3` | <https://github.com/dependents/node-dependency-tree> | 6.41 |
| 37 | `stylus-lookup` | 2,556,245 | commander | `^14.0.3` | <https://github.com/dependents/node-stylus-lookup> | 6.41 |
| 38 | `openclaw` | 2,489,212 | commander | `15.0.0` | <https://github.com/openclaw/openclaw> | 6.40 |
| 39 | `@react-native-community/cli` | 2,446,038 | commander | `^9.4.1` | <https://github.com/react-native-community/cli> | 6.39 |
| 40 | `find-process` | 2,374,582 | commander | `^14.0.3` | <https://github.com/yibn2008/find-process> | 6.38 |
| 41 | `tsc-alias` | 2,349,771 | commander | `^9.0.0` | <https://github.com/justkey007/tsc-alias> | 6.37 |
| 42 | `juice` | 2,256,227 | commander | `^14.0.3` | <https://github.com/Automattic/juice> | 6.35 |
| 43 | `@module-federation/cli` | 2,225,347 | commander | `11.1.0` | <https://github.com/module-federation/core> | 6.35 |
| 44 | `firebase-tools` | 2,149,486 | commander | `^5.1.0` | <https://github.com/firebase/firebase-tools> | 6.33 |
| 45 | `mssql` | 2,145,247 | commander | `^11.0.0` | <https://github.com/tediousjs/node-mssql> | 6.33 |
| 46 | `madge` | 1,962,724 | commander | `^7.2.0` | <https://github.com/pahen/madge> | 6.29 |
| 47 | `jayson` | 1,924,416 | commander | `^2.20.3` | <https://github.com/tedeh/jayson> | 6.28 |
| 48 | `superstatic` | 1,858,592 | commander | `^10.0.0` | <https://github.com/firebase/superstatic> | 6.27 |
| 49 | `@stryker-mutator/core` | 1,771,506 | commander | `~14.0.0` | <https://github.com/stryker-mutator/stryker-js> | 6.25 |
| 50 | `@cucumber/gherkin-utils` | 1,736,831 | commander | `15.0.0` | <https://github.com/cucumber/gherkin-utils> | 6.24 |

## yargs — top 50

| # | Package | Weekly downloads | Host | Range | Repository | Score |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `@grpc/proto-loader` | 48,422,708 | yargs | `^17.7.2` | <https://github.com/grpc/grpc-node> | 11.53 |
| 2 | `jest-cli` | 34,997,442 | yargs | `^17.7.2` | <https://github.com/jestjs/jest> | 11.32 |
| 3 | `qrcode` | 19,006,309 | yargs | `^15.3.1` | <https://github.com/soldair/node-qrcode> | 10.92 |
| 4 | `concurrently` | 15,783,555 | yargs | `18.0.0` | <https://github.com/open-cli-tools/concurrently> | 10.80 |
| 5 | `@puppeteer/browsers` | 15,437,905 | yargs | `^18.0.0` | <https://github.com/puppeteer/puppeteer> | 10.78 |
| 6 | `msw` | 14,417,590 | yargs | `^17.7.2` | <https://github.com/mswjs/msw> | 10.74 |
| 7 | `metro` | 12,797,725 | yargs | `^17.6.2` | <https://github.com/react/metro> | 10.66 |
| 8 | `@react-native/codegen` | 12,222,741 | yargs | `^17.6.2` | <https://github.com/react/react-native> | 10.63 |
| 9 | `react-native` | 9,743,087 | yargs | `^17.6.2` | <https://github.com/react/react-native> | 10.48 |
| 10 | `@commitlint/cli` | 7,292,246 | yargs | `^18.0.0` | <https://github.com/conventional-changelog/commitlint> | 10.29 |
| 11 | `nx` | 7,070,032 | yargs | `17.7.2` | <https://github.com/nrwl/nx> | 10.27 |
| 12 | `cli-highlight` | 6,731,841 | yargs | `^16.0.0` | <https://github.com/felixfbecker/cli-highlight> | 10.24 |
| 13 | `nyc` | 6,129,332 | yargs | `^15.0.2` | <https://github.com/istanbuljs/nyc> | 10.18 |
| 14 | `rollup-plugin-visualizer` | 5,538,535 | yargs | `^18.1.0` | <https://github.com/btd/rollup-plugin-visualizer> | 10.12 |
| 15 | `@graphql-codegen/cli` | 5,069,422 | yargs | `^18.0.0` | <https://github.com/dotansimha/graphql-code-generator> | 10.06 |
| 16 | `@angular/cli` | 4,379,524 | yargs | `18.1.0` | <https://github.com/angular/angular-cli> | 9.96 |
| 17 | `@angular/compiler-cli` | 4,331,754 | yargs | `^18.0.0` | <https://github.com/angular/angular> | 9.95 |
| 18 | `electron-builder` | 3,575,848 | yargs | `^17.6.2` | <https://github.com/electron-userland/electron-builder> | 9.83 |
| 19 | `typeorm` | 3,557,322 | yargs | `^18.0.0` | <https://github.com/typeorm/typeorm> | 9.83 |
| 20 | `c8` | 3,174,576 | yargs | `^18.0.0` | <https://github.com/bcoe/c8> | 9.75 |
| 21 | `lighthouse` | 3,139,788 | yargs | `^17.3.1` | <https://github.com/GoogleChrome/lighthouse> | 9.75 |
| 22 | `swagger2openapi` | 3,022,661 | yargs | `^17.0.1` | <https://github.com/Mermade/oas-kit> | 9.72 |
| 23 | `karma` | 3,004,290 | yargs | `^16.1.1` | <https://github.com/karma-runner/karma> | 9.72 |
| 24 | `oas-resolver` | 2,994,676 | yargs | `^17.0.1` | <https://github.com/Mermade/oas-kit> | 9.71 |
| 25 | `get-pkg-repo` | 2,509,710 | yargs | `^17.0.1` | <https://github.com/conventional-changelog/get-pkg-repo> | 9.60 |
| 26 | `@astrojs/check` | 2,297,578 | yargs | `^18.0.0` | <https://github.com/withastro/astro> | 9.54 |
| 27 | `semantic-release` | 2,188,403 | yargs | `^18.0.0` | <https://github.com/semantic-release/semantic-release> | 9.51 |
| 28 | `logkitty` | 2,134,358 | yargs | `^15.1.0` | <https://github.com/zamotany/logkitty> | 9.49 |
| 29 | `copyfiles` | 1,719,797 | yargs | `^16.1.0` | <https://github.com/calvinmetcalf/copyfiles> | 9.35 |
| 30 | `lerna` | 1,448,078 | yargs | `17.7.2` | <https://github.com/lerna/lerna> | 9.24 |
| 31 | `sass-graph` | 1,380,081 | yargs | `^17.2.1` | <https://github.com/xzyfer/sass-graph> | 9.21 |
| 32 | `mjml-cli` | 1,357,350 | yargs | `^17.7.2` | <https://github.com/mjmlio/mjml> | 9.20 |
| 33 | `node-edge-tts` | 1,336,107 | yargs | `^17.7.2` | <https://github.com/SchneeHertz/node-edge-tts> | 9.19 |
| 34 | `gulp-cli` | 1,289,706 | yargs | `^16.2.0` | <https://github.com/gulpjs/gulp-cli> | 9.17 |
| 35 | `depcheck` | 1,203,915 | yargs | `^16.2.0` | <https://github.com/depcheck/depcheck> | 9.12 |
| 36 | `replace-in-file` | 1,186,866 | yargs | `^18.1.0` | <https://github.com/adamreisnz/replace-in-file> | 9.11 |
| 37 | `@stoplight/spectral-cli` | 1,153,225 | yargs | `~17.7.2` | <https://github.com/stoplightio/spectral> | 9.09 |
| 38 | `@lerna/create` | 1,080,578 | yargs | `17.7.2` | <https://github.com/lerna/lerna> | 9.05 |
| 39 | `source-map-explorer` | 1,047,030 | yargs | `^16.2.0` | <https://github.com/danvk/source-map-explorer> | 9.03 |
| 40 | `@lhci/cli` | 1,036,369 | yargs | `^15.4.1` | <https://github.com/GoogleChrome/lighthouse-ci> | 9.02 |
| 41 | `@angular/localize` | 1,015,136 | yargs | `^18.0.0` | <https://github.com/angular/angular> | 9.01 |
| 42 | `mochawesome-report-generator` | 980,361 | yargs | `^17.2.1` | <https://github.com/adamgruber/mochawesome-report-generator> | 8.99 |
| 43 | `@opennextjs/cloudflare` | 950,270 | yargs | `^18.0.0` | <https://github.com/opennextjs/opennextjs-cloudflare> | 8.97 |
| 44 | `@appium/docutils` | 932,977 | yargs | `18.1.0` | <https://github.com/appium/appium> | 8.95 |
| 45 | `postcss-cli` | 886,359 | yargs | `^18.0.0` | <https://github.com/postcss/postcss-cli> | 8.92 |
| 46 | `web-component-analyzer` | 793,391 | yargs | `^17.7.2` | <https://github.com/runem/web-component-analyzer> | 8.85 |
| 47 | `@openapi-contrib/openapi-schema-to-json-schema` | 737,840 | yargs | `^17.7.2` | <https://github.com/openapi-contrib/openapi-schema-to-json-schema> | 8.80 |
| 48 | `sequelize-cli` | 702,081 | yargs | `^16.2.0` | <https://github.com/sequelize/cli> | 8.77 |
| 49 | `protractor` | 700,566 | yargs | `^15.3.1` | <https://github.com/angular/protractor> | 8.77 |
| 50 | `mochawesome-merge` | 657,831 | yargs | `^17.7.2` | <https://github.com/Antontelesh/mochawesome-merge> | 8.73 |

## Could not determine

10077 candidate(s) listed by the source do not name commander or yargs under `dependencies` at their latest release (devDependencies, peer, or dropped) and were excluded. 5 could not be checked:

- `@applitools/test-server`: no latest release on registry.npmjs.org (unpublished or deprecated)
- `@contenthook/node`: no latest release on registry.npmjs.org (unpublished or deprecated)
- `contenthook`: no latest release on registry.npmjs.org (unpublished or deprecated)
- `@contenthook/browser`: no latest release on registry.npmjs.org (unpublished or deprecated)
- `@contenthook/cli`: no latest release on registry.npmjs.org (unpublished or deprecated)
