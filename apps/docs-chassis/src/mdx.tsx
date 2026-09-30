/**
 * The MDX components every docs page renders with: fumadocs' defaults, the family's own, and
 * anything a call overrides. `<CapabilityMatrix pkg="…" />` is here rather than imported per
 * page, so a package site's "Why" page is one line of MDX.
 */
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { type MDXComponents } from 'mdx/types';

import { CapabilityMatrix } from './capability-matrix';

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return { ...defaultMdxComponents, CapabilityMatrix, ...components };
}
