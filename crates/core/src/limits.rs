//! Input limits enforced by validation.

/// The supported (non-experimental) width of an AES-like GF(2^8) design.
pub const GF256_WIDTH: usize = 4;

/// The smallest GF(2^8) width accepted at all. Widths below
/// [`GF256_WIDTH`] are accepted but marked `"experimental": true` in the
/// normalized design.
pub const GF256_MIN_EXPERIMENTAL_WIDTH: usize = 2;

/// The only supported width of a HADES BN254 design.
pub const BN254_WIDTH: usize = 3;

/// Inclusive bounds on the AES-like round count.
pub const MIN_ROUNDS: u32 = 4;
/// See [`MIN_ROUNDS`].
pub const MAX_ROUNDS: u32 = 32;

/// The smallest HADES full round count (one before and one after the partial rounds).
pub const MIN_FULL_ROUNDS: u32 = 2;

/// Upper bound on `fullRounds + partialRounds` for HADES designs.
pub const MAX_HADES_ROUNDS: u32 = 160;

/// Inclusive bounds on the power S-box exponent.
pub const MIN_EXPONENT: u32 = 1;
/// See [`MIN_EXPONENT`].
pub const MAX_EXPONENT: u32 = 65535;

/// Maximum number of instructions in a program.
pub const MAX_INSTRUCTIONS: usize = 256;

/// Number of entries in an explicit S-box table.
pub const SBOX_TABLE_LEN: usize = 256;

/// Maximum length, in characters, of a program name.
pub const MAX_NAME_CHARS: usize = 128;

/// Maximum number of hex digits in an experiment seed.
pub const MAX_SEED_HEX_DIGITS: usize = 64;

/// Whether `width` is accepted for a field, and whether it is experimental.
pub fn width_status(field: crate::FieldKind, width: usize) -> Option<WidthStatus> {
    match field {
        crate::FieldKind::Gf256 if width == GF256_WIDTH => Some(WidthStatus::Supported),
        crate::FieldKind::Gf256 if (GF256_MIN_EXPERIMENTAL_WIDTH..GF256_WIDTH).contains(&width) => {
            Some(WidthStatus::Experimental)
        }
        crate::FieldKind::Bn254 if width == BN254_WIDTH => Some(WidthStatus::Supported),
        _ => None,
    }
}

/// Classification of an accepted width.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WidthStatus {
    Supported,
    Experimental,
}
