# Top dependents of commander and yargs

Generated 2026-09-08 by `scripts/rank-dependents.ts` (intent `first-adopter`).

```sh
npm run rank:dependents -- --limit 500 --top 10000 --json
```

Candidates: 500 for commander, 500 for yargs, from the ecosyste.ms dependents feed (79,026 commander and 37,202 yargs rows scanned, shortlisted by its monthly download figure). The feed omits many well-known users outright, so the 10,000 most-downloaded packages on npm (floor: 4,169,038 downloads/month) were checked as well: the head of each table is complete down to roughly that rate, and below it only what the feed lists. Each candidate was confirmed against `registry.npmjs.org/<name>/latest`: only a package that lists the host under `dependencies` at its latest release is kept. Weekly downloads are `api.npmjs.org/downloads/point/last-week`.

Score = log10(weekly downloads) × host weight (commander 1, yargs 1.5). yargs users carry the larger open backlog (see `competitor-open-issues.md`), so they weigh more at equal downloads.

> api.npmjs.org failed 1 request(s) even after a retry; packages without a count are listed below.

## commander — top 50

| # | Package | Weekly downloads | Host | Range | Repository | Score |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `terser` | 71,759,152 | commander | `^2.20.0` | <https://github.com/terser/terser> | 7.86 |
| 2 | `sucrase` | 42,320,355 | commander | `^4.0.0` | <https://github.com/alangpierce/sucrase> | 7.63 |
| 3 | `svgo` | 33,933,051 | commander | `^11.1.0` | <https://github.com/svg/svgo> | 7.53 |
| 4 | `katex` | 22,466,395 | commander | `^15.0.0` | <https://github.com/KaTeX/KaTeX> | 7.35 |
| 5 | `d3-dsv` | 15,168,762 | commander | `7` | <https://github.com/d3/d3-dsv> | 7.18 |
| 6 | `html-minifier-terser` | 13,065,012 | commander | `^10.0.0` | <https://github.com/terser/html-minifier-terser> | 7.12 |
| 7 | `react-native` | 11,911,226 | commander | `^12.0.0` | <https://github.com/react/react-native> | 7.08 |
| 8 | `editorconfig` | 10,495,190 | commander | `^14.0.3` | <https://github.com/editorconfig/editorconfig-core-js> | 7.02 |
| 9 | `webpack-cli` | 10,040,828 | commander | `^14.0.3` | <https://github.com/webpack/webpack-cli> | 7.00 |
| 10 | `shadcn` | 8,742,877 | commander | `^14.0.0` | <https://github.com/shadcn-ui/ui> | 6.94 |
| 11 | `webpack-bundle-analyzer` | 8,731,877 | commander | `^14.0.2` | <https://github.com/webpack/webpack-bundle-analyzer> | 6.94 |
| 12 | `expo-modules-autolinking` | 8,315,537 | commander | `^7.2.0` | <https://github.com/expo/expo> | 6.92 |
| 13 | `seek-bzip` | 8,178,920 | commander | `^6.0.0` | <https://github.com/cscott/seek-bzip> | 6.91 |
| 14 | `@nestjs/cli` | 7,262,882 | commander | `15.0.0` | <https://github.com/nestjs/nest-cli> | 6.86 |
| 15 | `nearley` | 7,044,625 | commander | `^2.19.0` | <https://github.com/hardmath123/nearley> | 6.85 |
| 16 | `cypress` | 6,365,841 | commander | `^6.2.1` | <https://github.com/cypress-io/cypress> | 6.80 |
| 17 | `@solana/errors` | 6,159,056 | commander | `15.0.0` | <https://github.com/anza-xyz/kit> | 6.79 |
| 18 | `topojson-client` | 5,604,890 | commander | `2` | <https://github.com/topojson/topojson-client> | 6.75 |
| 19 | `xss` | 5,103,387 | commander | `^2.20.3` | <https://github.com/leizongmin/js-xss> | 6.71 |
| 20 | `@swc/cli` | 4,767,624 | commander | `^8.3.0` | <https://github.com/swc-project/pkgs> | 6.68 |
| 21 | `knex` | 4,595,237 | commander | `^10.0.0` | <https://github.com/knex/knex> | 6.66 |
| 22 | `precinct` | 4,268,781 | commander | `^14.0.3` | <https://github.com/dependents/node-precinct> | 6.63 |
| 23 | `wait-port` | 4,188,673 | commander | `^9.3.0` | <https://github.com/dwmkerr/wait-port> | 6.62 |
| 24 | `@hey-api/openapi-ts` | 4,136,937 | commander | `15.0.0` | <https://github.com/hey-api/hey-api> | 6.62 |
| 25 | `@capacitor/cli` | 4,031,622 | commander | `^12.1.0` | <https://github.com/ionic-team/capacitor> | 6.61 |
| 26 | `react-email` | 3,784,151 | commander | `^13.0.0` | <https://github.com/resend/react-email> | 6.58 |
| 27 | `@babel/cli` | 3,509,233 | commander | `^14.0.2` | <https://github.com/babel/babel> | 6.55 |
| 28 | `postject` | 3,441,284 | commander | `^9.4.0` | <https://github.com/nodejs/postject> | 6.54 |
| 29 | `filing-cabinet` | 3,410,941 | commander | `^14.0.3` | <https://github.com/dependents/node-filing-cabinet> | 6.53 |
| 30 | `sass-lookup` | 3,408,700 | commander | `^14.0.3` | <https://github.com/dependents/node-sass-lookup> | 6.53 |
| 31 | `dependency-tree` | 3,404,780 | commander | `^14.0.3` | <https://github.com/dependents/node-dependency-tree> | 6.53 |
| 32 | `dependency-cruiser` | 3,396,995 | commander | `15.0.0` | <https://github.com/sverweij/dependency-cruiser> | 6.53 |
| 33 | `module-lookup-amd` | 3,392,336 | commander | `^14.0.3` | <https://github.com/dependents/node-module-lookup-amd> | 6.53 |
| 34 | `openclaw` | 3,328,302 | commander | `15.0.0` | <https://github.com/openclaw/openclaw> | 6.52 |
| 35 | `find-process` | 3,286,452 | commander | `^14.0.3` | <https://github.com/yibn2008/find-process> | 6.52 |
| 36 | `nunjucks` | 3,124,629 | commander | `^5.1.0` | <https://github.com/mozilla/nunjucks> | 6.49 |
| 37 | `pm2` | 3,043,438 | commander | `2.15.1` | <https://github.com/Unitech/pm2> | 6.48 |
| 38 | `@module-federation/cli` | 3,038,109 | commander | `11.1.0` | <https://github.com/module-federation/core> | 6.48 |
| 39 | `mssql` | 2,962,721 | commander | `^11.0.0` | <https://github.com/tediousjs/node-mssql> | 6.47 |
| 40 | `juice` | 2,870,598 | commander | `^14.0.3` | <https://github.com/Automattic/juice> | 6.46 |
| 41 | `madge` | 2,638,451 | commander | `^7.2.0` | <https://github.com/pahen/madge> | 6.42 |
| 42 | `stylus-lookup` | 2,609,998 | commander | `^14.0.3` | <https://github.com/dependents/node-stylus-lookup> | 6.42 |
| 43 | `html-minifier` | 2,548,570 | commander | `^2.19.0` | <https://github.com/kangax/html-minifier> | 6.41 |
| 44 | `@stryker-mutator/core` | 2,399,420 | commander | `~14.0.0` | <https://github.com/stryker-mutator/stryker-js> | 6.38 |
| 45 | `figlet` | 2,364,231 | commander | `^14.0.0` | <https://github.com/patorjk/figlet.js> | 6.37 |
| 46 | `tsc-alias` | 2,350,985 | commander | `^9.0.0` | <https://github.com/justkey007/tsc-alias> | 6.37 |
| 47 | `@openclaw/crabline` | 2,207,725 | commander | `^15.0.0` | <https://github.com/openclaw/crabline> | 6.34 |
| 48 | `@react-native-community/cli` | 2,177,822 | commander | `^9.4.1` | <https://github.com/react-native-community/cli> | 6.34 |
| 49 | `d3-geo-projection` | 2,104,424 | commander | `7` | <https://github.com/d3/d3-geo-projection> | 6.32 |
| 50 | `firebase-tools` | 2,031,927 | commander | `^5.1.0` | <https://github.com/firebase/firebase-tools> | 6.31 |

