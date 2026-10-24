//! Candidate designs: the AES-like GF(2^8) profile and the HADES BN254 profile.
//!
//! These are the normalized, typed forms. Untrusted JSON goes through
//! [`crate::validate`], which produces these values or a
//! [`ValidationError`] with a JSON pointer.

use serde::{Deserialize, Serialize};

use crate::error::{pointer_push as at, ErrorCode, ValidationError};
use crate::field::{Bn254, Field, FieldKind, Gf256};
use crate::limits::{self, WidthStatus};
use crate::linalg::{aes_mixcolumns, Matrix};

/// JSON `model` value of the AES-like profile.
pub const MODEL_AES_LIKE: &str = "aes-like/gf256/v1";
/// JSON `model` value of the HADES profile.
pub const MODEL_HADES: &str = "hades/bn254/v1";

/// A candidate design, tagged by `model`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "model")]
pub enum CandidateDesign {
    #[serde(rename = "aes-like/gf256/v1")]
    AesLike(AesLikeDesign),
    #[serde(rename = "hades/bn254/v1")]
    Hades(HadesDesign),
}

impl CandidateDesign {
    /// The `model` string.
    pub fn model(&self) -> &'static str {
        match self {
            CandidateDesign::AesLike(_) => MODEL_AES_LIKE,
            CandidateDesign::Hades(_) => MODEL_HADES,
        }
    }

    /// The field the design is defined over.
    pub fn field(&self) -> FieldKind {
        match self {
            CandidateDesign::AesLike(_) => FieldKind::Gf256,
            CandidateDesign::Hades(_) => FieldKind::Bn254,
        }
    }

    /// The state width (column length for AES-like, state size for HADES).
    pub fn width(&self) -> usize {
        match self {
            CandidateDesign::AesLike(d) => d.width,
            CandidateDesign::Hades(d) => d.width,
        }
    }

    /// Sets derived members (the `experimental` flag).
    pub fn normalize(&mut self) {
        if let CandidateDesign::AesLike(d) = self {
            d.normalize();
        }
    }

    /// Checks every semantic rule; `base` is the JSON pointer of the design.
    pub fn check_at(&self, base: &str) -> Result<(), ValidationError> {
        match self {
            CandidateDesign::AesLike(d) => d.check_at(base),
            CandidateDesign::Hades(d) => d.check_at(base),
        }
    }

    /// The default analysis target for this model.
    pub fn default_target(&self) -> Target {
        match self {
            CandidateDesign::AesLike(_) => Target::Matrix,
            CandidateDesign::Hades(_) => Target::External,
        }
    }

    /// The matrix selected by `target`, or `None` if the model has no such matrix.
    pub fn target_matrix(&self, target: Target) -> Option<AnyMatrix> {
        match (self, target) {
            (CandidateDesign::AesLike(d), Target::Matrix) => Some(AnyMatrix::Gf256(d.matrix.clone())),
            (CandidateDesign::Hades(d), Target::External) => Some(AnyMatrix::Bn254(d.external.clone())),
            (CandidateDesign::Hades(d), Target::Internal) => Some(AnyMatrix::Bn254(d.internal.clone())),
            _ => None,
        }
    }
}

/// Which matrix of the design a program must implement.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Target {
    /// The AES-like mixing matrix.
    Matrix,
    /// The HADES external (full-round) matrix.
    External,
    /// The HADES internal (partial-round) matrix.
    Internal,
}

impl Target {
    pub const fn as_str(self) -> &'static str {
        match self {
            Target::Matrix => "matrix",
            Target::External => "external",
            Target::Internal => "internal",
        }
    }
}

/// A matrix over either field.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum AnyMatrix {
    Gf256(Matrix<Gf256>),
    Bn254(Matrix<Bn254>),
}

/// The AES-like GF(2^8) profile: MixColumns-style matrix, ShiftRows-style
/// row offsets, round count and byte S-box.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AesLikeDesign {
    pub field: FieldKind,
    pub width: usize,
    pub matrix: Matrix<Gf256>,
    /// Row `r` of the state is rotated so that `out[r][c] = in[r][(c + offsets[r]) mod width]`.
    pub offsets: Vec<usize>,
    pub rounds: u32,
    pub sbox: SboxSpec,
    /// Set by normalization when `width` is below the supported width.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub experimental: bool,
}

