//! Stryker 10.0.0's Regex mutator: weapon-regex 2.0.6 at mutation level 1, ported to
//! `oxc_regular_expression`'s AST.
//!
//! Stryker calls `weaponRegex.mutate(pattern, flags, { mutationLevels: [1] })`, which runs seven
//! token mutators (BOLRemoval, EOLRemoval, CharClassNegation, PredefCharClassNegation,
//! UnicodeCharClassNegation, QuantifierRemoval, LookaroundNegation) over weapon-regex's own regex
//! tree, pre-order, every mutator on a node before its children. A mutant is the whole pattern
//! rebuilt with one node changed; weapon-regex's builder reproduces the source text for every
//! node these mutators leave alone, so a mutant here is the pattern with one span edit.
//!
//! weapon-regex's tree differs from oxc's in two ways that change a mutant:
//! - a disjunction of one alternative is that alternative, and an alternative of one term is that
//!   term, so a lone `^` in `a|^` is a child of the `Or` and its removal drops the `|` with it;
//! - `\v` is a predefined character class there (`\V` is its negation), a character escape here.
//!
//! Patterns weapon-regex cannot parse give Stryker no mutants (it logs and moves on); the ones
//! oxc parses but weapon-regex does not are rejected here the same way (see `weapon_rejects`).

use oxc_allocator::Allocator;
use oxc_regular_expression::ast::{
    Alternative, BoundaryAssertionKind, CharacterClass, CharacterClassContents, CharacterClassEscapeKind, CharacterKind,
    Disjunction, LookAroundAssertionKind, Term,
};
use oxc_regular_expression::{LiteralParser, Options};
use oxc_span::{GetSpan, Span};

/// One mutant: replace `[start, end)` of the pattern with `text`.
struct Edit {
    start: u32,
    end: u32,
    text: &'static str,
}

/// weapon-regex's parser mode: `u` or `v` turn on its Unicode mode (it has no `v` grammar of its
/// own), and oxc parses with the flag that is there so a `v` pattern is checked as one.
fn parse_flags(flags: Option<&str>) -> Option<&'static str> {
    match flags {
        Some(f) if f.contains('v') => Some("v"),
        Some(f) if f.contains('u') => Some("u"),
        _ => None,
    }
}

/// Whether `pattern` parses as a regular expression with `flags` (the literal's own flags).
pub fn is_valid(pattern: &str, flags: &str) -> bool {
    let allocator = Allocator::default();
    LiteralParser::new(&allocator, pattern, Some(flags), Options::default()).parse().is_ok()
}

/// The replacement patterns Stryker 10.0.0 produces for `pattern` (with `flags`), in its order.
/// Empty when the pattern is empty or does not parse.
pub fn regex_mutants(pattern: &str, flags: Option<&str>) -> Vec<String> {
    if pattern.is_empty() {
        return Vec::new();
    }
    let allocator = Allocator::default();
    let Ok(parsed) = LiteralParser::new(&allocator, pattern, parse_flags(flags), Options::default()).parse() else {
        return Vec::new();
    };
    let class_starts = if parse_flags(flags) == Some("v") { Some(weapon_class_starts(pattern)) } else { None };
    let mut walk = Walk { src: pattern, edits: Vec::new(), rejected: false, class_starts };
    walk.disjunction(&parsed.body, None);
    if walk.rejected {
        return Vec::new();
    }
    walk.edits
        .iter()
        .filter(|e| pattern.is_char_boundary(e.start as usize) && pattern.is_char_boundary(e.end as usize))
        .map(|e| format!("{}{}{}", &pattern[..e.start as usize], e.text, &pattern[e.end as usize..]))
        .collect()
}

struct Walk<'s> {
    src: &'s str,
    edits: Vec<Edit>,
    /// Something weapon-regex 2.0.6's JS parser fails on, so Stryker yields nothing for the pattern.
    rejected: bool,
    /// `v` flag only: where weapon-regex sees a character class open (see `weapon_class_starts`).
    class_starts: Option<Vec<u32>>,
}

/// weapon-regex parses `v` patterns with its `u` grammar, which has no nested classes: a class
/// runs from a `[` to the first unescaped `]`, and a `[` inside it is a literal. CharClassNegation
/// therefore applies only to the oxc classes that start where one of those does.
fn weapon_class_starts(pattern: &str) -> Vec<u32> {
    let mut starts = Vec::new();
    let mut in_class = false;
    let mut bytes = pattern.bytes().enumerate();
    while let Some((i, b)) = bytes.next() {
        match b {
            b'\\' => {
                bytes.next();
            }
            b'[' if !in_class => {
                starts.push(i as u32);
                in_class = true;
            }
            b']' if in_class => in_class = false,
            _ => {}
        }
    }
    starts
}

