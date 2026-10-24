//! Small dense matrix helpers. Matrices are row-major and act on column
//! vectors: `y = M x`.

use crate::field::{Field, Gf256};

/// A row-major matrix.
pub type Matrix<F> = Vec<Vec<F>>;

/// The AES MixColumns matrix.
pub const AES_MIXCOLUMNS: [[u8; 4]; 4] = [
    [0x02, 0x03, 0x01, 0x01],
    [0x01, 0x02, 0x03, 0x01],
    [0x01, 0x01, 0x02, 0x03],
    [0x03, 0x01, 0x01, 0x02],
];

/// [`AES_MIXCOLUMNS`] as field elements.
pub fn aes_mixcolumns() -> Matrix<Gf256> {
    AES_MIXCOLUMNS
        .iter()
        .map(|row| row.iter().copied().map(Gf256).collect())
        .collect()
}

/// `M x`. Panics if a row of `m` and `x` differ in length.
pub fn mat_vec<F: Field>(m: &[Vec<F>], x: &[F]) -> Vec<F> {
    m.iter()
        .map(|row| {
            assert_eq!(row.len(), x.len(), "matrix row and vector differ in length");
            row.iter()
                .zip(x)
                .fold(F::zero(), |acc, (&a, &b)| acc + a * b)
        })
        .collect()
}

/// The `n x n` identity matrix.
pub fn identity<F: Field>(n: usize) -> Matrix<F> {
    (0..n)
        .map(|i| {
            (0..n)
                .map(|j| if i == j { F::one() } else { F::zero() })
                .collect()
        })
        .collect()
}

/// Number of nonzero entries.
pub fn weight<F: Field>(v: &[F]) -> usize {
    v.iter().filter(|x| !x.is_zero()).count()
}

/// The `i`-th standard basis vector of length `n`.
pub fn basis<F: Field>(n: usize, i: usize) -> Vec<F> {
    (0..n)
        .map(|j| if i == j { F::one() } else { F::zero() })
        .collect()
}

/// Canonical string encodings of a vector.
pub fn encode_vec<F: Field>(v: &[F]) -> Vec<String> {
    v.iter().map(Field::encode).collect()
}
