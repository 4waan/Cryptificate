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

/// All `k`-element subsets of `0..n`, each in increasing order, listed in
/// lexicographic order (`[0,1]`, `[0,2]`, …, `[n-2,n-1]` for `k = 2`).
pub fn combinations(n: usize, k: usize) -> Vec<Vec<usize>> {
    let mut out = Vec::new();
    if k > n {
        return out;
    }
    let mut current: Vec<usize> = (0..k).collect();
    loop {
        out.push(current.clone());
        // Find the rightmost position that can still be incremented.
        let Some(i) = (0..k).rev().find(|&i| current[i] < n - k + i) else {
            return out;
        };
        current[i] += 1;
        for j in i + 1..k {
            current[j] = current[j - 1] + 1;
        }
    }
}

/// The submatrix of `m` on the given rows and columns, in the order given.
pub fn submatrix<F: Field>(m: &[Vec<F>], rows: &[usize], cols: &[usize]) -> Matrix<F> {
    rows.iter()
        .map(|&r| cols.iter().map(|&c| m[r][c]).collect())
        .collect()
}

/// `row -= factor * pivot_row`, entry by entry.
fn subtract_scaled<F: Field>(row: &mut [F], factor: F, pivot_row: &[F]) {
    for (x, &p) in row.iter_mut().zip(pivot_row) {
        *x = *x - factor * p;
    }
}

/// Reduced row echelon form of `m`, computed in place, and the pivot
/// column of each nonzero row. Pivots are the first nonzero entry found
/// scanning rows downwards, so the result is deterministic.
fn row_reduce<F: Field>(m: &mut [Vec<F>]) -> Vec<usize> {
    let rows = m.len();
    let cols = m.first().map_or(0, Vec::len);
    let mut pivots = Vec::new();
    let mut r = 0;
    for c in 0..cols {
        if r == rows {
            break;
        }
        let Some(p) = (r..rows).find(|&i| !m[i][c].is_zero()) else {
            continue;
        };
        m.swap(r, p);
        let inv = m[r][c].inverse().expect("pivot is nonzero");
        for x in m[r].iter_mut() {
            *x = *x * inv;
        }
        let pivot_row = m[r].clone();
        for (i, row) in m.iter_mut().enumerate() {
            let factor = row[c];
            if i != r && !factor.is_zero() {
                subtract_scaled(row, factor, &pivot_row);
            }
        }
        pivots.push(c);
        r += 1;
    }
    pivots
}

/// The determinant of a square matrix, by Gaussian elimination.
///
/// Panics if `m` is not square. The empty matrix has determinant one.
pub fn determinant<F: Field>(m: &[Vec<F>]) -> F {
    let n = m.len();
    assert!(
        m.iter().all(|row| row.len() == n),
        "determinant of a non-square matrix"
    );
    let mut a: Matrix<F> = m.to_vec();
    let mut det = F::one();
    for c in 0..n {
        let Some(p) = (c..n).find(|&i| !a[i][c].is_zero()) else {
            return F::zero();
        };
        if p != c {
            a.swap(p, c);
            det = -det;
        }
        let pivot = a[c][c];
        det = det * pivot;
        let inv = pivot.inverse().expect("pivot is nonzero");
        let pivot_row = a[c].clone();
        for row in a.iter_mut().skip(c + 1) {
            if !row[c].is_zero() {
                let factor = row[c] * inv;
                subtract_scaled(row, factor, &pivot_row);
            }
        }
    }
    det
}

/// A nonzero vector `x` with `m x = 0`, or `None` if the columns of `m` are
/// linearly independent.
///
/// The vector is the one the reduced row echelon form gives for the first
/// free column: that coordinate is one, the other free coordinates are zero,
/// and the pivot coordinates are solved for. Equal inputs give equal outputs.
pub fn kernel_vector<F: Field>(m: &[Vec<F>]) -> Option<Vec<F>> {
    let cols = m.first().map_or(0, Vec::len);
    let mut a: Matrix<F> = m.to_vec();
    let pivots = row_reduce(&mut a);
    let free = (0..cols).find(|c| !pivots.contains(c))?;
    let mut x = vec![F::zero(); cols];
    x[free] = F::one();
    for (row, &p) in pivots.iter().enumerate() {
        x[p] = -a[row][free];
    }
    Some(x)
}

/// The inverse of a square matrix, or `None` when it is singular.
///
/// Gauss-Jordan elimination on `[m | I]`. Equal inputs give equal outputs.
pub fn inverse<F: Field>(m: &[Vec<F>]) -> Option<Matrix<F>> {
    let n = m.len();
    let mut a: Matrix<F> = m
        .iter()
        .enumerate()
        .map(|(i, row)| {
            let mut r = row.clone();
            r.extend((0..n).map(|j| if i == j { F::one() } else { F::zero() }));
            r
        })
        .collect();
    for c in 0..n {
        let p = (c..n).find(|&r| !a[r][c].is_zero())?;
        a.swap(c, p);
        let inv = a[c][c].inverse().expect("nonzero pivot");
        for x in a[c].iter_mut() {
            *x = *x * inv;
        }
        let pivot = a[c].clone();
        for (r, row) in a.iter_mut().enumerate() {
            if r != c && !row[c].is_zero() {
                let f = row[c];
                for (x, &y) in row.iter_mut().zip(&pivot) {
                    *x = *x - f * y;
                }
            }
        }
    }
    Some(a.into_iter().map(|row| row[n..].to_vec()).collect())
}

