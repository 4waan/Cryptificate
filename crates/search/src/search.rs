//! The bounded search driver: attempts, symbolic checks, history, shortlist
//! and the comparison with baselines.
//!
//! Every attempt `i` has its own seed, 16 hex digits of
//! `sha256(<request seed> ":" i)`, which drives the strategy choice and the
//! random tie-breaking of pair extraction (`ChaCha20Rng::seed_from_u64`). The
//! same request seed and budget therefore reproduce the same candidates.
//! Candidates are untrusted: each one is checked symbolically (its
//! coefficient matrix must equal the target) before it can be shortlisted,
//! and the Lean and native checks downstream decide what is claimed.

use std::collections::HashMap;
use std::time::Instant;

use cryptificate_core::canonical::sha256_hex;
use cryptificate_core::circuit::{CircuitStats, OpCounts};
use cryptificate_core::design::AnyMatrix;
use cryptificate_core::linalg::Matrix;
use cryptificate_core::report::{self, CandidateOrigin, SymbolicCheck};
use cryptificate_core::{AnyProgram, Field, FieldKind, Program};
use rand::SeedableRng;
use rand_chacha::ChaCha20Rng;
use serde::Serialize;
use serde_json::Value;

use crate::baseline;
use crate::input;
use crate::request::SearchRequest;
use crate::strategy::{synthesize_bn254, synthesize_gf256, Strategy};

/// Weight of a multiplication by `02` (xtime) relative to an addition.
pub const XTIME_WEIGHT: usize = 2;
/// Weight of a general GF(2^8) multiplication (eight xtime steps and masked XORs).
pub const GF256_MUL_WEIGHT: usize = 16;
/// Weight of a BN254 multiplication (Montgomery product) relative to an addition.
pub const BN254_MUL_WEIGHT: usize = 8;

/// Attempts per allowed candidate before the search gives up on finding
/// new distinct circuits.
const ATTEMPTS_PER_CANDIDATE: usize = 8;

/// Weighted operation count used to break ties between candidates with the
/// same instruction count: over GF(2^8), XORs + 2 * xtimes (+ 16 per other
/// multiplication); over BN254, additions + 8 * multiplications.
pub fn weighted_cost(field: FieldKind, ops: &OpCounts) -> usize {
    match field {
        FieldKind::Gf256 => {
            ops.add + XTIME_WEIGHT * ops.xtime + GF256_MUL_WEIGHT * (ops.mul - ops.xtime)
        }
        FieldKind::Bn254 => ops.add + BN254_MUL_WEIGHT * ops.mul,
    }
}

/// Static costs of a circuit as reported by the search.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Costs {
    pub ops: OpCounts,
    pub depth: usize,
    pub temps: usize,
    /// See [`weighted_cost`].
    pub weight: usize,
    /// `"sha256:<hex>"` circuit identity (ignores the name and `add` operand order).
    pub identity: String,
    /// `"sha256:<hex>"` of the circuit's dependency graph, independent of
    /// instruction order and register numbering (see [`shape_identity`]).
    pub shape: String,
}

impl Costs {
    /// Costs of a structurally valid program.
    pub fn of(p: &AnyProgram) -> Self {
        let CircuitStats { ops, depth, temps } = p.stats();
        Costs {
            weight: weighted_cost(p.field(), &ops),
            ops,
            depth,
            temps,
            identity: p.identity_hash(),
            shape: shape_identity(p),
        }
    }

    /// Total instruction count (`add + mul`).
    pub fn instructions(&self) -> usize {
        self.ops.add + self.ops.mul
    }
}

/// One generated candidate, in generation order.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    /// `c1`, `c2`, ...
    pub id: String,
    /// The attempt seed (16 hex digits).
    pub seed: String,
    /// The attempt index the seed was derived from.
    pub attempt: usize,
    pub strategy: String,
    #[serde(flatten)]
    pub costs: Costs,
    pub symbolic: SymbolicCheck,
    /// Why the candidate was rejected, when it was.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    /// The baseline with the same circuit identity, if any.
    pub same_as: Option<String>,
}

