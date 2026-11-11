//! Input limits enforced by validation.

/// The supported (non-experimental) width of an AES-like GF(2^8) design.
pub const GF256_WIDTH: usize = 4;

/// The smallest GF(2^8) width accepted at all. Widths below
/// [`GF256_WIDTH`] are accepted but marked `"experimental": true` in the
/// normalized design.
pub const GF256_MIN_EXPERIMENTAL_WIDTH: usize = 2;

/// The only supported width of a HADES BN254 design.
pub const BN254_WIDTH: usize = 3;

/// The supported widths of a HADES design over a 64-bit prime field
/// (`hades/prime/v1`): the Poseidon2 widths 2, 3, 4, 8, 12, 16 and 24.
pub const PRIME_WIDTHS: [usize; 7] = [2, 3, 4, 8, 12, 16, 24];

/// The largest width whose matrices are checked for MDS by enumerating
/// their square minors. A wider external matrix is checked for the Poseidon2
/// structure `circ(2 M4, M4, ..., M4)` and for invertibility instead.
pub const MAX_MINOR_WIDTH: usize = 4;

/// The largest order of the square submatrices searched for a singular one
/// in a matrix wider than [`MAX_MINOR_WIDTH`]. A singular submatrix of order
/// `s` gives a nonzero input of weight at most `s` whose image is zero on `s`
/// coordinates, which refutes the MDS property; the Poseidon2 external
/// matrix `circ(2 M4, M4, ..., M4)` of width 8 or more always has a singular
/// `2 x 2` submatrix (rows 0 and 1, columns 0 and 4).
pub const WIDE_WITNESS_ORDER: usize = 2;

/// Whether a prime-field width is checked with inverse witnesses and packed
/// arithmetic (every width but 3 and 4, whose certificates use explicit
/// determinant formulas).
pub fn prime_width_is_packed(width: usize) -> bool {
    width != 3 && width != 4
}

/// Whether a prime-field width is above [`MAX_MINOR_WIDTH`].
pub fn prime_width_is_wide(width: usize) -> bool {
    width > MAX_MINOR_WIDTH
}

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
        f if f.is_prime64() && PRIME_WIDTHS.contains(&width) => Some(WidthStatus::Supported),
        _ => None,
    }
}

/// Classification of an accepted width.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WidthStatus {
    Supported,
    Experimental,
}