impl AesLikeDesign {
    /// AES itself: MixColumns, ShiftRows offsets `0 1 2 3`, the AES S-box.
    pub fn aes(rounds: u32) -> Self {
        AesLikeDesign {
            field: FieldKind::Gf256,
            width: 4,
            matrix: aes_mixcolumns(),
            offsets: vec![0, 1, 2, 3],
            rounds,
            sbox: SboxSpec::Aes,
            experimental: false,
        }
    }

    /// Sets `experimental` from the width.
    pub fn normalize(&mut self) {
        self.experimental =
            limits::width_status(FieldKind::Gf256, self.width) == Some(WidthStatus::Experimental);
    }

    /// Checks every semantic rule; `base` is the JSON pointer of the design.
    pub fn check_at(&self, base: &str) -> Result<(), ValidationError> {
        if self.field != FieldKind::Gf256 {
            return Err(ValidationError::new(
                ErrorCode::FieldMismatch,
                at(base, "field"),
                format!("model {MODEL_AES_LIKE} requires field \"gf256\""),
            ));
        }
        let w = self.width;
        match limits::width_status(FieldKind::Gf256, w) {
            Some(WidthStatus::Supported) => {}
            Some(WidthStatus::Experimental) if self.experimental => {}
            Some(WidthStatus::Experimental) => {
                return Err(ValidationError::new(
                    ErrorCode::UnsupportedWidth,
                    at(base, "width"),
                    format!("width {w} is experimental and must be marked \"experimental\": true"),
                ))
            }
            None => {
                return Err(ValidationError::new(
                    ErrorCode::UnsupportedWidth,
                    at(base, "width"),
                    format!(
                        "width {w} is not supported (use {}; {}..{} are experimental)",
                        limits::GF256_WIDTH,
                        limits::GF256_MIN_EXPERIMENTAL_WIDTH,
                        limits::GF256_WIDTH - 1
                    ),
                ))
            }
        }
        check_square(&self.matrix, w, &at(base, "matrix"))?;
        let offsets_path = at(base, "offsets");
        if self.offsets.len() != w {
            return Err(ValidationError::new(
                ErrorCode::BadDimension,
                offsets_path,
                format!("expected {w} offsets, got {}", self.offsets.len()),
            ));
        }
        for (r, &o) in self.offsets.iter().enumerate() {
            if o >= w {
                return Err(ValidationError::new(
                    ErrorCode::OffsetOutOfRange,
                    at(&offsets_path, r),
                    format!("offset {o} is not in 0..{}", w - 1),
                ));
            }
        }
        if !(limits::MIN_ROUNDS..=limits::MAX_ROUNDS).contains(&self.rounds) {
            return Err(ValidationError::new(
                ErrorCode::RoundsOutOfRange,
                at(base, "rounds"),
                format!(
                    "rounds must be in {}..{}, got {}",
                    limits::MIN_ROUNDS,
                    limits::MAX_ROUNDS,
                    self.rounds
                ),
            ));
        }
        let sbox_path = at(base, "sbox");
        match &self.sbox {
            SboxSpec::Aes => {}
            SboxSpec::Table { table } => {
                if table.len() != limits::SBOX_TABLE_LEN {
                    return Err(ValidationError::new(
                        ErrorCode::BadDimension,
                        at(&sbox_path, "table"),
                        format!(
                            "an S-box table has {} entries, got {}",
                            limits::SBOX_TABLE_LEN,
                            table.len()
                        ),
                    ));
                }
            }
            SboxSpec::Power { .. } => {
                return Err(ValidationError::new(
                    ErrorCode::BadSboxKind,
                    at(&sbox_path, "kind"),
                    "model aes-like/gf256/v1 accepts S-box kinds \"aes\" and \"table\"",
                ))
            }
        }
        Ok(())
    }

    /// The 256-entry S-box table (the AES S-box for `{"kind":"aes"}`).
    /// Returns `None` for a power S-box, which this model does not allow.
    pub fn sbox_table(&self) -> Option<Vec<Gf256>> {
        match &self.sbox {
            SboxSpec::Aes => Some(aes_sbox().iter().copied().map(Gf256).collect()),
            SboxSpec::Table { table } => Some(table.clone()),
            SboxSpec::Power { .. } => None,
        }
    }
}