/// A generated candidate with its program.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CandidateRecord {
    pub id: String,
    pub origin: CandidateOrigin,
    pub program: AnyProgram,
    #[serde(flatten)]
    pub costs: Costs,
    pub symbolic: SymbolicCheck,
    pub seed: String,
    pub strategy: String,
    pub same_as: Option<String>,
}

/// A baseline circuit.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BaselineRecord {
    /// `baseline-direct` or `baseline-known`.
    pub id: String,
    pub origin: CandidateOrigin,
    pub program: AnyProgram,
    #[serde(flatten)]
    pub costs: Costs,
}

/// A coefficient where the user's circuit differs from the matrix.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Mismatch {
    pub row: usize,
    pub col: usize,
    pub expected: String,
    pub actual: String,
}

/// The user's circuit and whether it computes the matrix. Only an
/// equivalent user circuit is used as a baseline.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserRecord {
    /// Always `"user"`.
    pub id: String,
    pub equivalent: bool,
    #[serde(flatten)]
    pub costs: Costs,
    pub mismatch: Option<Mismatch>,
}

/// Static comparison of the best shortlisted candidate with one baseline.
/// Positive savings mean the candidate is cheaper.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Delta {
    pub baseline: String,
    pub instructions_saved: i64,
    pub weight_saved: i64,
    pub depth_saved: i64,
}

/// Whether the search found a circuit cheaper than every baseline. This is
/// an operation count comparison only; whether it is faster is decided by
/// the native measurements.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Improvement {
    pub found: bool,
    /// The best shortlisted candidate.
    pub best: Option<String>,
    pub deltas: Vec<Delta>,
    pub note: String,
}

/// Why the search stopped.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Stop {
    /// `maxCandidates` distinct candidates were generated.
    MaxCandidates,
    /// The synthesis time budget ran out.
    SynthesisBudget,
    /// Attempts kept reproducing known circuits.
    Exhausted,
}

/// The search output document.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchOutput {
    /// Always `"search"`.
    pub kind: &'static str,
    pub field: FieldKind,
    pub width: usize,
    pub matrix: Vec<Vec<String>>,
    pub seed: String,
    /// `"given"` or `"derived"`.
    pub seed_source: &'static str,
    pub budget: Value,
    /// Distinct candidates generated (each appears once in `history`).
    pub generated: usize,
    /// Synthesis attempts, including those that reproduced a known circuit.
    pub attempts: usize,
    pub duplicates: usize,
    /// Wall-clock milliseconds spent synthesizing.
    pub spent_ms: u64,
    pub stopped: Stop,
    pub history: Vec<HistoryEntry>,
    /// Shortlisted candidate ids, best first.
    pub shortlist: Vec<String>,
    pub candidates: Vec<CandidateRecord>,
    pub baselines: Vec<BaselineRecord>,
    pub user: Option<UserRecord>,
    pub improvement: Improvement,
}

impl SearchOutput {
    /// The `search` member of an experiment report.
    pub fn to_summary(&self) -> report::SearchSummary {
        report::SearchSummary {
            seed: self.seed.clone(),
            budget: self.budget.clone(),
            generated: self.generated,
            history: self
                .history
                .iter()
                .map(|h| report::HistoryEntry {
                    id: h.id.clone(),
                    ops: h.costs.ops,
                    depth: h.costs.depth,
                    temps: h.costs.temps,
                    symbolic: h.symbolic,
                })
                .collect(),
            shortlist: self.shortlist.clone(),
        }
    }

    /// The candidate with the given id.
    pub fn candidate(&self, id: &str) -> Option<&CandidateRecord> {
        self.candidates.iter().find(|c| c.id == id)
    }
}

