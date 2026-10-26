//! Mutant generation and placement on oxc's AST, emitted as span edits.

use oxc_allocator::Allocator;
use oxc_ast::ast::{
    Argument, ArrowFunctionBody, ArrowFunctionExpression, BindingPattern, ChainElement, ClassElement, Expression,
    FormalParameter, FunctionType, MethodDefinitionKind, PropertyKey, PropertyKind,
};
use oxc_ast::AstKind;
use oxc_ast_visit::Visit;
use oxc_parser::{ParseOptions, Parser};
use oxc_span::{GetSpan, SourceType, Span};
use oxc_syntax::operator::{
    AssignmentOperator, BinaryOperator, LogicalOperator, UnaryOperator, UpdateOperator,
};

use crate::stable_id::stable_id;

/// The runtime namespace and helper names the instrumented code calls. The runner owns the other
/// end of this contract (`src/runtime.ts`).
pub const NAMESPACE: &str = "__oxmutate__";

fn header(namespace: &str) -> String {
    format!(
        "// @ts-nocheck\n\
function oxmNS() {{ var g = globalThis; var ns = g.{namespace} || (g.{namespace} = {{}}); if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__OXMUTATE_ACTIVE_MUTANT__) {{ ns.activeMutant = g.process.env.__OXMUTATE_ACTIVE_MUTANT__; }} oxmNS = function () {{ return ns; }}; return ns; }}\n\
function oxmCov() {{ var ns = oxmNS(); var cov = ns.mutantCoverage || (ns.mutantCoverage = {{ static: {{}}, perTest: {{}} }}); var c = cov.static; if (ns.currentTestId) {{ c = cov.perTest[ns.currentTestId] || (cov.perTest[ns.currentTestId] = {{}}); }} for (var i = 0; i < arguments.length; i++) {{ c[arguments[i]] = (c[arguments[i]] || 0) + 1; }} }}\n\
function oxmAct(id) {{ var ns = oxmNS(); if (ns.activeMutant === id) {{ if (ns.hitCount !== undefined && ++ns.hitCount > ns.hitLimit) {{ throw new Error('oxmutate: Hit count limit reached (' + ns.hitCount + ')'); }} return true; }} return false; }}\n"
    )
}

#[derive(Debug, Clone, Copy, Default)]
pub struct Options {
    /// Reproduce Stryker 10.0.0's skips (code inside `as` casts and enums is never mutated).
    pub stryker_compat: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Position {
    /// 1-based.
    pub line: u32,
    /// 1-based, in UTF-16 code units (what JavaScript and Stryker's report count).
    pub column: u32,
}

#[derive(Debug, Clone)]
pub struct Mutant {
    pub id: String,
    pub mutator_name: &'static str,
    pub replacement: String,
    pub start: Position,
    pub end: Position,
}

#[derive(Debug)]
pub struct Instrumented {
    /// `None` when the file has no mutants (it is left untouched).
    pub code: Option<String>,
    pub mutants: Vec<Mutant>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Placer {
    Expression,
    Statement,
    SwitchCase,
}

struct Placement {
    placer: Placer,
    span: Span,
    depth: usize,
    /// The block's braces are part of its span (BlockStatement, FunctionBody).
    block: bool,
    /// `const NAME = <this>`: wrapped originals keep `NAME` as their `.name` (Stryker's
    /// nameIfAnonymous).
    name_for: Option<String>,
    /// SwitchCase: byte offset just after the case's `:`.
    case_colon: Option<u32>,
    mutants: Vec<usize>,
}

struct Raw {
    mutator_name: &'static str,
    replacement: String,
    node: Span,
    host: usize,
    owner: u32,
    dropped: bool,
}

struct Frame<'a> {
    kind: AstKind<'a>,
    id: u32,
    placement: Option<usize>,
    mutants_before: usize,
    skipped: bool,
}

struct Collector<'a> {
    src: &'a str,
    options: Options,
    stack: Vec<Frame<'a>>,
    skip_depth: usize,
    placements: Vec<Placement>,
    mutants: Vec<Raw>,
    next_id: u32,
}

// ── Node classes ───────────────────────────────────────────────────────────────────────────────