/// The HADES BN254 profile (Poseidon2-style permutation).
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HadesDesign {
    pub field: FieldKind,
    pub width: usize,
    /// Linear layer of the full rounds.
    pub external: Matrix<Bn254>,
    /// Linear layer of the partial rounds.
    pub internal: Matrix<Bn254>,
    /// Full rounds, split evenly before and after the partial rounds.
    pub full_rounds: u32,
    pub partial_rounds: u32,
    pub sbox: SboxSpec,
    /// Which state positions pass through the S-box in a partial round.
    pub partial_mask: Vec<bool>,
    pub constants: ConstantsSpec,
}

impl HadesDesign {
    /// The Poseidon2-style reference: external `[[2,1,1],[1,2,1],[1,1,2]]`,
    /// internal `[[2,1,1],[1,2,1],[1,1,3]]`, 8 full and 56 partial rounds,
    /// `x^5`, S-box on coordinate 0 in partial rounds, reference constants.
    pub fn poseidon2_reference() -> Self {
        let m = |rows: [[u64; 3]; 3]| -> Matrix<Bn254> {
            rows.iter()
                .map(|r| r.iter().map(|&v| Bn254::from_u64(v)).collect())
                .collect()
        };
        HadesDesign {
            field: FieldKind::Bn254,
            width: 3,
            external: m([[2, 1, 1], [1, 2, 1], [1, 1, 2]]),
            internal: m([[2, 1, 1], [1, 2, 1], [1, 1, 3]]),
            full_rounds: 8,
            partial_rounds: 56,
            sbox: SboxSpec::Power { exponent: 5 },
            partial_mask: vec![true, false, false],
            constants: ConstantsSpec::Reference,
        }
    }

    /// The default partial-round mask: S-box on coordinate 0 only.
    pub fn default_partial_mask(width: usize) -> Vec<bool> {
        (0..width).map(|i| i == 0).collect()
    }

    /// Total number of rounds.
    pub fn total_rounds(&self) -> u32 {
        self.full_rounds.saturating_add(self.partial_rounds)
    }

    /// The power S-box exponent (always present in a checked design).
    pub fn exponent(&self) -> Option<u32> {
        match self.sbox {
            SboxSpec::Power { exponent } => Some(exponent),
            _ => None,
        }
    }

    /// Checks every semantic rule; `base` is the JSON pointer of the design.
    pub fn check_at(&self, base: &str) -> Result<(), ValidationError> {
        if self.field != FieldKind::Bn254 {
            return Err(ValidationError::new(
                ErrorCode::FieldMismatch,
                at(base, "field"),
                format!("model {MODEL_HADES} requires field \"bn254\""),
            ));
        }
        let w = self.width;
        if limits::width_status(FieldKind::Bn254, w).is_none() {
            return Err(ValidationError::new(
                ErrorCode::UnsupportedWidth,
                at(base, "width"),
                format!("width {w} is not supported (use {})", limits::BN254_WIDTH),
            ));
        }
        check_square(&self.external, w, &at(base, "external"))?;
        check_square(&self.internal, w, &at(base, "internal"))?;
        if !self.full_rounds.is_multiple_of(2) {
            return Err(ValidationError::new(
                ErrorCode::FullRoundsOdd,
                at(base, "fullRounds"),
                format!(
                    "fullRounds must be even (half before, half after the partial rounds), got {}",
                    self.full_rounds
                ),
            ));
        }
        if self.full_rounds < limits::MIN_FULL_ROUNDS {
            return Err(ValidationError::new(
                ErrorCode::RoundsOutOfRange,
                at(base, "fullRounds"),
                format!("fullRounds must be at least {}", limits::MIN_FULL_ROUNDS),
            ));
        }
        if self.full_rounds.checked_add(self.partial_rounds).is_none_or(|t| t > limits::MAX_HADES_ROUNDS) {
            return Err(ValidationError::new(
                ErrorCode::RoundsOutOfRange,
                at(base, "partialRounds"),
                format!(
                    "fullRounds + partialRounds must be at most {}, got {} + {}",
                    limits::MAX_HADES_ROUNDS,
                    self.full_rounds,
                    self.partial_rounds
                ),
            ));
        }
        let sbox_path = at(base, "sbox");
        match self.sbox {
            SboxSpec::Power { exponent } => {
                if !(limits::MIN_EXPONENT..=limits::MAX_EXPONENT).contains(&exponent) {
                    return Err(ValidationError::new(
                        ErrorCode::ExponentOutOfRange,
                        at(&sbox_path, "exponent"),
                        format!(
                            "exponent must be in {}..{}, got {exponent}",
                            limits::MIN_EXPONENT,
                            limits::MAX_EXPONENT
                        ),
                    ));
                }
            }
            _ => {
                return Err(ValidationError::new(
                    ErrorCode::BadSboxKind,
                    at(&sbox_path, "kind"),
                    "model hades/bn254/v1 accepts S-box kind \"power\" only",
                ))
            }
        }
        let mask_path = at(base, "partialMask");
        if self.partial_mask.len() != w {
            return Err(ValidationError::new(
                ErrorCode::BadDimension,
                mask_path,
                format!("expected {w} mask entries, got {}", self.partial_mask.len()),
            ));
        }
        if !self.partial_mask.iter().any(|&b| b) {
            return Err(ValidationError::new(
                ErrorCode::BadPartialMask,
                mask_path,
                "partialMask must select at least one position",
            ));
        }
        if let ConstantsSpec::Explicit { values } = &self.constants {
            let values_path = at(&at(base, "constants"), "values");
            let expected = self.full_rounds as usize + self.partial_rounds as usize;
            if values.len() != expected {
                return Err(ValidationError::new(
                    ErrorCode::ConstantsLengthMismatch,
                    values_path,
                    format!(
                        "expected one constant vector per round ({expected}), got {}",
                        values.len()
                    ),
                ));
            }
            for (i, row) in values.iter().enumerate() {
                if row.len() != w {
                    return Err(ValidationError::new(
                        ErrorCode::BadDimension,
                        at(&values_path, i),
                        format!("expected {w} constants, got {}", row.len()),
                    ));
                }
            }
        }
        Ok(())
    }
}