/// `"sha256:<hex>"` identifying the dependency graph of a structurally valid
/// program, independent of instruction order, register numbering and `add`
/// operand order. Every register gets a Merkle key (`sha256` of its
/// operation, constant and operand keys); the identity hashes the field, the
/// width, the sorted keys of the live instructions and the output keys. Two
/// programs with the same identity compute the same values through the same
/// operations and differ at most in scheduling.
pub fn shape_identity(p: &AnyProgram) -> String {
    fn shape<F: Field>(p: &Program<F>) -> String {
        let mut keys: Vec<String> = (0..p.width)
            .map(|j| sha256_hex(format!("x{j}").as_bytes()))
            .collect();
        for ins in &p.instructions {
            let key = match *ins {
                cryptificate_core::Instruction::Add { a, b } => {
                    let (x, y) = if keys[a] <= keys[b] { (a, b) } else { (b, a) };
                    format!("add:{}:{}", keys[x], keys[y])
                }
                cryptificate_core::Instruction::Mul { k, a } => {
                    format!("mul:{}:{}", k.encode(), keys[a])
                }
            };
            keys.push(sha256_hex(key.as_bytes()));
        }
        let mut live = vec![false; p.register_count()];
        let mut stack = p.outputs.clone();
        while let Some(r) = stack.pop() {
            if !live[r] {
                live[r] = true;
                if r >= p.width {
                    stack.extend(p.instructions[r - p.width].operands());
                }
            }
        }
        let mut nodes: Vec<&String> = (p.width..p.register_count())
            .filter(|&r| live[r])
            .map(|r| &keys[r])
            .collect();
        nodes.sort_unstable();
        let outputs: Vec<&String> = p.outputs.iter().map(|&r| &keys[r]).collect();
        cryptificate_core::canonical::digest_of(&serde_json::json!({
            "field": F::KIND,
            "width": p.width,
            "nodes": nodes,
            "outputs": outputs,
        }))
    }
    match p {
        AnyProgram::Gf256(p) => shape(p),
        AnyProgram::Bn254(p) => shape(p),
    }
}

/// Seed of attempt `index`: 16 hex digits of `sha256(seed ":" index)`.
pub fn attempt_seed(seed: &str, index: usize) -> String {
    sha256_hex(format!("{seed}:{index}").as_bytes())[..16].to_string()
}

fn rng_for(seed16: &str) -> ChaCha20Rng {
    ChaCha20Rng::seed_from_u64(u64::from_str_radix(seed16, 16).expect("16 hex digits"))
}

/// Synthesizes the candidate of attempt `index` (deterministic in the seed).
pub fn synthesize_attempt(matrix: &AnyMatrix, seed: &str, index: usize) -> (AnyProgram, String) {
    let s = attempt_seed(seed, index);
    let mut rng = rng_for(&s);
    let field = input::matrix_field(matrix);
    let strategy = Strategy::for_attempt(field, index, &mut rng);
    let program = match matrix {
        AnyMatrix::Gf256(m) => AnyProgram::Gf256(synthesize_gf256(m, &strategy, &mut rng)),
        AnyMatrix::Bn254(m) => AnyProgram::Bn254(synthesize_bn254(m, &strategy, &mut rng)),
    };
    (program, strategy.label(field))
}

/// Checks a program against the target: structural rules, then the
/// coefficient matrix. Returns the rejection reason, if any.
pub fn symbolic_check(program: &AnyProgram, matrix: &AnyMatrix) -> Option<String> {
    if let Err(e) = program.check_at("") {
        return Some(format!("{}: {}", e.code, e.message));
    }
    fn mismatch<F: Field>(p: &Program<F>, m: &Matrix<F>) -> Option<String> {
        if p.width != m.len() {
            return Some(format!(
                "width {} differs from matrix size {}",
                p.width,
                m.len()
            ));
        }
        p.first_mismatch(m).map(|d| {
            format!(
                "coefficient ({}, {}) is {} instead of {}",
                d.row, d.col, d.actual, d.expected
            )
        })
    }
    match (program, matrix) {
        (AnyProgram::Gf256(p), AnyMatrix::Gf256(m)) => mismatch(p, m),
        (AnyProgram::Bn254(p), AnyMatrix::Bn254(m)) => mismatch(p, m),
        _ => Some("program field differs from the matrix field".into()),
    }
}

