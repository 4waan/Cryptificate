//! Search requests and profile budgets.

use cryptificate_core::canonical::{sha256_hex, to_canonical_json};
use cryptificate_core::design::AnyMatrix;
use cryptificate_core::{AnyProgram, ErrorCode, FieldKind, Profile, ValidationError};
use serde::Serialize;
use serde_json::{json, Value};

use crate::input::{self, Obj, Result};

/// Limits of one experiment profile. The search itself spends at most
/// `synth_ms` and generates at most `max_candidates` distinct candidates;
/// `total_ms` is the whole experiment's budget (proofs and measurements
/// included), recorded so that callers can plan the remaining steps.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Budget {
    pub profile: Profile,
    pub total_ms: u64,
    pub max_candidates: usize,
    pub synth_ms: u64,
    pub shortlist: usize,
}

impl Budget {
    /// `quick`: 180 s in total, at most 8 candidates, 10 s of synthesis,
    /// shortlist of 1. `research`: 900 s, 64 candidates, 60 s, shortlist of 3.
    pub const fn for_profile(profile: Profile) -> Self {
        match profile {
            Profile::Quick => Budget {
                profile,
                total_ms: 180_000,
                max_candidates: 8,
                synth_ms: 10_000,
                shortlist: 1,
            },
            Profile::Research => Budget {
                profile,
                total_ms: 900_000,
                max_candidates: 64,
                synth_ms: 60_000,
                shortlist: 3,
            },
        }
    }

    /// The profile budget, lowered (never raised) by requested limits.
    pub fn limited(profile: Profile, max_candidates: Option<u64>, synth_ms: Option<u64>) -> Self {
        let mut b = Self::for_profile(profile);
        if let Some(n) = max_candidates {
            b.max_candidates = b
                .max_candidates
                .min(usize::try_from(n).unwrap_or(usize::MAX));
        }
        if let Some(ms) = synth_ms {
            b.synth_ms = b.synth_ms.min(ms);
        }
        b
    }
}

/// A validated search request.
#[derive(Clone, Debug, PartialEq)]
pub struct SearchRequest {
    /// The matrix to implement (`y = M x`).
    pub matrix: AnyMatrix,
    pub width: usize,
    pub budget: Budget,
    /// Limits as requested, before clamping to the profile.
    pub requested_max_candidates: Option<u64>,
    pub requested_synth_ms: Option<u64>,
    /// Lowercase hex.
    pub seed: String,
    /// Whether `seed` was given or derived from the matrix.
    pub seed_given: bool,
    /// The user's circuit, compared as a baseline when it computes the matrix.
    pub program: Option<AnyProgram>,
}

impl SearchRequest {
    /// A request with the profile's limits and a seed derived from the matrix.
    pub fn new(matrix: AnyMatrix, profile: Profile) -> Self {
        let width = input::matrix_width(&matrix);
        let seed = derive_seed(&matrix);
        SearchRequest {
            matrix,
            width,
            budget: Budget::for_profile(profile),
            requested_max_candidates: None,
            requested_synth_ms: None,
            seed,
            seed_given: false,
            program: None,
        }
    }

    /// The field of the matrix.
    pub fn field(&self) -> FieldKind {
        input::matrix_field(&self.matrix)
    }

    /// The `budget` member of the search output.
    pub fn budget_json(&self) -> Value {
        let mut v = serde_json::to_value(self.budget).expect("budget serializes");
        v["requested"] = json!({
            "maxCandidates": self.requested_max_candidates,
            "synthMs": self.requested_synth_ms,
        });
        v
    }
}

/// The seed used when none is given: 16 hex digits of
/// `sha256("cryptificate-search:" + canonical JSON of the matrix)`.
pub fn derive_seed(matrix: &AnyMatrix) -> String {
    let doc = json!({
        "field": input::matrix_field(matrix),
        "matrix": input::encode_matrix(matrix),
    });
    let h = sha256_hex(format!("cryptificate-search:{}", to_canonical_json(&doc)).as_bytes());
    h[..16].to_string()
}

