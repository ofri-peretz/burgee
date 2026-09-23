import { defineSite } from 'docs-chassis/site';

import manifest from '../../../packages/linegauge/package.json';

/** This app's row in `.github/vercel-apps.json`, and the package it documents. */
export const site = defineSite('linegauge', manifest);
