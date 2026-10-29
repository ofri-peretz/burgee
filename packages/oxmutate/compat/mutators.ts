/**
 * What the vendored specs import as `../../../src/mutators/<name>-mutator.js`: one object per
 * Stryker mutator, carrying only the name its spec asserts. `expect-mutation.ts` reads the name
 * to pick that family's mutants out of oxmutate's output.
 */
const named = (name: string): { name: string } => ({ name });

export const arithmeticOperatorMutator = named('ArithmeticOperator');
export const arrayDeclarationMutator = named('ArrayDeclaration');
export const arrowFunctionMutator = named('ArrowFunction');
export const assignmentOperatorMutator = named('AssignmentOperator');
export const blockStatementMutator = named('BlockStatement');
export const booleanLiteralMutator = named('BooleanLiteral');
export const conditionalExpressionMutator = named('ConditionalExpression');
export const emptyExpressionMutator = named('CallExpression');
export const equalityOperatorMutator = named('EqualityOperator');
export const logicalOperatorMutator = named('LogicalOperator');
export const methodExpressionMutator = named('MethodExpression');
export const objectLiteralMutator = named('ObjectLiteral');
export const optionalChainingMutator = named('OptionalChaining');
export const regexMutator = named('Regex');
export const stringLiteralMutator = named('StringLiteral');
export const unaryOperatorMutator = named('UnaryOperator');
export const updateOperatorMutator = named('UpdateOperator');
