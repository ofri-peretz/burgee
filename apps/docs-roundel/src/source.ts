import { createSource } from 'docs-chassis/source';
import { docs } from 'fumadocs-mdx:collections/server';

export const source = createSource(docs);
