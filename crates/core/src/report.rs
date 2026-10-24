//! Report types: claims, evidence, witnesses, execution state, and the
//! analysis and experiment report documents.

use serde::{Deserialize, Serialize};

use crate::circuit::OpCounts;
use crate::program::AnyProgram;
use crate::request::{AnalysisRequest, Profile};

/// Fixed claim identifiers.
pub mod claim_ids {
    // Design chain, AES-like.
    pub const MATRIX_MDS: &str = "matrix.mds";
    pub const OFFSETS_DISPERSION: &str = "offsets.dispersion";
    pub const SBOX_BIJECTIVE: &str = "sbox.bijective";
    pub const ACTIVITY_BOUND: &str = "activity.bound";
    // Design chain, HADES (`sbox.bijective` is shared).
    pub const EXTERNAL_MDS: &str = "external.mds";
    pub const INTERNAL_INVERTIBLE: &str = "internal.invertible";
    pub const ACTIVITY_OUTER: &str = "activity.outer";
    // Implementation chain.
    pub const CIRCUIT_EQUIVALENCE: &str = "circuit.equivalence";
    pub const NATIVE_CORRECTNESS: &str = "native.correctness";
    pub const RUST_REFINEMENT: &str = "rust.refinement";
    pub const NATIVE_TIMING: &str = "native.timing";
}

/// Exact evidence label strings shown by the UI.
pub mod labels {
    pub const LEAN_PROOF: &str = "Lean-checked proof";
    pub const LEAN_CIRCUIT_EQUIVALENCE: &str = "Lean-checked circuit equivalence";
    pub const LEAN_COUNTEREXAMPLE: &str = "Lean-checked counterexample";
    pub const RUST_REFINEMENT: &str = "Rust-source refinement (Aeneas)";
    pub const NATIVE_TIMING: &str = "Native timing measured on this machine";
    pub const UNCHECKED_DIAGNOSTIC: &str = "Unchecked diagnostic";

    /// `"Generated Rust passed N correctness cases"`.
    pub fn native_correctness(cases: u64) -> String {
        format!("Generated Rust passed {cases} correctness cases")
    }
}

/// Axioms a Lean certificate may depend on; anything else is rejected.
pub const ALLOWED_AXIOMS: [&str; 3] = ["propext", "Classical.choice", "Quot.sound"];

/// AES-like activity bound for `rounds` rounds:
/// `floor(r/4)*25 + (5 if r mod 4 >= 2 else 0)`.
pub fn aes_like_activity_bound(rounds: u32) -> u32 {
    (rounds / 4) * 25 + if rounds % 4 >= 2 { 5 } else { 0 }
}

/// Which chain of the argument a claim belongs to.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Chain {
    Design,
    Implementation,
}

/// Outcome of a claim. A timeout is never `refuted`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    Proved,
    Refuted,
    NotEstablished,
    Unsupported,
}

/// What produced the evidence for a claim.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EvidenceKind {
    Lean,
    Native,
    Measurement,
    Refinement,
    Diagnostic,
}

/// Evidence behind a claim. `theorem`, `type` and `axioms` are present for
/// Lean evidence.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Evidence {
    pub kind: EvidenceKind,
    /// One of the strings in [`labels`].
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub theorem: Option<String>,
    #[serde(rename = "type", default, skip_serializing_if = "Option::is_none")]
    pub type_: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub axioms: Option<Vec<String>>,
}

/// A concrete witness attached to a claim, tagged by `kind`. Field elements
/// are canonical strings.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum Witness {
    /// `weight(input) + weight(output) < bound`, with `output = M input`.
    #[serde(rename_all = "camelCase")]
    Branch {
        input: Vec<String>,
        output: Vec<String>,
        input_weight: usize,
        output_weight: usize,
        bound: usize,
    },
    /// Two rows share the same offset.
    OffsetCollision { rows: Vec<usize>, offset: usize },
    /// An input on which the program and the target matrix disagree.
    DistinguishingInput {
        input: Vec<String>,
        expected: Vec<String>,
        actual: Vec<String>,
        differing: Vec<usize>,
    },
    /// Two distinct S-box inputs with the same output.
    SboxCollision { x1: String, x2: String, y: String },
    /// Two distinct field elements with the same power.
    PowerCollision {
        exponent: u32,
        x1: String,
        x2: String,
        note: String,
    },
}

/// One claim of a report.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Claim {
    /// One of [`claim_ids`].
    pub id: String,
    pub chain: Chain,
    pub title: String,
    pub status: Status,
    pub evidence: Evidence,
    /// Serialized as `null` when absent.
    pub witness: Option<Witness>,
    pub note: String,
}

/// Execution outcome of a job or step (separate from claim status).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExecutionState {
    Completed,
    Failed,
    Timeout,
    Cancelled,
    Invalid,
}

/// One timed step of a job.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Step {
    pub name: String,
    pub state: ExecutionState,
    pub ms: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Execution {
    pub state: ExecutionState,
    pub steps: Vec<Step>,
}

/// Where a report came from.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Origin {
    Live,
    Cached,
    Recorded,
}

