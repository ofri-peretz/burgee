/**
 * The MDX components every docs page renders with: fumadocs' defaults, the family's own, and
 * anything a call overrides. `<CapabilityMatrix pkg="…" />` is here rather than imported per
 * page, so a package site's "Why" page is one line of MDX.
 *
 * `pre` hands a fence `source-config.mjs` marked as a terminal (`data-terminal`, a `text` fence
 * whose title is the command) to {@link TerminalBlock}; every other fence renders as fumadocs
 * renders it.
 */
import { Pre } from 'fumadocs-ui/components/codeblock';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { type MDXComponents } from 'mdx/types';
import { type ComponentProps } from 'react';

import { CapabilityMatrix } from './capability-matrix';
import { TerminalBlock } from './terminal-block';

type FenceProps = ComponentProps<'pre'> & { readonly 'data-terminal'?: string };

function pre(props: FenceProps) {
  const { title, children } = props;
  if (props['data-terminal'] === undefined || typeof title !== 'string') return defaultMdxComponents.pre(props);
  return (
    <TerminalBlock command={title}>
      <Pre>{children}</Pre>
    </TerminalBlock>
  );
}

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return { ...defaultMdxComponents, pre, CapabilityMatrix, ...components };
}