fn is_type_node(kind: &AstKind<'_>, options: Options) -> bool {
    use AstKind as K;
    match kind {
        K::TSTypeAnnotation(_) | K::TSLiteralType(_) | K::TSConditionalType(_) | K::TSUnionType(_)
        | K::TSIntersectionType(_) | K::TSParenthesizedType(_) | K::TSTypeOperator(_)
        | K::TSArrayType(_) | K::TSIndexedAccessType(_) | K::TSTupleType(_)
        | K::TSNamedTupleMember(_) | K::TSOptionalType(_) | K::TSRestType(_) | K::TSAnyKeyword(_)
        | K::TSStringKeyword(_) | K::TSBooleanKeyword(_) | K::TSNumberKeyword(_)
        | K::TSNeverKeyword(_) | K::TSIntrinsicKeyword(_) | K::TSUnknownKeyword(_)
        | K::TSNullKeyword(_) | K::TSUndefinedKeyword(_) | K::TSVoidKeyword(_)
        | K::TSSymbolKeyword(_) | K::TSThisType(_) | K::TSObjectKeyword(_) | K::TSBigIntKeyword(_)
        | K::TSTypeReference(_) | K::TSQualifiedName(_) | K::TSTypeParameterInstantiation(_)
        | K::TSTypeParameter(_) | K::TSTypeParameterDeclaration(_) | K::TSTypeAliasDeclaration(_)
        | K::TSClassImplements(_) | K::TSInterfaceDeclaration(_) | K::TSInterfaceBody(_)
        | K::TSPropertySignature(_) | K::TSIndexSignature(_) | K::TSCallSignatureDeclaration(_)
        | K::TSMethodSignature(_) | K::TSConstructSignatureDeclaration(_)
        | K::TSIndexSignatureName(_) | K::TSInterfaceHeritage(_) | K::TSTypePredicate(_)
        | K::TSTypeLiteral(_) | K::TSInferType(_) | K::TSTypeQuery(_) | K::TSImportType(_)
        | K::TSImportTypeQualifiedName(_) | K::TSFunctionType(_) | K::TSConstructorType(_)
        | K::TSMappedType(_) | K::TSTemplateLiteralType(_) | K::TSThisParameter(_)
        | K::TSNamespaceExportDeclaration(_) | K::TSImportEqualsDeclaration(_)
        | K::ImportDeclaration(_) | K::Decorator(_) => true,
        K::TSAsExpression(_) | K::TSEnumDeclaration(_) => options.stryker_compat,
        K::Function(f) => f.declare || f.body.is_none(),
        K::Class(c) => c.declare,
        K::VariableDeclaration(v) => v.declare,
        _ => false,
    }
}

fn is_member(kind: &AstKind<'_>) -> bool {
    matches!(
        kind,
        AstKind::StaticMemberExpression(_)
            | AstKind::ComputedMemberExpression(_)
            | AstKind::PrivateFieldExpression(_)
    )
}

