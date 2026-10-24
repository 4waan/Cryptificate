//! Bounded search for cheaper linear circuits (cryptificate-search).
//!
//! Given a mixing matrix over GF(2^8) or BN254, the search generates
//! candidate straight-line programs that compute `y = M x` with fewer
//! operations than the direct construction. It is an untrusted candidate
//! generator: every candidate is checked symbolically here, and only the
//! Lean equivalence check and the native correctness run decide what a
//! report claims.
//!
//! Pipeline of one attempt ([`strategy`]):
//!
//! 1. primitive construction from polynomial-basis multiples of each input
//!    ([`expr::primitive_gf256`]: xtime chains; [`expr::primitive_bn254`]:
//!    one multiplication per coefficient);
//! 2. algebraic rewrites chosen by the attempt's seed: factoring
//!    `k*a + k*b = k*(a + b)` (over GF(2^8), xtime(a) xor xtime(b) =
//!    xtime(a xor b)), XOR cancellation (GF(2^8) only), and over BN254
//!    shared-sum decompositions `M = 1 r^T + M'` with modular coefficients;
//! 3. shared-pair extraction across all output expressions (Paar-style
//!    greedy, seeded random tie choices) on a hash-consed graph
//!    ([`synth`]);
//! 4. emission with dead-code elimination and an instruction order with few
//!    live temporaries, then peephole rewrites (`2x = x + x` over BN254).
//!
//! The driver ([`search::run_search`]) stops at the profile's candidate or
//! synthesis-time limit, rejects candidates whose coefficient matrix differs
//! from the target, shortlists the candidates not dominated in
//! (instructions, depth, temporaries), and compares them with the
//! [`baseline`] circuits. Finding no improvement is a valid outcome.
//!
//! Entry point for the engine's `search` subcommand: [`run_search_json`].

pub mod baseline;
pub mod expr;
pub mod input;
pub mod request;
pub mod search;
pub mod strategy;
pub mod synth;

pub use request::{parse_search_request, Budget, SearchRequest};
pub use search::{
    baselines, run_search, symbolic_check, synthesize_attempt, weighted_cost, BaselineRecord,
    CandidateRecord, Costs, HistoryEntry, Improvement, SearchOutput, Stop, UserRecord,
};

use cryptificate_core::ValidationError;
use serde_json::Value;

/// Validates a search request document, runs the search, and returns the
/// output document. Invalid input yields a [`ValidationError`] (exit code 2
/// in the engine).
pub fn run_search_json(input: &Value) -> Result<Value, ValidationError> {
    let req = parse_search_request(input)?;
    let out = run_search(&req);
    Ok(serde_json::to_value(&out).expect("search output serializes"))
}