## yargs — top 50

| # | Package | Weekly downloads | Host | Range | Repository | Score |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `@grpc/proto-loader` | 59,441,512 | yargs | `^17.7.2` | <https://github.com/grpc/grpc-node> | 11.66 |
| 2 | `jest-cli` | 32,012,196 | yargs | `^17.7.2` | <https://github.com/jestjs/jest> | 11.26 |
| 3 | `concurrently` | 18,722,891 | yargs | `18.0.0` | <https://github.com/open-cli-tools/concurrently> | 10.91 |
| 4 | `msw` | 18,604,750 | yargs | `^17.7.2` | <https://github.com/mswjs/msw> | 10.90 |
| 5 | `qrcode` | 17,661,484 | yargs | `^15.3.1` | <https://github.com/soldair/node-qrcode> | 10.87 |
| 6 | `@puppeteer/browsers` | 15,377,891 | yargs | `^18.0.0` | <https://github.com/puppeteer/puppeteer> | 10.78 |
| 7 | `@react-native/codegen` | 14,977,340 | yargs | `^17.6.2` | <https://github.com/react/react-native> | 10.76 |
| 8 | `metro` | 14,804,768 | yargs | `^17.6.2` | <https://github.com/react/metro> | 10.76 |
| 9 | `react-native` | 11,911,226 | yargs | `^17.6.2` | <https://github.com/react/react-native> | 10.61 |
| 10 | `nx` | 9,264,547 | yargs | `17.7.2` | <https://github.com/nrwl/nx> | 10.45 |
| 11 | `cli-highlight` | 7,964,926 | yargs | `^16.0.0` | <https://github.com/felixfbecker/cli-highlight> | 10.35 |
| 12 | `nyc` | 7,490,463 | yargs | `^15.0.2` | <https://github.com/istanbuljs/nyc> | 10.31 |
| 13 | `@commitlint/cli` | 7,029,148 | yargs | `^18.0.0` | <https://github.com/conventional-changelog/commitlint> | 10.27 |
| 14 | `rollup-plugin-visualizer` | 5,532,731 | yargs | `^18.1.0` | <https://github.com/btd/rollup-plugin-visualizer> | 10.11 |
| 15 | `@graphql-codegen/cli` | 4,907,339 | yargs | `^18.0.0` | <https://github.com/dotansimha/graphql-code-generator> | 10.04 |
| 16 | `@angular/compiler-cli` | 4,583,231 | yargs | `^18.0.0` | <https://github.com/angular/angular> | 9.99 |
| 17 | `typeorm` | 4,379,432 | yargs | `^18.0.0` | <https://github.com/typeorm/typeorm> | 9.96 |
| 18 | `swagger2openapi` | 3,937,947 | yargs | `^17.0.1` | <https://github.com/Mermade/oas-kit> | 9.89 |
| 19 | `oas-resolver` | 3,903,276 | yargs | `^17.0.1` | <https://github.com/Mermade/oas-kit> | 9.89 |
| 20 | `c8` | 3,690,387 | yargs | `^18.0.0` | <https://github.com/bcoe/c8> | 9.85 |
| 21 | `@angular/cli` | 3,643,896 | yargs | `18.1.0` | <https://github.com/angular/angular-cli> | 9.84 |
| 22 | `electron-builder` | 3,617,767 | yargs | `^17.6.2` | <https://github.com/electron-userland/electron-builder> | 9.84 |
| 23 | `lighthouse` | 3,142,431 | yargs | `^17.3.1` | <https://github.com/GoogleChrome/lighthouse> | 9.75 |
| 24 | `karma` | 2,947,929 | yargs | `^16.1.1` | <https://github.com/karma-runner/karma> | 9.70 |
| 25 | `@astrojs/check` | 2,748,679 | yargs | `^18.0.0` | <https://github.com/withastro/astro> | 9.66 |
| 26 | `node-edge-tts` | 2,678,251 | yargs | `^17.7.2` | <https://github.com/SchneeHertz/node-edge-tts> | 9.64 |
| 27 | `get-pkg-repo` | 2,300,840 | yargs | `^17.0.1` | <https://github.com/conventional-changelog/get-pkg-repo> | 9.54 |
| 28 | `semantic-release` | 2,099,730 | yargs | `^18.0.0` | <https://github.com/semantic-release/semantic-release> | 9.48 |
| 29 | `copyfiles` | 1,949,214 | yargs | `^16.1.0` | <https://github.com/calvinmetcalf/copyfiles> | 9.43 |
| 30 | `logkitty` | 1,921,877 | yargs | `^15.1.0` | <https://github.com/zamotany/logkitty> | 9.43 |
| 31 | `gulp-cli` | 1,668,052 | yargs | `^16.2.0` | <https://github.com/gulpjs/gulp-cli> | 9.33 |
| 32 | `depcheck` | 1,445,814 | yargs | `^16.2.0` | <https://github.com/depcheck/depcheck> | 9.24 |
| 33 | `lerna` | 1,362,308 | yargs | `17.7.2` | <https://github.com/lerna/lerna> | 9.20 |
| 34 | `@stoplight/spectral-cli` | 1,361,192 | yargs | `~17.7.2` | <https://github.com/stoplightio/spectral> | 9.20 |
| 35 | `mjml-cli` | 1,310,971 | yargs | `^17.7.2` | <https://github.com/mjmlio/mjml> | 9.18 |
| 36 | `source-map-explorer` | 1,266,938 | yargs | `^16.2.0` | <https://github.com/danvk/source-map-explorer> | 9.15 |
| 37 | `@angular/localize` | 1,211,363 | yargs | `^18.0.0` | <https://github.com/angular/angular> | 9.12 |
| 38 | `mochawesome-report-generator` | 1,206,954 | yargs | `^17.2.1` | <https://github.com/adamgruber/mochawesome-report-generator> | 9.12 |
| 39 | `@appium/docutils` | 1,161,820 | yargs | `18.1.0` | <https://github.com/appium/appium> | 9.10 |
| 40 | `@opennextjs/cloudflare` | 1,159,356 | yargs | `^18.0.0` | <https://github.com/opennextjs/opennextjs-cloudflare> | 9.10 |
| 41 | `@lhci/cli` | 1,121,720 | yargs | `^15.4.1` | <https://github.com/GoogleChrome/lighthouse-ci> | 9.07 |
| 42 | `postcss-cli` | 1,058,425 | yargs | `^18.0.0` | <https://github.com/postcss/postcss-cli> | 9.04 |
| 43 | `replace-in-file` | 1,006,510 | yargs | `^18.1.0` | <https://github.com/adamreisnz/replace-in-file> | 9.00 |
| 44 | `@lerna/create` | 994,783 | yargs | `17.7.2` | <https://github.com/lerna/lerna> | 9.00 |
| 45 | `nconf` | 987,475 | yargs | `^16.1.1` | <https://github.com/flatiron/nconf> | 8.99 |
| 46 | `sequelize-cli` | 924,655 | yargs | `^16.2.0` | <https://github.com/sequelize/cli> | 8.95 |
| 47 | `google-artifactregistry-auth` | 888,338 | yargs | `^17.1.1` | <https://github.com/GoogleCloudPlatform/artifact-registry-npm-tools> | 8.92 |
| 48 | `@openapi-contrib/openapi-schema-to-json-schema` | 873,044 | yargs | `^17.7.2` | <https://github.com/openapi-contrib/openapi-schema-to-json-schema> | 8.91 |
| 49 | `sass-graph` | 848,384 | yargs | `^17.2.1` | <https://github.com/xzyfer/sass-graph> | 8.89 |
| 50 | `mochawesome-merge` | 822,478 | yargs | `^17.7.2` | <https://github.com/Antontelesh/mochawesome-merge> | 8.87 |

## Could not determine

10071 candidate(s) listed by the source do not name commander or yargs under `dependencies` at their latest release (devDependencies, peer, or dropped) and were excluded. 6 could not be checked:

- `@applitools/test-server`: no latest release on registry.npmjs.org (unpublished or deprecated)
- `@contenthook/node`: no latest release on registry.npmjs.org (unpublished or deprecated)
- `contenthook`: no latest release on registry.npmjs.org (unpublished or deprecated)
- `@contenthook/browser`: no latest release on registry.npmjs.org (unpublished or deprecated)
- `@contenthook/cli`: no latest release on registry.npmjs.org (unpublished or deprecated)
- `@testim/testim-cli`: no weekly download count from api.npmjs.org