impl<'a> Collector<'a> {
    fn parent(&self) -> Option<&AstKind<'a>> {
        self.stack.last().map(|f| &f.kind)
    }

    fn ancestor(&self, up: usize) -> Option<&AstKind<'a>> {
        self.stack.len().checked_sub(up + 1).and_then(|i| self.stack.get(i)).map(|f| &f.kind)
    }

    fn text(&self, span: Span) -> &'a str {
        &self.src[span.start as usize..span.end as usize]
    }

    /// Function and class *expressions* are expressions; a method's function is not (Babel's
    /// ClassMethod / ObjectMethod).
    fn is_expression(&self, kind: &AstKind<'a>) -> bool {
        use AstKind as K;
        match kind {
            K::Function(f) => {
                f.r#type == FunctionType::FunctionExpression
                    && !matches!(self.parent(), Some(K::MethodDefinition(_)))
                    && !matches!(self.parent(), Some(K::ObjectProperty(p)) if p.method || p.kind != PropertyKind::Init)
            }
            K::Class(c) => c.r#type == oxc_ast::ast::ClassType::ClassExpression,
            K::ArrayExpression(_) | K::ArrowFunctionExpression(_) | K::AssignmentExpression(_)
            | K::AwaitExpression(_) | K::BinaryExpression(_) | K::CallExpression(_)
            | K::ChainExpression(_) | K::ConditionalExpression(_) | K::ImportExpression(_)
            | K::StringLiteral(_) | K::BooleanLiteral(_) | K::NullLiteral(_) | K::NumericLiteral(_)
            | K::BigIntLiteral(_) | K::RegExpLiteral(_) | K::LogicalExpression(_)
            | K::StaticMemberExpression(_) | K::ComputedMemberExpression(_)
            | K::PrivateFieldExpression(_) | K::ImportMeta(_) | K::NewTarget(_)
            | K::NewExpression(_) | K::ObjectExpression(_) | K::SequenceExpression(_)
            | K::TaggedTemplateExpression(_) | K::TemplateLiteral(_) | K::ThisExpression(_)
            | K::UnaryExpression(_) | K::UpdateExpression(_) | K::YieldExpression(_)
            | K::IdentifierReference(_) | K::TSAsExpression(_) | K::TSSatisfiesExpression(_)
            | K::TSNonNullExpression(_) | K::TSTypeAssertion(_) | K::TSInstantiationExpression(_)
            | K::PrivateInExpression(_) | K::JSXElement(_) | K::JSXFragment(_) => true,
            _ => false,
        }
    }

    /// The function or arrow whose block body this is, if it is one.
    fn is_function_block(&self, kind: &AstKind<'a>) -> bool {
        matches!(kind, AstKind::FunctionBody(_))
            && matches!(self.parent(), Some(AstKind::Function(_)) | Some(AstKind::ArrowFunctionExpression(ArrowFunctionExpression { body: ArrowFunctionBody::FunctionBody(_), .. })))
    }

    fn is_statement(&self, kind: &AstKind<'a>) -> bool {
        use AstKind as K;
        match kind {
            K::Function(f) => f.r#type == FunctionType::FunctionDeclaration,
            K::Class(c) => c.r#type == oxc_ast::ast::ClassType::ClassDeclaration,
            K::BlockStatement(_) | K::BreakStatement(_) | K::ContinueStatement(_)
            | K::DebuggerStatement(_) | K::DoWhileStatement(_) | K::EmptyStatement(_)
            | K::ExpressionStatement(_) | K::ForInStatement(_) | K::ForOfStatement(_)
            | K::ForStatement(_) | K::IfStatement(_) | K::LabeledStatement(_)
            | K::ReturnStatement(_) | K::SwitchStatement(_) | K::ThrowStatement(_)
            | K::TryStatement(_) | K::WhileStatement(_) | K::WithStatement(_)
            | K::ExportNamedDeclaration(_) | K::ExportDefaultDeclaration(_)
            | K::ExportAllDeclaration(_) => true,
            K::VariableDeclaration(_) => !matches!(self.parent(), Some(K::ForStatement(_) | K::ForInStatement(_) | K::ForOfStatement(_))),
            _ => self.is_function_block(kind),
        }
    }

    // ── Placement (Stryker's three placers) ────────────────────────────────────────────────────

    fn can_place_expression(&self, kind: &AstKind<'a>, span: Span) -> bool {
        use AstKind as K;
        if !self.is_expression(kind) {
            return false;
        }
        let Some(parent) = self.parent() else { return false };
        match parent {
            K::ChainExpression(_) => return false, // the chain is placed, same span
            K::ObjectProperty(p) if p.key.span() == span => return false,
            K::TaggedTemplateExpression(_) => return false,
            K::UnaryExpression(u) if u.operator == UnaryOperator::Delete => return false,
            K::AssignmentExpression(a) if a.left.span() == span => return false,
            K::UpdateExpression(_) => return false,
            _ => {}
        }
        let chain_like = is_member(kind)
            || matches!(kind, K::CallExpression(_) | K::TSNonNullExpression(_) | K::ChainExpression(_));
        if chain_like {
            let part_of_chain = match parent {
                K::ComputedMemberExpression(m) => m.expression.span() != span,
                K::StaticMemberExpression(_) | K::PrivateFieldExpression(_) => true,
                K::TSNonNullExpression(_) => true,
                K::CallExpression(c) => c.callee.span() == span,
                _ => false,
            };
            if part_of_chain {
                return false;
            }
        }
        true
    }

    fn placer_for(&self, kind: &AstKind<'a>, span: Span) -> Option<Placer> {
        if self.can_place_expression(kind, span) {
            Some(Placer::Expression)
        } else if self.is_statement(kind) {
            Some(Placer::Statement)
        } else if matches!(kind, AstKind::SwitchCase(_)) {
            Some(Placer::SwitchCase)
        } else {
            None
        }
    }

    fn name_for(&self, kind: &AstKind<'a>) -> Option<String> {
        let anonymous = match kind {
            AstKind::ArrowFunctionExpression(_) => true,
            AstKind::Function(f) => f.id.is_none(),
            AstKind::Class(c) => c.id.is_none(),
            _ => false,
        };
        if !anonymous {
            return None;
        }
        if let Some(AstKind::VariableDeclarator(d)) = self.parent() {
            if let BindingPattern::BindingIdentifier(id) = &d.id {
                return Some(id.name.to_string());
            }
        }
        None
    }

    // ── Mutators (Stryker 10.0.0 semantics) ────────────────────────────────────────────────────

    fn swap_operator(&self, node: Span, left: Span, right: Span, from: &str, to: &str) -> String {
        let between = &self.src[left.end as usize..right.start as usize];
        let at = between.find(from).unwrap_or(0);
        format!(
            "{}{}{}{}{}",
            &self.src[node.start as usize..left.end as usize],
            &between[..at],
            to,
            &between[at + from.len()..],
            &self.src[right.start as usize..node.end as usize]
        )
    }

    fn is_stringish(e: &Expression<'_>) -> bool {
        matches!(e, Expression::StringLiteral(_) | Expression::TemplateLiteral(_))
    }

    fn valid_string_parent(&self, span: Span) -> bool {
        use AstKind as K;
        match self.parent() {
            None => false,
            Some(p) => match p {
                K::ImportDeclaration(_) | K::ExportNamedDeclaration(_) | K::ExportAllDeclaration(_)
                | K::ExportDefaultDeclaration(_) | K::TSExternalModuleReference(_)
                | K::JSXAttribute(_) | K::ExpressionStatement(_) | K::ImportExpression(_)
                | K::TSEnumMember(_) | K::TSExternalModuleDeclaration(_) | K::TSLiteralType(_) => false,
                K::ObjectProperty(o) => o.key.span() != span,
                K::PropertyDefinition(o) => o.key.span() != span,
                K::MethodDefinition(o) => o.key.span() != span,
                K::CallExpression(c) => !matches!(&c.callee, Expression::Identifier(id) if id.name == "require" || id.name == "Symbol"),
                _ => true,
            },
        }
    }

    fn invalid_constructor_body(&self, span: Span) -> bool {
        // FunctionBody ← Function ← MethodDefinition(constructor) ← ClassBody
        let (Some(AstKind::Function(f)), Some(AstKind::MethodDefinition(m))) = (self.ancestor(0), self.ancestor(1)) else {
            return false;
        };
        if m.kind != MethodDefinitionKind::Constructor {
            return false;
        }
        let ts_params = f.params.items.iter().any(|p: &FormalParameter<'_>| p.accessibility.is_some() || p.readonly || p.r#override);
        let initialized = matches!(self.ancestor(2), Some(AstKind::ClassBody(b)) if b.body.iter().any(|e| matches!(e, ClassElement::PropertyDefinition(p) if p.value.is_some())));
        if !(ts_params || initialized) {
            return false;
        }
        let body = self.text(span);
        body.match_indices("super").any(|(i, _)| body[i + 5..].trim_start().starts_with('('))
    }

    fn mutate(&self, kind: &AstKind<'a>, span: Span) -> Vec<(&'static str, String)> {
        use AstKind as K;
        let mut out: Vec<(&'static str, String)> = Vec::new();
        let src = self.src;
        let text = |s: Span| &src[s.start as usize..s.end as usize];
        match kind {
            K::BinaryExpression(b) => {
                let op = b.operator;
                let arith = match op {
                    BinaryOperator::Addition => Some("-"),
                    BinaryOperator::Subtraction => Some("+"),
                    BinaryOperator::Multiplication => Some("/"),
                    BinaryOperator::Division => Some("*"),
                    BinaryOperator::Remainder => Some("*"),
                    _ => None,
                };
                if let Some(to) = arith {
                    let left_type = match &b.left {
                        Expression::BinaryExpression(l) => &l.right,
                        other => other,
                    };
                    if !Self::is_stringish(&b.right) && !Self::is_stringish(left_type) {
                        out.push(("ArithmeticOperator", self.swap_operator(span, b.left.span(), b.right.span(), op.as_str(), to)));
                    }
                }
                let equality: &[&str] = match op {
                    BinaryOperator::LessThan => &["<=", ">="],
                    BinaryOperator::LessEqualThan => &["<", ">"],
                    BinaryOperator::GreaterThan => &[">=", "<="],
                    BinaryOperator::GreaterEqualThan => &[">", "<"],
                    BinaryOperator::Equality => &["!="],
                    BinaryOperator::Inequality => &["=="],
                    BinaryOperator::StrictEquality => &["!=="],
                    BinaryOperator::StrictInequality => &["==="],
                    _ => &[],
                };
                for to in equality {
                    out.push(("EqualityOperator", self.swap_operator(span, b.left.span(), b.right.span(), op.as_str(), to)));
                }
            }
            K::LogicalExpression(l) => {
                let to = match l.operator {
                    LogicalOperator::And => "||",
                    LogicalOperator::Or => "&&",
                    LogicalOperator::Coalesce => "&&",
                };
                out.push(("LogicalOperator", self.swap_operator(span, l.left.span(), l.right.span(), l.operator.as_str(), to)));
            }
            K::AssignmentExpression(a) => {
                use AssignmentOperator as A;
                let to = match a.operator {
                    A::Addition => Some("-="),
                    A::Subtraction => Some("+="),
                    A::Multiplication => Some("/="),
                    A::Division => Some("*="),
                    A::Remainder => Some("*="),
                    A::ShiftLeft => Some(">>="),
                    A::ShiftRight => Some("<<="),
                    A::BitwiseAnd => Some("|="),
                    A::BitwiseOR => Some("&="),
                    A::LogicalAnd => Some("||="),
                    A::LogicalOr => Some("&&="),
                    A::LogicalNullish => Some("&&="),
                    _ => None,
                };
                let string_ok = matches!(a.operator, A::LogicalAnd | A::LogicalOr | A::LogicalNullish);
                if let Some(to) = to {
                    if !(Self::is_stringish(&a.right) && !string_ok) {
                        out.push(("AssignmentOperator", self.swap_operator(span, a.left.span(), a.right.span(), a.operator.as_str(), to)));
                    }
                }
            }
            K::UnaryExpression(u) => {
                let after = &src[(span.start as usize + u.operator.as_str().len())..span.end as usize];
                match u.operator {
                    UnaryOperator::LogicalNot => out.push(("BooleanLiteral", after.trim_start().to_string())),
                    UnaryOperator::UnaryPlus => out.push(("UnaryOperator", format!("-{after}"))),
                    UnaryOperator::UnaryNegation => out.push(("UnaryOperator", format!("+{after}"))),
                    UnaryOperator::BitwiseNot => out.push(("UnaryOperator", after.trim_start().to_string())),
                    _ => {}
                }
            }
            K::UpdateExpression(u) => {
                let to = match u.operator {
                    UpdateOperator::Increment => "--",
                    UpdateOperator::Decrement => "++",
                };
                let replacement = if u.prefix {
                    format!("{to}{}", &src[span.start as usize + 2..span.end as usize])
                } else {
                    format!("{}{to}", &src[span.start as usize..span.end as usize - 2])
                };
                out.push(("UpdateOperator", replacement));
            }
            K::BooleanLiteral(b) => out.push(("BooleanLiteral", (!b.value).to_string())),
            K::StringLiteral(s) => {
                if self.valid_string_parent(span) {
                    out.push(("StringLiteral", if s.value.is_empty() { "\"Stryker was here!\"".into() } else { "\"\"".into() }));
                }
            }
            K::TemplateLiteral(t) => {
                if !matches!(self.parent(), Some(K::TaggedTemplateExpression(_))) {
                    let empty = t.quasis.len() == 1 && t.quasis[0].value.raw.is_empty();
                    out.push(("StringLiteral", if empty { "`Stryker was here!`".into() } else { "``".into() }));
                }
            }
            K::ArrayExpression(a) => out.push(("ArrayDeclaration", if a.elements.is_empty() { "[\"Stryker was here\"]".into() } else { "[]".into() })),
            K::NewExpression(n) => {
                if matches!(&n.callee, Expression::Identifier(id) if id.name == "Array") {
                    out.push(("ArrayDeclaration", if n.arguments.is_empty() { "new Array([])".into() } else { "new Array()".into() }));
                }
            }
            K::ObjectExpression(o) => {
                if !o.properties.is_empty() {
                    out.push(("ObjectLiteral", "{}".into()));
                }
            }
            K::ArrowFunctionExpression(a) => {
                if let Some(body) = a.get_expression() {
                    if !matches!(body, Expression::Identifier(id) if id.name == "undefined") {
                        out.push(("ArrowFunction", "() => undefined".into()));
                    }
                }
            }
            K::BlockStatement(b) => {
                if !b.body.is_empty() {
                    out.push(("BlockStatement", "{}".into()));
                }
            }
            K::FunctionBody(b) => {
                if self.is_function_block(kind) && !b.statements.is_empty() && !self.invalid_constructor_body(span) {
                    out.push(("BlockStatement", "{}".into()));
                }
            }
            K::ForStatement(f) => {
                if f.test.is_none() {
                    let from = f.init.as_ref().map_or_else(|| src[span.start as usize..].find('(').map_or(span.start as usize, |i| span.start as usize + i), |i| i.span().end as usize);
                    if let Some(semi) = src[from..].find(';').map(|i| from + i) {
                        out.push(("ConditionalExpression", format!("{} false{}", &src[span.start as usize..=semi], &src[semi + 1..span.end as usize])));
                    }
                }
            }
            K::SwitchCase(c) => {
                if !c.consequent.is_empty() {
                    out.push(("ConditionalExpression", String::new()));
                }
            }
            K::ExpressionStatement(s) => {
                if let Expression::CallExpression(c) = &s.expression {
                    if !matches!(&c.callee, Expression::Super(_)) {
                        out.push(("CallExpression", ";".into()));
                    }
                }
            }
            K::ThrowStatement(t) => {
                if matches!(&t.argument, Expression::NewExpression(_)) {
                    out.push(("CallExpression", ";".into()));
                }
            }
            K::CallExpression(c) => {
                if matches!(&c.callee, Expression::Identifier(id) if id.name == "Array") {
                    out.push(("ArrayDeclaration", if c.arguments.is_empty() { "Array([])".into() } else { "Array()".into() }));
                }
                if let Expression::StaticMemberExpression(m) = &c.callee {
                    if let Some(to) = method_replacement(m.property.name.as_str()) {
                        let property = m.property.span;
                        match to {
                            None => {
                                let between = &src[m.object.span().end as usize..property.start as usize];
                                let trimmed = between.trim_end().trim_end_matches(['.', '?']).trim_end_matches('?');
                                out.push(("MethodExpression", format!("{}{}", &src[m.span.start as usize..m.object.span().end as usize], trimmed)));
                            }
                            Some(to) => out.push(("MethodExpression", format!("{}{}{}", &src[span.start as usize..property.start as usize], to, &src[property.end as usize..span.end as usize]))),
                        }
                    }
                }
                if c.optional {
                    let callee = c.callee.span();
                    out.push(("OptionalChaining", format!("{}{}", text(callee), src[callee.end as usize..span.end as usize].replacen("?.", "", 1))));
                }
            }
            K::StaticMemberExpression(m) if m.optional => {
                let object = m.object.span();
                let between = &src[object.end as usize..m.property.span.start as usize];
                out.push(("OptionalChaining", format!("{}{}{}", text(object), between.replacen("?.", ".", 1), &src[m.property.span.start as usize..span.end as usize])));
            }
            K::ComputedMemberExpression(m) if m.optional => {
                let object = m.object.span();
                let between = &src[object.end as usize..m.expression.span().start as usize];
                out.push(("OptionalChaining", format!("{}{}{}", text(object), between.replacen("?.", "", 1), &src[m.expression.span().start as usize..span.end as usize])));
            }
            _ => {}
        }
        // ConditionalExpression on tests and boolean expressions (needs the parent).
        if self.is_expression(kind) {
            let parent = self.parent();
            let test_of_loop = match parent {
                Some(K::ForStatement(f)) => f.test.as_ref().is_some_and(|t| t.span() == span),
                Some(K::WhileStatement(w)) => w.test.span() == span,
                Some(K::DoWhileStatement(w)) => w.test.span() == span,
                _ => false,
            };
            let test_of_if = matches!(parent, Some(K::IfStatement(i)) if i.test.span() == span);
            let boolean = match kind {
                K::BinaryExpression(b) => matches!(
                    b.operator,
                    BinaryOperator::Inequality | BinaryOperator::StrictInequality | BinaryOperator::LessThan
                        | BinaryOperator::LessEqualThan | BinaryOperator::Equality | BinaryOperator::StrictEquality
                        | BinaryOperator::GreaterThan | BinaryOperator::GreaterEqualThan
                ),
                K::LogicalExpression(l) => matches!(l.operator, LogicalOperator::And | LogicalOperator::Or),
                _ => false,
            };
            if test_of_loop {
                out.push(("ConditionalExpression", "false".into()));
            } else if test_of_if {
                out.push(("ConditionalExpression", "true".into()));
                out.push(("ConditionalExpression", "false".into()));
            } else if boolean {
                match parent {
                    Some(K::LogicalExpression(p)) if p.operator == LogicalOperator::Or => out.push(("ConditionalExpression", "false".into())),
                    Some(K::LogicalExpression(p)) if p.operator == LogicalOperator::And => out.push(("ConditionalExpression", "true".into())),
                    _ => {
                        out.push(("ConditionalExpression", "true".into()));
                        out.push(("ConditionalExpression", "false".into()));
                    }
                }
            }
        }
        out
    }
}

fn method_replacement(name: &str) -> Option<Option<&'static str>> {
    let pairs: &[(&str, Option<&'static str>)] = &[
        ("charAt", None), ("endsWith", Some("startsWith")), ("startsWith", Some("endsWith")),
        ("every", Some("some")), ("some", Some("every")), ("filter", None), ("reverse", None),
        ("slice", None), ("sort", None), ("substr", None), ("substring", None),
        ("toLocaleLowerCase", Some("toLocaleUpperCase")), ("toLocaleUpperCase", Some("toLocaleLowerCase")),
        ("toLowerCase", Some("toUpperCase")), ("toUpperCase", Some("toLowerCase")), ("trim", None),
        ("trimEnd", Some("trimStart")), ("trimStart", Some("trimEnd")), ("min", Some("max")), ("max", Some("min")),
        ("setDate", Some("setTime")), ("setTime", Some("setDate")), ("setFullYear", Some("setMonth")),
        ("setMonth", Some("setFullYear")), ("setHours", Some("setMinutes")), ("setMinutes", Some("setHours")),
        ("setSeconds", Some("setMilliseconds")), ("setMilliseconds", Some("setSeconds")),
        ("setUTCDate", Some("setTime")), ("setUTCFullYear", Some("setUTCMonth")), ("setUTCMonth", Some("setUTCFullYear")),
        ("setUTCHours", Some("setUTCMinutes")), ("setUTCMinutes", Some("setUTCHours")),
        ("setUTCSeconds", Some("setUTCMilliseconds")), ("setUTCMilliseconds", Some("setUTCSeconds")),
    ];
    pairs.iter().find(|(k, _)| *k == name).map(|(_, v)| *v)
}

impl<'a> Visit<'a> for Collector<'a> {
    fn enter_node(&mut self, kind: AstKind<'a>) {
        let id = self.next_id;
        self.next_id += 1;
        if self.skip_depth > 0 || is_type_node(&kind, self.options) {
            self.skip_depth += 1;
            self.stack.push(Frame { kind, id, placement: None, mutants_before: self.mutants.len(), skipped: true });
            return;
        }
        let span = kind.span();
        let placer = if self.stack.is_empty() { None } else { self.placer_for(&kind, span) };
        let placement = placer.map(|placer| {
            let case_colon = match &kind {
                AstKind::SwitchCase(c) => {
                    let from = c.test.as_ref().map_or(span.start as usize + "default".len(), |t| t.span().end as usize);
                    self.src[from..].find(':').map(|i| (from + i + 1) as u32)
                }
                _ => None,
            };
            self.placements.push(Placement {
                placer,
                span,
                depth: self.stack.len(),
                block: matches!(kind, AstKind::BlockStatement(_)) || self.is_function_block(&kind),
                name_for: if placer == Placer::Expression { self.name_for(&kind) } else { None },
                case_colon,
                mutants: Vec::new(),
            });
            self.placements.len() - 1
        });
        let mutants_before = self.mutants.len();
        if !self.stack.is_empty() {
            let host = placement.or_else(|| self.stack.iter().rev().find_map(|f| f.placement));
            if let Some(host) = host {
                for (mutator_name, replacement) in self.mutate(&kind, span) {
                    self.mutants.push(Raw { mutator_name, replacement, node: span, host, owner: id, dropped: false });
                }
            }
        }
        self.stack.push(Frame { kind, id, placement, mutants_before, skipped: false });
    }

    fn leave_node(&mut self, _kind: AstKind<'a>) {
        let Some(frame) = self.stack.pop() else { return };
        if frame.skipped {
            self.skip_depth -= 1;
            return;
        }
        // Stryker's CallExpression filter: keep it only when it is the subtree's sole mutant.
        let live = self.mutants[frame.mutants_before..].iter().filter(|m| !m.dropped).count();
        if live != 1 {
            for m in &mut self.mutants[frame.mutants_before..] {
                if m.owner == frame.id && m.mutator_name == "CallExpression" {
                    m.dropped = true;
                }
            }
        }
    }
}

