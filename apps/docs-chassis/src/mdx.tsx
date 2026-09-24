/** The MDX components every docs page renders with: fumadocs' defaults, overridable per call. */
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { type MDXComponents } from 'mdx/types';

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return { ...defaultMdxComponents, ...components };
}
