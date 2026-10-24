//! Core definitions for Cryptificate.
//!
//! * [`field`]: GF(2^8) and BN254 scalar field elements behind one [`Field`] trait.
//! * [`design`], [`program`], [`request`]: the public input types (normalized forms).
//! * [`validate`]: untrusted JSON to normalized inputs, with coded errors ([`error`]).
//! * [`canonical`]: canonical JSON and `sha256:` digests.
//! * [`circuit`]: evaluation, coefficient matrices and cost measures of programs.
//! * [`report`]: claims, evidence, witnesses and report documents.
//! * [`diagnostics`]: unchecked analysis used to choose certificates.
//! * [`lean`]: Lean certificates assembled from the template fragments.
//! * [`linalg`], [`limits`]: small helpers and the enforced input limits.

pub mod canonical;
pub mod circuit;
pub mod design;
pub mod diagnostics;
pub mod error;
pub mod field;
pub mod lean;
pub mod limits;
pub mod linalg;
pub mod program;
pub mod report;
pub mod request;
pub mod validate;

pub use circuit::{CircuitStats, OpCounts};
pub use design::{
    AesLikeDesign, AnyMatrix, CandidateDesign, ConstantsSpec, HadesDesign, SboxSpec, Target,
};
pub use error::{ErrorCode, ValidationError};
pub use field::{Bn254, Field, FieldKind, Gf256};
pub use program::{AnyProgram, Instruction, Program};
pub use request::{AnalysisRequest, ExperimentRequest, Profile};
pub use validate::{
    parse_json, validate_analysis_request, validate_design, validate_experiment_request,
    validate_program,
};