// ── Positions ───────────────────────────────────────────────────────────────────────────────────

struct Lines<'a> {
    src: &'a str,
    starts: Vec<usize>,
}

impl<'a> Lines<'a> {
    fn new(src: &'a str) -> Self {
        let mut starts = vec![0];
        starts.extend(src.match_indices('\n').map(|(i, _)| i + 1));
        Self { src, starts }
    }
    fn position(&self, offset: u32) -> Position {
        let offset = offset as usize;
        let line = self.starts.partition_point(|&s| s <= offset) - 1;
        let column = self.src[self.starts[line]..offset].encode_utf16().count() + 1;
        Position { line: line as u32 + 1, column: column as u32 }
    }
}

// ── Emission ────────────────────────────────────────────────────────────────────────────────────

struct Emitter<'a> {
    src: &'a str,
    placements: Vec<Placement>,
    mutants: Vec<(Raw, String)>, // with final ids
}

impl Emitter<'_> {
    fn applied(&self, m: &Raw) -> String {
        let host = self.placements[m.host].span;
        if m.mutator_name == "ConditionalExpression" && self.placements[m.host].placer == Placer::SwitchCase {
            return String::new();
        }
        format!("{}{}{}", &self.src[host.start as usize..m.node.start as usize], m.replacement, &self.src[m.node.end as usize..host.end as usize])
    }

    /// Render `[start, end)` with every placement inside it (in `order`, from index `*cursor`).
    fn render(&self, start: u32, end: u32, order: &[usize], cursor: &mut usize) -> String {
        let mut out = String::new();
        let mut at = start;
        while *cursor < order.len() {
            let p = &self.placements[order[*cursor]];
            if p.span.start >= end || p.span.end > end {
                break;
            }
            *cursor += 1;
            out.push_str(&self.src[at as usize..p.span.start as usize]);
            let inner = self.render(p.span.start, p.span.end, order, cursor);
            out.push_str(&self.wrap(p, inner));
            at = p.span.end;
        }
        out.push_str(&self.src[at as usize..end as usize]);
        out
    }

    fn wrap(&self, p: &Placement, inner: String) -> String {
        let live: Vec<&(Raw, String)> = p.mutants.iter().map(|&i| &self.mutants[i]).filter(|(m, _)| !m.dropped).collect();
        if live.is_empty() {
            return inner;
        }
        let ids = live.iter().map(|(_, id)| format!("\"{id}\"")).collect::<Vec<_>>().join(", ");
        match p.placer {
            Placer::Expression => {
                let original = match &p.name_for {
                    Some(name) => format!("(() => {{ const {name} = {inner}; return {name}; }})()"),
                    None => inner,
                };
                let mut expr = format!("(oxmCov({ids}), {original})");
                for (m, id) in &live {
                    expr = format!("(oxmAct(\"{id}\") ? ({}) : {expr})", self.applied(m));
                }
                expr
            }
            Placer::SwitchCase => {
                let colon = p.case_colon.unwrap_or(p.span.start) as usize;
                let head = &self.src[p.span.start as usize..colon];
                let body = &inner[colon - p.span.start as usize..];
                let mut stmt = format!("{{ oxmCov({ids});{body} }}");
                for (_, id) in &live {
                    stmt = format!("if (oxmAct(\"{id}\")) {{}} else {stmt}");
                }
                format!("{head} {stmt}")
            }
            Placer::Statement => {
                let body = if p.block { &inner[1..inner.len() - 1] } else { inner.as_str() };
                let mut stmt = format!("{{ oxmCov({ids});{body} }}");
                for (m, id) in &live {
                    stmt = format!("if (oxmAct(\"{id}\")) {{ {} }} else {stmt}", self.applied(m));
                }
                if p.block { format!("{{ {stmt} }}") } else { stmt }
            }
        }
    }
}

