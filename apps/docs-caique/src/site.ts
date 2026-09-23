import { defineSite } from 'docs-chassis/site';

import manifest from '../../../packages/caique/package.json';

/** This app's row in `.github/vercel-apps.json`, and the package it documents. */
export const site = defineSite('caique', manifest);
