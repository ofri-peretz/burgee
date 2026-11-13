/**
 * The printer: the text TypeScript's own printer gives for the node shapes openapi-typescript
 * builds. Four-space indentation, one member per line, tuples one element per line, and
 * parentheses exactly where the compiler's factory inserts them.
 */
import {
  type EnumMember,
  type ListNode,
  type Member,
  type Statement,
  type TypeNode,
  type ValuesStatement,
  type WrapNode,
} from './gen-ts-ast.js';
import { quote } from './gen-ts-text.js';

const INDENT = '    ';
const TAB_STOP = INDENT.length;

const pad = (level: number): string => INDENT.repeat(level);

// The printer splits a comment on every line terminator the scanner knows.
const COMMENT_LINE = /\r\n|[\r\n\u2028\u2029]/;
// From the first character that is not blank to the printer: what is left is the line's indentation.
const TEXT_ONWARDS = /[^ \t\v\f\u0085\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF][^]*$/;

/** The width of a line's leading whitespace, a tab reaching the next four-column stop. */
const leadingWidth = (line: string): number => {
  let width = 0;
  for (const unit of line.replace(TEXT_ONWARDS, '')) {
    width += unit === '\t' ? TAB_STOP - (width % TAB_STOP) : 1;
  }
  return width;
};

/**
 * A block comment, re-indented the way the printer does it: the first line where the writer
 * stands, every later line at the writer's indentation plus its own leading whitespace, each
 * trimmed.
 */
const blockComment = (text: string, level: number): string => {
  const [first = '', ...others] = `/*${text}*/`.split(COMMENT_LINE);
  const moved = others.map((line) => ' '.repeat(level * TAB_STOP + leadingWidth(line)) + line.trim());
  return [pad(level) + first.trim(), ...moved].join('\n');
};

type Printer = (type: TypeNode, level: number) => string;

const LIST_KINDS: ReadonlySet<string> = new Set(['union', 'intersection']);
const POSTFIX_OPERAND_KINDS: ReadonlySet<string> = new Set(['union', 'intersection', 'readonly']);

const parenthesised = (type: TypeNode, level: number, kinds: ReadonlySet<string>): string => {
  const text = printType(type, level);
  return kinds.has(type.kind) ? `(${text})` : text;
};

const printList: Printer = (type, level) => {
  const { kind, types } = type as ListNode;
  if (kind === 'tuple') {
    const elements = types.map((element) => `${pad(level + 1)}${printType(element, level + 1)}`);
    return `[\n${elements.join(',\n')}${elements.length > 0 ? '\n' : ''}${pad(level)}]`;
  }
  return types.map((member) => parenthesised(member, level, LIST_KINDS)).join(kind === 'union' ? ' | ' : ' & ');
};

const printWrap: Printer = (type, level) => {
  const { kind, type: inner } = type as WrapNode;
  if (kind === 'array') return `${parenthesised(inner, level, POSTFIX_OPERAND_KINDS)}[]`;
  if (kind === 'readonly') return `readonly ${parenthesised(inner, level, POSTFIX_OPERAND_KINDS)}`;
  return `...${printType(inner, level)}`;
};

/** One member of a type literal or interface, with its comment, indented to `level`. */
export const printMember = (member: Member, level: number): string => {
  const modifier = member.readonly ? 'readonly ' : '';
  const type = printType(member.type, level);
  if (member.kind === 'index') {
    return `${pad(level)}${modifier}[${member.parameter}: ${member.parameterType}]: ${type};`;
  }
  const comment = member.comment === undefined ? '' : `${blockComment(member.comment, level)}\n`;
  return `${comment}${pad(level)}${modifier}${member.name}${member.optional ? '?' : ''}: ${type};`;
};

const printMembers = (members: readonly Member[], level: number): string =>
  members.map((member) => `${printMember(member, level + 1)}\n`).join('');

const PRINTERS: Readonly<Record<TypeNode['kind'], Printer>> = {
  keyword: (type) => (type as { name: string }).name,
  literal: (type) => (type as { text: string }).text,
  raw: (type) => (type as { text: string }).text,
  union: printList,
  intersection: printList,
  tuple: printList,
  array: printWrap,
  readonly: printWrap,
  rest: printWrap,
  object: (type, level) => {
    const { members } = type as { members: readonly Member[] };
    return members.length === 0 ? '{}' : `{\n${printMembers(members, level)}${pad(level)}}`;
  },
  reference: (type, level) => {
    const { name, args } = type as { name: string; args: readonly TypeNode[] };
    return args.length === 0 ? name : `${name}<${args.map((arg) => printType(arg, level)).join(', ')}>`;
  },
  access: (type, level) => {
    const { type: target, index } = type as { type: TypeNode; index: string };
    return `${parenthesised(target, level, POSTFIX_OPERAND_KINDS)}[${index}]`;
  },
};

/** A type, its continuation lines indented to `level`. The first line carries no indentation. */
export function printType(type: TypeNode, level: number): string {
  return PRINTERS[type.kind](type, level);
}

const printValue = (value: string | number): string => (typeof value === 'number' ? String(value) : quote(value));

const printEnumMember = (member: EnumMember): string => {
  const comment = member.comment === undefined ? '' : `${INDENT}//${member.comment}\n`;
  return `${comment}${INDENT}${member.name} = ${printValue(member.value)}`;
};

const printValues = (statement: ValuesStatement): string => {
  const values = statement.values.map((value) => printValue(value)).join(', ');
  return `export const ${statement.name}: ${printType(statement.type, 0)} = [${values}];`;
};

const printStatement = (statement: Statement): string => {
  switch (statement.kind) {
    case 'interface': {
      return `export interface ${statement.name} {\n${printMembers(statement.members, 0)}}`;
    }
    case 'alias': {
      return `export type ${statement.name} = ${printType(statement.type, 0)};`;
    }
    case 'enum': {
      const members = statement.members.map((member) => printEnumMember(member)).join(',\n');
      return `export enum ${statement.name} {\n${members}${members === '' ? '' : '\n'}}`;
    }
    case 'values': {
      return printValues(statement);
    }
    default: {
      return statement.text;
    }
  }
};

export type Printable = Statement | TypeNode | Member;

const isMember = (node: Printable): node is Member => node.kind === 'property' || node.kind === 'index';

const STATEMENT_KINDS: ReadonlySet<string> = new Set(['interface', 'alias', 'enum', 'values', 'helper']);

const isStatement = (node: Printable): node is Statement => STATEMENT_KINDS.has(node.kind);

const printNode = (node: Printable): string => {
  if (isMember(node)) return printMember(node, 0);
  return isStatement(node) ? printStatement(node) : printType(node, 0);
};

/** A file: each node on its own line, the last line ended. No nodes, no text. */
export const printFile = (nodes: readonly Printable[]): string => nodes.map((node) => `${printNode(node)}\n`).join('');