/// `x M` for a row vector `x`. Panics if `x` and the rows of `m` differ in
/// number.
pub fn vec_mat<F: Field>(x: &[F], m: &[Vec<F>]) -> Vec<F> {
    assert_eq!(x.len(), m.len(), "vector and matrix rows differ in number");
    let cols = m.first().map_or(0, Vec::len);
    (0..cols)
        .map(|c| {
            x.iter()
                .zip(m)
                .fold(F::zero(), |acc, (&a, row)| acc + a * row[c])
        })
        .collect()
}

/// The rank of `m`.
pub fn rank<F: Field>(m: &[Vec<F>]) -> usize {
    let mut a: Matrix<F> = m.to_vec();
    row_reduce(&mut a).len()
}

/// A basis of the null space `{x : m x = 0}` of a matrix with `cols`
/// columns (`cols` is needed when `m` has no rows).
///
/// One vector per free column of the reduced row echelon form, in
/// increasing column order: that coordinate is one, the other free
/// coordinates are zero, and the pivot coordinates are solved for. The
/// first vector is [`kernel_vector`]'s.
pub fn nullspace_basis<F: Field>(m: &[Vec<F>], cols: usize) -> Vec<Vec<F>> {
    let mut a: Matrix<F> = m.to_vec();
    let pivots = row_reduce(&mut a);
    (0..cols)
        .filter(|c| !pivots.contains(c))
        .map(|free| {
            let mut x = vec![F::zero(); cols];
            x[free] = F::one();
            for (row, &p) in pivots.iter().enumerate() {
                x[p] = -a[row][free];
            }
            x
        })
        .collect()
}

