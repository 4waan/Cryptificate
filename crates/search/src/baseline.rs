//! Baseline circuits that search candidates are compared against.
//!
//! * The direct primitive construction of any matrix (no shared sums).
//! * Known circuits for known matrices: the AES MixColumns shared-sum
//!   circuit (4 xtime + 15 XOR) and the Poseidon2 width-3 external matrix
//!   circuit (`s = x0 + x1 + x2`, `y_i = s + x_i`).
//! * The user's own circuit, when it computes the target matrix.

use cryptificate_core::linalg::{aes_mixcolumns, Matrix};
use cryptificate_core::{Bn254, Field, FieldKind, Gf256, Instruction, Program};

use crate::expr::primitive_bound;

/// Name of the direct primitive baseline program.
pub const DIRECT_NAME: &str = "direct-primitive";
/// Name of the known AES MixColumns program.
pub const AES_SHARED_SUM_NAME: &str = "aes-shared-sum";
/// Name of the known Poseidon2 width-3 external matrix program.
pub const BN254_SHARED_SUM_NAME: &str = "bn254-shared-sum";

struct Builder<F> {
    width: usize,
    instructions: Vec<Instruction<F>>,
}

impl<F: Field> Builder<F> {
    fn push(&mut self, ins: Instruction<F>) -> usize {
        self.instructions.push(ins);
        self.width + self.instructions.len() - 1
    }

    /// Left-to-right sum of `terms`, or a zero register.
    fn fold(&mut self, terms: &[usize]) -> usize {
        match terms.split_first() {
            None => self.push(Instruction::Mul { k: F::zero(), a: 0 }),
            Some((&first, rest)) => rest.iter().fold(first, |acc, &t| {
                self.push(Instruction::Add { a: acc, b: t })
            }),
        }
    }
}

/// The primitive construction over GF(2^8) without shared sums: each input
/// is multiplied by `02^b` through an xtime chain (once per input, up to the
/// highest bit used in its column), and each output adds its terms left to
/// right.
///
/// # Panics
///
/// If the result exceeds [`primitive_bound`] (152 operations for 4x4), which
/// would be a bug in the construction.
pub fn direct_gf256(m: &Matrix<Gf256>) -> Program<Gf256> {
    let w = m.len();
    let mut b = Builder {
        width: w,
        instructions: Vec::new(),
    };
    let mut chains: Vec<Vec<usize>> = Vec::with_capacity(w);
    for j in 0..w {
        let top = m
            .iter()
            .map(|row| 8 - row[j].0.leading_zeros())
            .max()
            .unwrap_or(0)
            .saturating_sub(1);
        let mut chain = vec![j];
        for _ in 0..top {
            let prev = *chain.last().expect("chain starts with the input");
            chain.push(b.push(Instruction::Mul {
                k: Gf256(0x02),
                a: prev,
            }));
        }
        chains.push(chain);
    }
    let outputs = m
        .iter()
        .map(|row| {
            let terms: Vec<usize> = row
                .iter()
                .enumerate()
                .flat_map(|(j, k)| {
                    let chain = &chains[j];
                    (0..8u32)
                        .filter(move |bit| (k.0 >> bit) & 1 == 1)
                        .map(move |bit| chain[bit as usize])
                })
                .collect();
            b.fold(&terms)
        })
        .collect();
    let p = Program {
        width: w,
        name: Some(DIRECT_NAME.into()),
        instructions: b.instructions,
        outputs,
    };
    assert!(
        p.instructions.len() <= primitive_bound(FieldKind::Gf256, w),
        "primitive construction exceeded its bound"
    );
    p
}

/// The direct construction over BN254: each output adds `k * x_j` over the
/// nonzero coefficients left to right (no multiplication for `k = 1`).
///
/// # Panics
///
/// If the result exceeds [`primitive_bound`], which would be a bug.
pub fn direct_bn254(m: &Matrix<Bn254>) -> Program<Bn254> {
    let w = m.len();
    let mut b = Builder {
        width: w,
        instructions: Vec::new(),
    };
    let outputs = m
        .iter()
        .map(|row| {
            let mut terms = Vec::new();
            for (j, &k) in row.iter().enumerate() {
                if k.is_zero() {
                    continue;
                }
                terms.push(if k.is_one() {
                    j
                } else {
                    b.push(Instruction::Mul { k, a: j })
                });
            }
            b.fold(&terms)
        })
        .collect();
    let p = Program {
        width: w,
        name: Some(DIRECT_NAME.into()),
        instructions: b.instructions,
        outputs,
    };
    assert!(
        p.instructions.len() <= primitive_bound(FieldKind::Bn254, w),
        "direct construction exceeded its bound"
    );
    p
}

