/**
 * The one shape every fibz rule is declared in, and the one message format they share.
 *
 * Plain ESLint rule objects: no rule-authoring library, so the package keeps its promise of no
 * dependency outside the burgee family. ESLint is only ever the caller.
 */
import type { Rule } from 'eslint';

export const DOCS = 'https://github.com/ofri-peretz/burgee/tree/main/packages/fibz#rules';

/**
 * A finding's text: what is wrong, why it matters, and the fix — the shape an agent can act on
 * without opening the docs.
 */
export function message(issue: string, description: string, fix: string): string {
  return `${issue}: ${description}. fix: ${fix}`;
}

export interface RuleSpec {
  description: string;
  messages: Record<string, string>;
  hasSuggestions?: boolean;
  create: (context: Rule.RuleContext) => Rule.RuleListener;
}

export function defineRule(name: string, spec: RuleSpec): Rule.RuleModule {
  return {
    meta: {
      type: 'problem',
      docs: { description: spec.description, url: `${DOCS}-${name}` },
      messages: spec.messages,
      schema: [],
      ...(spec.hasSuggestions === true ? { hasSuggestions: true } : {}),
    },
    create: spec.create,
  };
}