fn is_assertion(term: &Term<'_>, kind: BoundaryAssertionKind) -> bool {
    matches!(term, Term::BoundaryAssertion(b) if b.kind == kind)
}

fn delete(span: Span) -> Edit {
    Edit { start: span.start, end: span.end, text: "" }
}

impl Walk<'_> {
    /// A group-like body: weapon-regex's parser needs at least one character between the parens
    /// (`()`, `(?:)` and `(?=)` fail to parse; `(|)` does not).
    fn group_body(&mut self, body: &Disjunction<'_>, group: Span) {
        if body.body.len() == 1 && body.body[0].body.is_empty() {
            self.rejected = true;
            return;
        }
        self.disjunction(body, Some(group));
    }

    /// `group` is the enclosing group's span when this disjunction is a group's body (the node
    /// weapon-regex makes the parent of a lone term), `None` at the root.
    fn disjunction(&mut self, d: &Disjunction<'_>, group: Option<Span>) {
        if d.body.len() > 1 {
            // An `Or` node: the anchor-removal mutators see bare `^` / `$` alternatives as its
            // children, and rebuilding without one joins the rest with `|`.
            for kind in [BoundaryAssertionKind::Start, BoundaryAssertionKind::End] {
                for (i, alt) in d.body.iter().enumerate() {
                    if alt.body.len() == 1 && is_assertion(&alt.body[0], kind) {
                        let span = if i + 1 < d.body.len() {
                            Span::new(alt.span.start, d.body[i + 1].span.start)
                        } else {
                            Span::new(d.body[i - 1].span.end, alt.span.end)
                        };
                        self.edits.push(delete(span));
                    }
                }
            }
            for alt in &d.body {
                self.alternative(alt, None);
            }
        } else if let Some(alt) = d.body.first() {
            self.alternative(alt, group);
        }
    }

    fn alternative(&mut self, alt: &Alternative<'_>, group: Option<Span>) {
        match alt.body.len() {
            0 => {}
            1 => {
                // The term's parent is the group (or nothing, at the root: a lone `^` pattern has
                // no parent node to remove it from).
                if group.is_some() {
                    for kind in [BoundaryAssertionKind::Start, BoundaryAssertionKind::End] {
                        if is_assertion(&alt.body[0], kind) {
                            self.edits.push(delete(alt.body[0].span()));
                        }
                    }
                }
                self.term(&alt.body[0]);
            }
            _ => {
                // A `Concat` node.
                for kind in [BoundaryAssertionKind::Start, BoundaryAssertionKind::End] {
                    for t in &alt.body {
                        if is_assertion(t, kind) {
                            self.edits.push(delete(t.span()));
                        }
                    }
                }
                for t in &alt.body {
                    self.term(t);
                }
            }
        }
    }

    fn term(&mut self, term: &Term<'_>) {
        match term {
            Term::BoundaryAssertion(b) => {
                // weapon-regex's JS parser knows only `^`, `$`, `\b` and `\B`.
                if !matches!(
                    b.kind,
                    BoundaryAssertionKind::Start
                        | BoundaryAssertionKind::End
                        | BoundaryAssertionKind::Boundary
                        | BoundaryAssertionKind::NegativeBoundary
                ) {
                    self.rejected = true;
                }
            }
            Term::LookAroundAssertion(l) => {
                let (at, to) = match l.kind {
                    LookAroundAssertionKind::Lookahead => (2, "!"),
                    LookAroundAssertionKind::NegativeLookahead => (2, "="),
                    LookAroundAssertionKind::Lookbehind => (3, "!"),
                    LookAroundAssertionKind::NegativeLookbehind => (3, "="),
                };
                // BOLRemoval/EOLRemoval on a lone anchor body come before LookaroundNegation.
                let before = self.edits.len();
                self.group_body(&l.body, l.span);
                let inner: Vec<Edit> = self.edits.drain(before..).collect();
                let (own_anchor, rest): (Vec<Edit>, Vec<Edit>) =
                    inner.into_iter().partition(|e| Self::is_lone_anchor_edit(&l.body, e));
                self.edits.extend(own_anchor);
                self.edits.push(Edit { start: l.span.start + at, end: l.span.start + at + 1, text: to });
                self.edits.extend(rest);
            }
            Term::Quantifier(q) => {
                // QuantifierRemoval: the quantified expression without its quantifier.
                self.edits.push(Edit { start: q.body.span().end, end: q.span.end, text: "" });
                self.term(&q.body);
            }
            Term::Character(c) => self.character(c.kind, c.value, c.span),
            Term::CharacterClassEscape(e) => self.class_escape(e.kind, e.span),
            Term::UnicodePropertyEscape(u) => self.edits.push(Edit {
                start: u.span.start + 1,
                end: u.span.start + 2,
                text: if u.negative { "p" } else { "P" },
            }),
            Term::CharacterClass(c) => self.class(c),
            Term::CapturingGroup(g) => self.group_body(&g.body, g.span),
            Term::IgnoreGroup(g) => {
                // Modifiers (`(?i:…)`) are not in weapon-regex's JS grammar.
                if g.modifiers.is_some() {
                    self.rejected = true;
                    return;
                }
                self.group_body(&g.body, g.span);
            }
            Term::Dot(_) | Term::IndexedReference(_) | Term::NamedReference(_) => {}
        }
    }

    /// The anchor-removal edit of a group body that is a lone `^` or `$`.
    fn is_lone_anchor_edit(body: &Disjunction<'_>, e: &Edit) -> bool {
        body.body.len() == 1
            && body.body[0].body.len() == 1
            && matches!(&body.body[0].body[0], Term::BoundaryAssertion(b) if matches!(b.kind, BoundaryAssertionKind::Start | BoundaryAssertionKind::End) && b.span.start == e.start && b.span.end == e.end && e.text.is_empty())
    }

    /// PredefCharClassNegation on `\v`, which weapon-regex reads as a predefined class.
    fn character(&mut self, kind: CharacterKind, value: u32, span: Span) {
        if kind == CharacterKind::SingleEscape && value == 0x0B && &self.src[span.start as usize..span.end as usize] == "\\v" {
            self.edits.push(Edit { start: span.start, end: span.end, text: "\\V" });
        }
    }

    fn class_escape(&mut self, kind: CharacterClassEscapeKind, span: Span) {
        let to = match kind {
            CharacterClassEscapeKind::D => "\\D",
            CharacterClassEscapeKind::NegativeD => "\\d",
            CharacterClassEscapeKind::S => "\\S",
            CharacterClassEscapeKind::NegativeS => "\\s",
            CharacterClassEscapeKind::W => "\\W",
            CharacterClassEscapeKind::NegativeW => "\\w",
        };
        self.edits.push(Edit { start: span.start, end: span.end, text: to });
    }

    fn class(&mut self, c: &CharacterClass<'_>) {
        // CharClassNegation toggles the `^` after `[`.
        let at = c.span.start + 1;
        let seen_by_weapon = self.class_starts.as_ref().is_none_or(|starts| starts.contains(&c.span.start));
        if seen_by_weapon {
            self.edits.push(if c.negative { Edit { start: at, end: at + 1, text: "" } } else { Edit { start: at, end: at, text: "^" } });
        }
        for item in &c.body {
            match item {
                CharacterClassContents::CharacterClassEscape(e) => self.class_escape(e.kind, e.span),
                CharacterClassContents::UnicodePropertyEscape(u) => self.edits.push(Edit {
                    start: u.span.start + 1,
                    end: u.span.start + 2,
                    text: if u.negative { "p" } else { "P" },
                }),
                CharacterClassContents::Character(ch) => self.character(ch.kind, ch.value, ch.span),
                CharacterClassContents::CharacterClassRange(_) => {}
                CharacterClassContents::NestedCharacterClass(n) => self.class(n),
                CharacterClassContents::ClassStringDisjunction(_) => {}
            }
        }
    }
}

/// A JavaScript string literal for `value`, printed the way Stryker prints a replacement string
/// (Babel's generator: jsesc with `quotes: "double", wrap: true, minimal: true`).
pub fn js_string(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 2);
    out.push('"');
    let mut chars = value.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '\0' => out.push_str(if chars.peek().is_some_and(char::is_ascii_digit) { "\\x00" } else { "\\0" }),
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\u{8}' => out.push_str("\\b"),
            '\u{c}' => out.push_str("\\f"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '\u{a0}' => out.push_str("\\xA0"),
            '\u{1680}' | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' => {
                out.push_str(&format!("\\u{:04X}", c as u32));
            }
            _ => out.push(c),
        }
    }
    out.push('"');
    out
}