/// Coefficients `c` with `sum_k c[k] * basis[k] = u`, or `None` when `u` is
/// not in the span of `basis`. The basis vectors must be linearly
/// independent.
pub fn coordinates<F: Field>(basis: &[Vec<F>], u: &[F]) -> Option<Vec<F>> {
    let n = u.len();
    // Columns: the basis vectors, then u. A kernel vector with last
    // coordinate one gives sum_k x[k] basis[k] + u = 0.
    let m: Matrix<F> = (0..n)
        .map(|i| {
            basis
                .iter()
                .map(|b| b[i])
                .chain(std::iter::once(u[i]))
                .collect()
        })
        .collect();
    let k = basis.len();
    nullspace_basis(&m, k + 1)
        .into_iter()
        .find(|x| !x[k].is_zero())
        .map(|x| {
            let inv = x[k].inverse().expect("nonzero");
            x[..k].iter().map(|&c| -(c * inv)).collect()
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::field::Bn254;

    fn bn(rows: &[&[u64]]) -> Matrix<Bn254> {
        rows.iter()
            .map(|r| r.iter().map(|&v| Bn254::from_u64(v)).collect())
            .collect()
    }

    #[test]
    fn combinations_are_lexicographic() {
        assert_eq!(
            combinations(4, 2),
            vec![
                vec![0, 1],
                vec![0, 2],
                vec![0, 3],
                vec![1, 2],
                vec![1, 3],
                vec![2, 3]
            ]
        );
        assert_eq!(combinations(3, 3), vec![vec![0, 1, 2]]);
        assert_eq!(combinations(3, 0), vec![Vec::<usize>::new()]);
        assert!(combinations(2, 3).is_empty());
        let counts: Vec<usize> = (1..=4).map(|k| combinations(4, k).len()).collect();
        assert_eq!(counts, vec![4, 6, 4, 1]);
    }

    #[test]
    fn determinant_small_cases() {
        // [[2,1,1],[1,2,1],[1,1,2]] has determinant 4; the internal
        // Poseidon2-style matrix [[2,1,1],[1,2,1],[1,1,3]] has 7.
        assert_eq!(
            determinant(&bn(&[&[2, 1, 1], &[1, 2, 1], &[1, 1, 2]])),
            Bn254::from_u64(4)
        );
        assert_eq!(
            determinant(&bn(&[&[2, 1, 1], &[1, 2, 1], &[1, 1, 3]])),
            Bn254::from_u64(7)
        );
        // A row swap flips the sign.
        assert_eq!(determinant(&bn(&[&[0, 1], &[1, 0]])), -Bn254::one());
        assert_eq!(determinant(&bn(&[&[1, 2], &[2, 4]])), Bn254::zero());
    }

    /// The Leibniz expansion, as an independent reference for small sizes.
    fn leibniz<F: Field>(m: &[Vec<F>]) -> F {
        fn perms(n: usize) -> Vec<Vec<usize>> {
            if n == 0 {
                return vec![vec![]];
            }
            let mut out = Vec::new();
            for p in perms(n - 1) {
                for i in 0..n {
                    let mut q = p.clone();
                    q.insert(i, n - 1);
                    out.push(q);
                }
            }
            out
        }
        let n = m.len();
        perms(n).into_iter().fold(F::zero(), |acc, p| {
            let inversions = (0..n)
                .flat_map(|i| (i + 1..n).map(move |j| (i, j)))
                .filter(|&(i, j)| p[i] > p[j])
                .count();
            let term = (0..n).fold(F::one(), |t, i| t * m[i][p[i]]);
            if inversions % 2 == 0 {
                acc + term
            } else {
                acc - term
            }
        })
    }

    #[test]
    fn determinant_matches_leibniz() {
        let mut state = 0x2545_F491_4F6C_DD1Du64;
        let mut next = move || {
            state ^= state << 13;
            state ^= state >> 7;
            state ^= state << 17;
            state
        };
        for n in 1..=4 {
            for round in 0..200 {
                // Mix in sparse matrices so that singular cases occur.
                let sparse = round % 3 == 0;
                let g: Matrix<Gf256> = (0..n)
                    .map(|_| {
                        (0..n)
                            .map(|_| {
                                let v = next();
                                Gf256(if sparse && v % 2 == 0 {
                                    0
                                } else {
                                    (v >> 8) as u8
                                })
                            })
                            .collect()
                    })
                    .collect();
                assert_eq!(determinant(&g), leibniz(&g), "{g:?}");
                let b: Matrix<Bn254> = (0..n)
                    .map(|_| (0..n).map(|_| Bn254::from_u64(next() % 5)).collect())
                    .collect();
                assert_eq!(determinant(&b), leibniz(&b), "{b:?}");
            }
        }
        assert_eq!(
            determinant::<Gf256>(&aes_mixcolumns()),
            leibniz(&aes_mixcolumns())
        );
    }

    #[test]
    fn inverses() {
        let m = bn(&[&[2, 1, 1], &[1, 2, 1], &[1, 1, 3]]);
        let w = inverse(&m).expect("invertible");
        let id: Matrix<Bn254> = identity(3);
        let prod: Matrix<Bn254> = (0..3)
            .map(|i| {
                (0..3)
                    .map(|j| (0..3).fold(Bn254::zero(), |acc, k| acc + m[i][k] * w[k][j]))
                    .collect()
            })
            .collect();
        assert_eq!(prod, id);
        assert!(inverse(&bn(&[&[1, 2], &[2, 4]])).is_none());
    }

    #[test]
    fn kernel_vectors() {
        assert_eq!(kernel_vector(&bn(&[&[1, 0], &[0, 1]])), None);
        let m = bn(&[&[1, 2], &[2, 4]]);
        let x = kernel_vector(&m).unwrap();
        assert_eq!(x, vec![-Bn254::from_u64(2), Bn254::one()]);
        assert!(mat_vec(&m, &x).iter().all(Field::is_zero));
        // A zero column is the first free column.
        let z = bn(&[&[0, 1, 1]]);
        assert_eq!(
            kernel_vector(&z).unwrap(),
            vec![Bn254::one(), Bn254::zero(), Bn254::zero()]
        );
    }

    #[test]
    fn rank_nullspace_and_coordinates() {
        let m = bn(&[&[1, 0, 0], &[2, 1, 1], &[6, 5, 5]]);
        assert_eq!(rank(&m), 2);
        let basis = nullspace_basis(&m, 3);
        assert_eq!(basis.len(), 1);
        assert_eq!(basis[0], vec![Bn254::zero(), -Bn254::one(), Bn254::one()]);
        assert_eq!(Some(basis[0].clone()), kernel_vector(&m));
        assert_eq!(nullspace_basis::<Bn254>(&[], 2).len(), 2);
        assert_eq!(rank(&bn(&[&[2, 1, 1], &[1, 2, 1], &[1, 1, 3]])), 3);
        // [1, 2] M for M = [[1, 2], [3, 4]] is [7, 10].
        assert_eq!(
            vec_mat(
                &[Bn254::from_u64(1), Bn254::from_u64(2)],
                &bn(&[&[1, 2], &[3, 4]])
            ),
            vec![Bn254::from_u64(7), Bn254::from_u64(10)]
        );
        let b = vec![
            vec![Bn254::zero(), Bn254::one(), Bn254::zero()],
            vec![Bn254::zero(), Bn254::zero(), Bn254::one()],
        ];
        let u = vec![Bn254::zero(), Bn254::from_u64(2), Bn254::from_u64(3)];
        assert_eq!(
            coordinates(&b, &u),
            Some(vec![Bn254::from_u64(2), Bn254::from_u64(3)])
        );
        assert_eq!(
            coordinates(&b, &[Bn254::one(), Bn254::zero(), Bn254::zero()]),
            None
        );
    }
}