/// Validates a search request:
///
/// ```json
/// { "field": "gf256", "width": 4, "matrix": [["02","03","01","01"], ...],
///   "profile": "quick", "seed": "c0ffee", "maxCandidates": 8, "synthMs": 10000,
///   "program": { ... optional user circuit ... } }
/// ```
///
/// `seed`, `maxCandidates`, `synthMs` and `program` are optional. Requested
/// limits can only lower the profile's limits.
pub fn parse_search_request(v: &Value) -> Result<SearchRequest> {
    let o = Obj::new(
        v,
        "",
        &[
            "field",
            "width",
            "matrix",
            "profile",
            "seed",
            "maxCandidates",
            "synthMs",
            "program",
        ],
    )?;
    let field = input::field_at(o.req("field")?, &o.path("field"))?;
    let width = input::width_at(o.req("width")?, &o.path("width"), field)?;
    let matrix = input::matrix_at(o.req("matrix")?, &o.path("matrix"), field, width)?;
    let profile = match o.opt("profile") {
        None => Profile::Quick,
        Some(p) => profile_at(p, &o.path("profile"))?,
    };
    let requested_max_candidates = o
        .opt("maxCandidates")
        .map(|x| input::u64_at(x, &o.path("maxCandidates")))
        .transpose()?;
    let requested_synth_ms = o
        .opt("synthMs")
        .map(|x| input::u64_at(x, &o.path("synthMs")))
        .transpose()?;
    let seed = o
        .opt("seed")
        .map(|s| input::seed_at(s, &o.path("seed")))
        .transpose()?;
    let program = o
        .opt("program")
        .map(|p| input::program_at(p, &o.path("program"), field, width))
        .transpose()?;
    let seed_given = seed.is_some();
    let seed = seed.unwrap_or_else(|| derive_seed(&matrix));
    Ok(SearchRequest {
        matrix,
        width,
        budget: Budget::limited(profile, requested_max_candidates, requested_synth_ms),
        requested_max_candidates,
        requested_synth_ms,
        seed,
        seed_given,
        program,
    })
}

fn profile_at(v: &Value, path: &str) -> Result<Profile> {
    match input::str_at(v, path)? {
        "quick" => Ok(Profile::Quick),
        "research" => Ok(Profile::Research),
        s => Err(ValidationError::new(
            ErrorCode::BadProfile,
            path,
            format!("unknown profile {s:?} (expected quick or research)"),
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn aes_request() -> Value {
        json!({
            "field": "gf256", "width": 4,
            "matrix": [["02","03","01","01"],["01","02","03","01"],["01","01","02","03"],["03","01","01","02"]],
            "profile": "quick", "seed": "C0FFEE", "maxCandidates": 400, "synthMs": 2000
        })
    }

    #[test]
    fn limits_are_clamped_to_the_profile() {
        let r = parse_search_request(&aes_request()).unwrap();
        assert_eq!(r.budget.max_candidates, 8);
        assert_eq!(r.budget.synth_ms, 2000);
        assert_eq!(r.budget.total_ms, 180_000);
        assert_eq!(r.budget.shortlist, 1);
        assert_eq!(r.seed, "c0ffee");
        assert!(r.seed_given);
        assert_eq!(r.requested_max_candidates, Some(400));
        let b = r.budget_json();
        assert_eq!(b["profile"], "quick");
        assert_eq!(b["requested"]["maxCandidates"], 400);
        let research = Budget::for_profile(Profile::Research);
        assert_eq!(
            (
                research.total_ms,
                research.max_candidates,
                research.synth_ms,
                research.shortlist
            ),
            (900_000, 64, 60_000, 3)
        );
    }

    #[test]
    fn derived_seed_is_stable() {
        let mut v = aes_request();
        v.as_object_mut().unwrap().remove("seed");
        let a = parse_search_request(&v).unwrap();
        let b = parse_search_request(&v).unwrap();
        assert_eq!(a.seed, b.seed);
        assert_eq!(a.seed.len(), 16);
        assert!(!a.seed_given);
    }

    #[test]
    fn bad_inputs_are_coded() {
        let mut v = aes_request();
        v["profile"] = json!("slow");
        assert_eq!(
            parse_search_request(&v).unwrap_err().code,
            ErrorCode::BadProfile
        );
        let mut v = aes_request();
        v["width"] = json!(5);
        assert_eq!(
            parse_search_request(&v).unwrap_err().code,
            ErrorCode::UnsupportedWidth
        );
        let mut v = aes_request();
        v["extra"] = json!(1);
        assert_eq!(
            parse_search_request(&v).unwrap_err().code,
            ErrorCode::UnknownField
        );
        let mut v = aes_request();
        v["matrix"][3][3] = json!("0x2");
        let e = parse_search_request(&v).unwrap_err();
        assert_eq!(
            (e.code, e.path.as_str()),
            (ErrorCode::InvalidByte, "/matrix/3/3")
        );
    }
}