/// Toolchain pins recorded with a report.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Toolchain {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lean: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mathlib: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub widetrail: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rustc: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Provenance {
    pub origin: Origin,
    /// `"cryptificate <version>"`.
    pub checker: String,
    pub toolchain: Toolchain,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lean_source_sha256: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cache_key: Option<String>,
}

/// Marker serialized as `"analysis"`.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub enum AnalysisKind {
    #[default]
    #[serde(rename = "analysis")]
    Analysis,
}

/// Marker serialized as `"experiment"`.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub enum ExperimentKind {
    #[default]
    #[serde(rename = "experiment")]
    Experiment,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisReport {
    pub kind: AnalysisKind,
    pub id: String,
    pub input_digest: String,
    pub inputs: AnalysisRequest,
    pub claims: Vec<Claim>,
    pub execution: Execution,
    pub provenance: Provenance,
}

/// Symbolic pre-check result of a search candidate.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SymbolicCheck {
    Pass,
    Reject,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub id: String,
    pub ops: OpCounts,
    pub depth: usize,
    pub temps: usize,
    pub symbolic: SymbolicCheck,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SearchSummary {
    pub seed: String,
    pub budget: serde_json::Value,
    pub generated: usize,
    pub history: Vec<HistoryEntry>,
    pub shortlist: Vec<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum CandidateOrigin {
    Search,
    BaselineDirect,
    BaselineKnown,
    User,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct NativeCheck {
    pub cases: u64,
    pub passed: bool,
    pub checksum: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct CandidateEntry {
    pub id: String,
    pub program: AnyProgram,
    pub origin: CandidateOrigin,
    pub equivalence: Claim,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub native: Option<NativeCheck>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Machine {
    pub cpu: String,
    pub os: String,
    #[serde(rename = "ramMiB")]
    pub ram_mib: u64,
    pub rustc: String,
    pub flags: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Workload {
    pub bytes: u64,
    pub columns: u64,
    /// Raw per-sample timings in nanoseconds.
    pub samples: Vec<u64>,
    pub median_ns_per_column: f64,
    pub iqr: f64,
    pub mib_per_sec: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Comparison {
    pub candidate: String,
    pub baseline: String,
    pub ratio: f64,
    pub ci95: [f64; 2],
    pub session: u32,
}

/// Benchmark verdict.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Verdict {
    #[serde(rename = "locally confirmed")]
    LocallyConfirmed,
    #[serde(rename = "inconclusive")]
    Inconclusive,
    #[serde(rename = "no improvement")]
    NoImprovement,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Measurements {
    pub machine: Machine,
    pub workloads: Vec<Workload>,
    pub comparisons: Vec<Comparison>,
    pub verdict: Verdict,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExperimentReport {
    pub kind: ExperimentKind,
    pub id: String,
    pub input_digest: String,
    pub profile: Profile,
    pub search: SearchSummary,
    pub candidates: Vec<CandidateEntry>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub measurements: Option<Measurements>,
    pub provenance: Provenance,
    #[serde(default)]
    pub checkpoints: Vec<serde_json::Value>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn activity_bound_table() {
        assert_eq!(aes_like_activity_bound(4), 25);
        assert_eq!(aes_like_activity_bound(6), 30);
        assert_eq!(aes_like_activity_bound(10), 55);
        assert_eq!(aes_like_activity_bound(32), 200);
    }

    #[test]
    fn claim_json_shape() {
        let c = Claim {
            id: claim_ids::MATRIX_MDS.into(),
            chain: Chain::Design,
            title: "Matrix is MDS (branch number 5)".into(),
            status: Status::NotEstablished,
            evidence: Evidence {
                kind: EvidenceKind::Lean,
                label: labels::LEAN_PROOF.into(),
                theorem: Some("CryptificateJob.matrix_mds".into()),
                type_: Some("T".into()),
                axioms: Some(vec!["propext".into()]),
            },
            witness: Some(Witness::Branch {
                input: vec!["01".into()],
                output: vec!["01".into()],
                input_weight: 1,
                output_weight: 1,
                bound: 5,
            }),
            note: "n".into(),
        };
        let v = serde_json::to_value(&c).unwrap();
        assert_eq!(v["status"], "not_established");
        assert_eq!(v["evidence"]["type"], "T");
        assert_eq!(v["witness"]["kind"], "branch");
        assert_eq!(v["witness"]["inputWeight"], 1);
        let w = serde_json::to_value(Witness::OffsetCollision { rows: vec![1, 2], offset: 1 }).unwrap();
        assert_eq!(w, json!({"kind": "offset-collision", "rows": [1, 2], "offset": 1}));
        let none = Claim { witness: None, ..c };
        assert!(serde_json::to_value(&none).unwrap()["witness"].is_null());
        assert_eq!(serde_json::to_value(Verdict::LocallyConfirmed).unwrap(), "locally confirmed");
        assert_eq!(serde_json::to_value(CandidateOrigin::BaselineKnown).unwrap(), "baseline-known");
    }
}
