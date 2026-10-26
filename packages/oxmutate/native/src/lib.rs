//! oxmutate's native core: parse with oxc, generate mutants with Stryker 10.0.0's rules, and emit
//! one instrumented build per file through span edits (no code generator, so formatting and
//! comments survive byte for byte outside the mutated spans).
//!
//! The rules are the ones `.sdlc/intents/oxmutate/m0/spike/instrument.mjs` measured at 720/720
//! parity with Stryker on es-toolkit, ported from ESTree to oxc's own AST. Differences between the
//! two ASTs are noted where they change a rule (function bodies are `FunctionBody`, members are
//! split into static and computed, TypeScript parameter properties are flags on a parameter).

#![allow(clippy::too_many_lines)]

pub mod instrument;
pub mod stable_id;

#[cfg(feature = "napi")]
mod binding;