fn user_mismatch(program: &AnyProgram, matrix: &AnyMatrix) -> Option<Mismatch> {
    fn first<F: Field>(p: &Program<F>, m: &Matrix<F>) -> Option<Mismatch> {
        p.first_mismatch(m).map(|d| Mismatch {
            row: d.row,
            col: d.col,
            expected: d.expected.encode(),
            actual: d.actual.encode(),
        })
    }
    match (program, matrix) {
        (AnyProgram::Gf256(p), AnyMatrix::Gf256(m)) => first(p, m),
        (AnyProgram::Bn254(p), AnyMatrix::Bn254(m)) => first(p, m),
        _ => None,
    }
}

/// The baselines for a matrix: the direct primitive construction and, for a
/// known matrix, the known circuit.
pub fn baselines(matrix: &AnyMatrix) -> Vec<BaselineRecord> {
    let mut out = Vec::new();
    let mut push = |id: &str, origin, program: AnyProgram| {
        out.push(BaselineRecord {
            id: id.into(),
            origin,
            costs: Costs::of(&program),
            program,
        })
    };
    match matrix {
        AnyMatrix::Gf256(m) => {
            push(
                "baseline-direct",
                CandidateOrigin::BaselineDirect,
                baseline::direct_gf256(m).into(),
            );
            if let Some(k) = baseline::known_gf256(m) {
                push("baseline-known", CandidateOrigin::BaselineKnown, k.into());
            }
        }
        AnyMatrix::Bn254(m) => {
            push(
                "baseline-direct",
                CandidateOrigin::BaselineDirect,
                baseline::direct_bn254(m).into(),
            );
            if let Some(k) = baseline::known_bn254(m) {
                push("baseline-known", CandidateOrigin::BaselineKnown, k.into());
            }
        }
    }
    out
}

/// Lexicographic static rank: instructions, then weight, then depth.
fn rank(c: &Costs) -> (usize, usize, usize) {
    (c.instructions(), c.weight, c.depth)
}

/// The shortlist: candidates not dominated in (instructions, depth, live
/// temporaries), ordered by weighted cost, then depth, then circuit
/// identity, truncated to `size`.
pub fn shortlist(candidates: &[(&str, &Costs)], size: usize) -> Vec<String> {
    let dominated = |a: &Costs| {
        candidates.iter().any(|(_, b)| {
            let (ai, bi) = (a.instructions(), b.instructions());
            bi <= ai
                && b.depth <= a.depth
                && b.temps <= a.temps
                && (bi < ai || b.depth < a.depth || b.temps < a.temps)
        })
    };
    let mut front: Vec<&(&str, &Costs)> =
        candidates.iter().filter(|(_, c)| !dominated(c)).collect();
    front.sort_by(|a, b| {
        (a.1.weight, a.1.depth, &a.1.identity).cmp(&(b.1.weight, b.1.depth, &b.1.identity))
    });
    front
        .into_iter()
        .take(size)
        .map(|(id, _)| id.to_string())
        .collect()
}