fn check_square<F>(m: &[Vec<F>], w: usize, path: &str) -> Result<(), ValidationError> {
    if m.len() != w {
        return Err(ValidationError::new(
            ErrorCode::BadDimension,
            path,
            format!("expected {w} rows, got {}", m.len()),
        ));
    }
    for (i, row) in m.iter().enumerate() {
        if row.len() != w {
            return Err(ValidationError::new(
                ErrorCode::BadDimension,
                at(path, i),
                format!("expected {w} entries in row {i}, got {}", row.len()),
            ));
        }
    }
    Ok(())
}

/// The S-box of a design, tagged by `kind`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase", deny_unknown_fields)]
pub enum SboxSpec {
    /// The AES S-box (AES-like model only).
    Aes,
    /// An explicit 256-entry byte table (AES-like model only).
    Table { table: Vec<Gf256> },
    /// `x -> x^exponent` (HADES model only).
    Power { exponent: u32 },
}

/// HADES round constants, tagged by `kind`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase", deny_unknown_fields)]
pub enum ConstantsSpec {
    /// The reference constants of the profile.
    Reference,
    /// One `width`-vector per round, `fullRounds + partialRounds` in total.
    Explicit { values: Vec<Vec<Bn254>> },
}

/// The AES S-box, computed from its definition (inverse in GF(2^8) followed
/// by the affine map with constant 0x63).
pub fn aes_sbox() -> &'static [u8; 256] {
    static TABLE: std::sync::OnceLock<[u8; 256]> = std::sync::OnceLock::new();
    TABLE.get_or_init(|| {
        let mut t = [0u8; 256];
        for (x, slot) in t.iter_mut().enumerate() {
            let inv = Gf256(x as u8).inverse().map_or(0, |g| g.0);
            let mut y = 0x63u8;
            for shift in 0..5 {
                y ^= inv.rotate_left(shift);
            }
            *slot = y;
        }
        t
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn aes_sbox_known_values() {
        let s = aes_sbox();
        assert_eq!(s[0x00], 0x63);
        assert_eq!(s[0x01], 0x7C);
        assert_eq!(s[0x53], 0xED);
        assert_eq!(s[0xFF], 0x16);
        let mut seen = [false; 256];
        for &y in s.iter() {
            assert!(!seen[y as usize]);
            seen[y as usize] = true;
        }
    }

    #[test]
    fn reference_designs_check() {
        CandidateDesign::AesLike(AesLikeDesign::aes(10)).check_at("").unwrap();
        CandidateDesign::Hades(HadesDesign::poseidon2_reference()).check_at("").unwrap();
    }
}