/// The textbook AES MixColumns circuit with a shared sum
/// `t = x0 + x1 + x2 + x3` and `y_i = xtime(x_i + x_{i+1}) + t + x_i`:
/// 15 additions and 4 xtime operations.
pub fn aes_shared_sum() -> Program<Gf256> {
    let mut instructions = vec![
        Instruction::Add { a: 0, b: 1 },
        Instruction::Add { a: 4, b: 2 },
        Instruction::Add { a: 5, b: 3 },
    ];
    let mut outputs = Vec::new();
    for i in 0..4 {
        let base = 4 + instructions.len();
        instructions.push(Instruction::Add {
            a: i,
            b: (i + 1) % 4,
        });
        instructions.push(Instruction::Mul {
            k: Gf256(0x02),
            a: base,
        });
        instructions.push(Instruction::Add { a: base + 1, b: 6 });
        instructions.push(Instruction::Add { a: base + 2, b: i });
        outputs.push(base + 3);
    }
    Program {
        width: 4,
        name: Some(AES_SHARED_SUM_NAME.into()),
        instructions,
        outputs,
    }
}

/// The Poseidon2 width-3 external matrix `[[2,1,1],[1,2,1],[1,1,2]]`.
pub fn poseidon2_external3() -> Matrix<Bn254> {
    [[2u64, 1, 1], [1, 2, 1], [1, 1, 2]]
        .iter()
        .map(|r| r.iter().map(|&k| Bn254::from(k)).collect())
        .collect()
}

/// `s = x0 + x1 + x2`, `y_i = s + x_i`: 5 additions.
pub fn bn254_shared_sum() -> Program<Bn254> {
    Program {
        width: 3,
        name: Some(BN254_SHARED_SUM_NAME.into()),
        instructions: vec![
            Instruction::Add { a: 0, b: 1 },
            Instruction::Add { a: 3, b: 2 },
            Instruction::Add { a: 4, b: 0 },
            Instruction::Add { a: 4, b: 1 },
            Instruction::Add { a: 4, b: 2 },
        ],
        outputs: vec![5, 6, 7],
    }
}

/// The known circuit for a GF(2^8) matrix, if there is one (exactly AES MixColumns).
pub fn known_gf256(m: &Matrix<Gf256>) -> Option<Program<Gf256>> {
    (*m == aes_mixcolumns()).then(aes_shared_sum)
}

/// The known circuit for a BN254 matrix, if there is one (exactly the
/// Poseidon2 width-3 external matrix).
pub fn known_bn254(m: &Matrix<Bn254>) -> Option<Program<Bn254>> {
    (*m == poseidon2_external3()).then(bn254_shared_sum)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::{Rng, SeedableRng};
    use rand_chacha::ChaCha20Rng;

    #[test]
    fn known_circuits_compute_their_matrices() {
        let p = aes_shared_sum();
        p.check_at("").unwrap();
        assert_eq!(p.coefficient_matrix(), aes_mixcolumns());
        let ops = p.op_counts();
        assert_eq!((ops.add, ops.xtime, ops.mul), (15, 4, 4));
        let q = bn254_shared_sum();
        q.check_at("").unwrap();
        assert_eq!(q.coefficient_matrix(), poseidon2_external3());
        assert!(known_gf256(&aes_mixcolumns()).is_some());
        let mut other = aes_mixcolumns();
        other[0][0] = Gf256(0x04);
        assert!(known_gf256(&other).is_none());
    }

    #[test]
    fn direct_constructions_compute_their_matrices() {
        let aes = direct_gf256(&aes_mixcolumns());
        assert_eq!(aes.coefficient_matrix(), aes_mixcolumns());
        let ops = aes.op_counts();
        assert_eq!((ops.add, ops.xtime), (16, 4));
        let full: Matrix<Gf256> = vec![vec![Gf256(0xFF); 4]; 4];
        let p = direct_gf256(&full);
        assert_eq!(p.instructions.len(), 152);
        assert_eq!(p.coefficient_matrix(), full);
        let mut rng = ChaCha20Rng::seed_from_u64(5);
        for w in 2..=4 {
            let m: Matrix<Gf256> = (0..w)
                .map(|_| (0..w).map(|_| Gf256(rng.gen())).collect())
                .collect();
            let p = direct_gf256(&m);
            p.check_at("").unwrap();
            assert_eq!(p.coefficient_matrix(), m);
        }
        let mut zero_row = aes_mixcolumns();
        zero_row[2] = vec![Gf256(0); 4];
        assert_eq!(direct_gf256(&zero_row).coefficient_matrix(), zero_row);
        let m = poseidon2_external3();
        let d = direct_bn254(&m);
        assert_eq!(d.coefficient_matrix(), m);
        assert_eq!(d.op_counts().mul, 3);
    }
}