/// Runs the search within the request's budget.
pub fn run_search(req: &SearchRequest) -> SearchOutput {
    let start = Instant::now();
    let field = req.field();
    let baselines = baselines(&req.matrix);
    let user = req.program.as_ref().map(|p| {
        let mismatch = user_mismatch(p, &req.matrix);
        UserRecord {
            id: "user".into(),
            equivalent: mismatch.is_none(),
            costs: Costs::of(p),
            mismatch,
        }
    });
    // Baseline circuits by shape, to flag candidates that reproduce one.
    let mut known: HashMap<String, String> = HashMap::new();
    for b in &baselines {
        known.entry(b.costs.shape.clone()).or_insert(b.id.clone());
    }
    if let Some(u) = user.as_ref().filter(|u| u.equivalent) {
        known.entry(u.costs.shape.clone()).or_insert("user".into());
    }

    let budget = req.budget;
    let max_attempts = budget.max_candidates.saturating_mul(ATTEMPTS_PER_CANDIDATE);
    let mut seen: HashMap<String, String> = HashMap::new();
    let mut history = Vec::new();
    let mut candidates = Vec::new();
    let mut attempts = 0usize;
    let mut duplicates = 0usize;
    let stopped = loop {
        if candidates.len() >= budget.max_candidates {
            break Stop::MaxCandidates;
        }
        if start.elapsed().as_millis() >= u128::from(budget.synth_ms) {
            break Stop::SynthesisBudget;
        }
        if attempts >= max_attempts {
            break Stop::Exhausted;
        }
        let index = attempts;
        attempts += 1;
        let (program, strategy) = synthesize_attempt(&req.matrix, &req.seed, index);
        let reason = symbolic_check(&program, &req.matrix);
        // Candidates that differ only in scheduling count as one circuit.
        let key = if program.check_at("").is_ok() {
            shape_identity(&program)
        } else {
            program.identity_hash()
        };
        if seen.contains_key(&key) {
            duplicates += 1;
            continue;
        }
        let id = format!("c{}", candidates.len() + 1);
        seen.insert(key.clone(), id.clone());
        let symbolic = if reason.is_none() {
            SymbolicCheck::Pass
        } else {
            SymbolicCheck::Reject
        };
        let costs = if program.check_at("").is_ok() {
            Costs::of(&program)
        } else {
            Costs {
                ops: OpCounts::default(),
                depth: 0,
                temps: 0,
                weight: 0,
                identity: program.identity_hash(),
                shape: key,
            }
        };
        let seed = attempt_seed(&req.seed, index);
        let same_as = known.get(&costs.shape).cloned();
        history.push(HistoryEntry {
            id: id.clone(),
            seed: seed.clone(),
            attempt: index,
            strategy: strategy.clone(),
            costs: costs.clone(),
            symbolic,
            reason,
            same_as: same_as.clone(),
        });
        candidates.push(CandidateRecord {
            id,
            origin: CandidateOrigin::Search,
            program,
            costs,
            symbolic,
            seed,
            strategy,
            same_as,
        });
    };

    let passing: Vec<(&str, &Costs)> = candidates
        .iter()
        .filter(|c| c.symbolic == SymbolicCheck::Pass)
        .map(|c| (c.id.as_str(), &c.costs))
        .collect();
    let shortlist = shortlist(&passing, budget.shortlist);
    let improvement = improvement(&shortlist, &candidates, &baselines, user.as_ref());

    SearchOutput {
        kind: "search",
        field,
        width: req.width,
        matrix: input::encode_matrix(&req.matrix),
        seed: req.seed.clone(),
        seed_source: if req.seed_given { "given" } else { "derived" },
        budget: req.budget_json(),
        generated: candidates.len(),
        attempts,
        duplicates,
        spent_ms: u64::try_from(start.elapsed().as_millis()).unwrap_or(u64::MAX),
        stopped,
        history,
        shortlist,
        candidates,
        baselines,
        user,
        improvement,
    }
}