/// Instrument one file. `path` is the id namespace (use the repository-relative path).
pub fn instrument(path: &str, source: &str, options: Options) -> Result<Instrumented, String> {
    let allocator = Allocator::default();
    let source_type = SourceType::from_path(path).unwrap_or_default();
    let parsed = Parser::new(&allocator, source, source_type)
        .with_options(ParseOptions { preserve_parens: false, ..ParseOptions::default() })
        .parse();
    if let Some(e) = parsed.diagnostics.errors().next() {
        return Err(format!("{path}: {e}"));
    }
    let mut c = Collector { src: source, options, stack: Vec::new(), skip_depth: 0, placements: Vec::new(), mutants: Vec::new(), next_id: 0 };
    c.visit_program(&parsed.program);

    let lines = Lines::new(source);
    let mut seen = std::collections::HashSet::new();
    let mut mutants = Vec::new();
    let mut with_ids = Vec::with_capacity(c.mutants.len());
    for (i, m) in c.mutants.into_iter().enumerate() {
        let start = lines.position(m.node.start);
        let end = lines.position(m.node.end);
        let mut id = stable_id(path, (start.line, start.column), (end.line, end.column), m.mutator_name, &m.replacement);
        // Two mutants with the same span, mutator and replacement would share a switch. None is
        // known to exist; if one ever does, it gets a suffix rather than silently merging.
        let mut n = 1;
        while !m.dropped && !seen.insert(id.clone()) {
            n += 1;
            id = format!("{}-{n}", &id[..16]);
        }
        if !m.dropped {
            mutants.push(Mutant { id: id.clone(), mutator_name: m.mutator_name, replacement: m.replacement.clone(), start, end });
            c.placements[m.host].mutants.push(i);
        }
        with_ids.push((m, id));
    }
    if mutants.is_empty() {
        return Ok(Instrumented { code: None, mutants });
    }
    // Placements in document order, outer before inner on equal spans.
    let mut order: Vec<usize> = (0..c.placements.len()).collect();
    order.sort_by(|&a, &b| {
        let (pa, pb) = (&c.placements[a], &c.placements[b]);
        pa.span.start.cmp(&pb.span.start).then(pb.span.end.cmp(&pa.span.end)).then(pa.depth.cmp(&pb.depth))
    });
    let emitter = Emitter { src: source, placements: c.placements, mutants: with_ids };
    let mut cursor = 0;
    let body = emitter.render(0, source.len() as u32, &order, &mut cursor);
    Ok(Instrumented { code: Some(header(NAMESPACE) + &body), mutants })
}

#[allow(dead_code)]
fn _unused(_: &Argument<'_>, _: &PropertyKey<'_>, _: &ChainElement<'_>) {}
