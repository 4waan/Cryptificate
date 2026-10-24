//! Analysis and experiment requests (normalized forms).

use serde::{Deserialize, Serialize};

use crate::canonical;
use crate::design::{CandidateDesign, Target};
use crate::program::AnyProgram;

/// Check a design (and optionally a program implementing one of its matrices).
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnalysisRequest {
    pub design: CandidateDesign,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub program: Option<AnyProgram>,
    /// Always present after normalization (`matrix` for AES-like designs,
    /// `external` for HADES designs unless given).
    pub target: Target,
}

impl AnalysisRequest {
    /// `"sha256:<hex>"` of the canonical JSON of this (normalized) request.
    pub fn input_digest(&self) -> String {
        canonical::digest_of(self)
    }
}

/// Search for faster circuits, check them, and measure them.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExperimentRequest {
    pub design: CandidateDesign,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub program: Option<AnyProgram>,
    pub profile: Profile,
    /// Lowercase hex digits, when given.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub seed: Option<String>,
}

impl ExperimentRequest {
    /// `"sha256:<hex>"` of the canonical JSON of this (normalized) request.
    pub fn input_digest(&self) -> String {
        canonical::digest_of(self)
    }
}

/// Experiment effort profile.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Profile {
    Quick,
    Research,
}

impl Profile {
    pub const fn as_str(self) -> &'static str {
        match self {
            Profile::Quick => "quick",
            Profile::Research => "research",
        }
    }
}