fn improvement(
    shortlist: &[String],
    candidates: &[CandidateRecord],
    baselines: &[BaselineRecord],
    user: Option<&UserRecord>,
) -> Improvement {
    let mut refs: Vec<(&str, &Costs)> = baselines
        .iter()
        .map(|b| (b.id.as_str(), &b.costs))
        .collect();
    if let Some(u) = user.filter(|u| u.equivalent) {
        refs.push(("user", &u.costs));
    }
    let Some(best) = shortlist
        .iter()
        .filter_map(|id| candidates.iter().find(|c| &c.id == id))
        .min_by_key(|c| rank(&c.costs))
    else {
        return Improvement {
            found: false,
            best: None,
            deltas: Vec::new(),
            note: "No generated candidate passed the symbolic check.".into(),
        };
    };
    let deltas: Vec<Delta> = refs
        .iter()
        .map(|(id, c)| Delta {
            baseline: id.to_string(),
            instructions_saved: c.instructions() as i64 - best.costs.instructions() as i64,
            weight_saved: c.weight as i64 - best.costs.weight as i64,
            depth_saved: c.depth as i64 - best.costs.depth as i64,
        })
        .collect();
    let found = refs.iter().all(|(_, c)| rank(&best.costs) < rank(c));
    let ops = &best.costs.ops;
    let note = if found {
        format!(
            "{} uses {} additions and {} multiplications ({} xtime), fewer operations than every baseline. Speed is decided by the native measurements.",
            best.id, ops.add, ops.mul, ops.xtime
        )
    } else {
        format!(
            "No improvement: the best candidate {} ({} additions, {} multiplications) is not cheaper than every baseline.",
            best.id, ops.add, ops.mul
        )
    };
    Improvement {
        found,
        best: Some(best.id.clone()),
        deltas,
        note,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn costs(add: usize, depth: usize, temps: usize, id: &str) -> Costs {
        Costs {
            ops: OpCounts {
                add,
                mul: 0,
                xtime: 0,
            },
            depth,
            temps,
            weight: add,
            identity: id.into(),
            shape: id.into(),
        }
    }

    #[test]
    fn shortlist_keeps_the_nondominated_front() {
        let a = costs(10, 4, 3, "a");
        let b = costs(12, 3, 3, "b"); // trades ops for depth: kept
        let c = costs(12, 4, 3, "c"); // dominated by a
        let d = costs(10, 4, 3, "d"); // equal to a: both kept, identity orders them
        let all = [("a", &a), ("b", &b), ("c", &c), ("d", &d)];
        assert_eq!(shortlist(&all, 5), vec!["a", "d", "b"]);
        assert_eq!(shortlist(&all, 1), vec!["a"]);
    }

    #[test]
    fn shape_ignores_scheduling_but_not_structure() {
        use cryptificate_core::{Gf256, Instruction};
        let a = Program::<Gf256> {
            width: 2,
            name: None,
            instructions: vec![
                Instruction::Add { a: 0, b: 1 },
                Instruction::Mul { k: Gf256(2), a: 0 },
            ],
            outputs: vec![2, 3],
        };
        let b = Program::<Gf256> {
            width: 2,
            name: Some("other".into()),
            instructions: vec![
                Instruction::Mul { k: Gf256(2), a: 0 },
                Instruction::Add { a: 1, b: 0 },
            ],
            outputs: vec![3, 2],
        };
        let (a, b) = (AnyProgram::Gf256(a), AnyProgram::Gf256(b));
        assert_ne!(a.identity_hash(), b.identity_hash());
        assert_eq!(shape_identity(&a), shape_identity(&b));
        let mut c = b.clone();
        if let AnyProgram::Gf256(p) = &mut c {
            p.outputs = vec![2, 3];
        }
        assert_ne!(shape_identity(&a), shape_identity(&c));
    }

    #[test]
    fn attempt_seeds_are_reproducible() {
        assert_eq!(attempt_seed("c0ffee", 3), attempt_seed("c0ffee", 3));
        assert_ne!(attempt_seed("c0ffee", 3), attempt_seed("c0ffee", 4));
        assert_eq!(attempt_seed("c0ffee", 0).len(), 16);
    }
}
