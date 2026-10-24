//! Synthesis strategies: which rewrites to apply before pair extraction.
//!
//! A strategy is a handful of knobs. The first few attempts of a search use
//! fixed strategies (full factoring with shortcuts, no factoring, and so on);
//! later attempts draw the knobs from the attempt's seeded generator.

use cryptificate_core::linalg::Matrix;
use cryptificate_core::{Bn254, Field, FieldKind, Gf256, Program};
use rand::Rng;

use crate::expr::{
    cancel_gf256, column_modes, factor, primitive_bn254, primitive_gf256, shared_rows_bn254,
    simplify, Expr,
};
use crate::synth::{peephole, Graph, PairOptions};

/// How a BN254 strategy chooses the shared row vector `r` of
/// `M = 1 r^T + M'`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SharedRows {
    /// No shared sum (`r = 0`).
    None,
    /// The most frequent value of each column.
    Modes,
    /// For each column, zero or the value of a random row.
    Random,
}

/// The knobs of one synthesis attempt.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Strategy {
    /// Probability of factoring each group of equally scaled terms
    /// (`k*a + k*b = k*(a + b)`); 1.0 gives Horner form over GF(2^8).
    pub factor: f64,
    /// Pair extraction options.
    pub pairs: PairOptions,
    /// BN254 only: shared row vector.
    pub shared_rows: SharedRows,
}

impl Strategy {
    /// The strategy of attempt `index`: fixed for the first four attempts,
    /// drawn from `rng` afterwards.
    pub fn for_attempt<R: Rng>(field: FieldKind, index: usize, rng: &mut R) -> Self {
        let pairs = |shortcuts: f64, shallow: bool, double_as_add: bool| PairOptions {
            shared: true,
            shortcuts,
            shallow,
            double_as_add,
        };
        match (field, index) {
            (FieldKind::Gf256, 0) => Strategy {
                factor: 1.0,
                pairs: pairs(1.0, true, false),
                shared_rows: SharedRows::None,
            },
            (FieldKind::Gf256, 1) => Strategy {
                factor: 0.0,
                pairs: pairs(1.0, true, false),
                shared_rows: SharedRows::None,
            },
            (FieldKind::Gf256, 2) => Strategy {
                factor: 1.0,
                pairs: pairs(0.0, false, false),
                shared_rows: SharedRows::None,
            },
            (FieldKind::Gf256, 3) => Strategy {
                factor: 0.0,
                pairs: pairs(0.0, false, false),
                shared_rows: SharedRows::None,
            },
            (FieldKind::Bn254, 0) => Strategy {
                factor: 1.0,
                pairs: pairs(1.0, true, true),
                shared_rows: SharedRows::Modes,
            },
            (FieldKind::Bn254, 1) => Strategy {
                factor: 1.0,
                pairs: pairs(1.0, true, true),
                shared_rows: SharedRows::None,
            },
            (FieldKind::Bn254, 2) => Strategy {
                factor: 0.0,
                pairs: pairs(0.0, false, false),
                shared_rows: SharedRows::Modes,
            },
            (FieldKind::Bn254, 3) => Strategy {
                factor: 0.0,
                pairs: pairs(0.0, false, false),
                shared_rows: SharedRows::None,
            },
            (field, _) => {
                let levels = [0.0, 0.25, 0.5, 0.75, 1.0];
                let factor = levels[rng.gen_range(0..levels.len())];
                let shortcuts = [0.0, 0.5, 1.0][rng.gen_range(0..3)];
                let shallow = rng.gen_bool(0.5);
                let (double_as_add, shared_rows) = match field {
                    FieldKind::Gf256 => (false, SharedRows::None),
                    FieldKind::Bn254 => (
                        rng.gen_bool(0.75),
                        [SharedRows::None, SharedRows::Modes, SharedRows::Random]
                            [rng.gen_range(0..3)],
                    ),
                };
                Strategy {
                    factor,
                    pairs: pairs(shortcuts, shallow, double_as_add),
                    shared_rows,
                }
            }
        }
    }

    /// A short description recorded in the search history, e.g.
    /// `"factor=1 pairs shortcuts=1 shallow"`.
    pub fn label(&self, field: FieldKind) -> String {
        let mut parts = Vec::new();
        if field == FieldKind::Bn254 {
            parts.push(match self.shared_rows {
                SharedRows::None => "rows=none".to_string(),
                SharedRows::Modes => "rows=modes".to_string(),
                SharedRows::Random => "rows=random".to_string(),
            });
        }
        parts.push(format!("factor={}", self.factor));
        parts.push(
            if self.pairs.shared {
                "pairs"
            } else {
                "no-pairs"
            }
            .to_string(),
        );
        parts.push(format!("shortcuts={}", self.pairs.shortcuts));
        if self.pairs.shallow {
            parts.push("shallow".into());
        }
        if field == FieldKind::Bn254 && self.pairs.double_as_add {
            parts.push("double-as-add".into());
        }
        parts.join(" ")
    }
}

/// Lowers expressions, extracts pairs, emits, and applies the peephole
/// rewrites until the instruction count stops falling.
fn finish<F: Field, R: Rng>(
    width: usize,
    exprs: &[Expr<F>],
    s: &Strategy,
    rng: &mut R,
) -> Program<F> {
    let mut g = Graph::new(width);
    let outs: Vec<_> = exprs.iter().map(|e| g.lower(e, &s.pairs)).collect();
    g.extract_pairs(&s.pairs, rng);
    let mut p = g.emit(&outs);
    for _ in 0..4 {
        let q = peephole(&p, s.pairs.double_as_add);
        if q.instructions.len() >= p.instructions.len() {
            break;
        }
        p = q;
    }
    p
}

/// Synthesizes a GF(2^8) circuit for `m`: primitive construction, factoring,
/// cancellation, pair extraction, emission and peephole rewrites.
pub fn synthesize_gf256<R: Rng>(m: &Matrix<Gf256>, s: &Strategy, rng: &mut R) -> Program<Gf256> {
    let exprs: Vec<_> = primitive_gf256(m)
        .into_iter()
        .map(|e| cancel_gf256(factor(e, s.factor, rng)))
        .collect();
    finish(m.len(), &exprs, s, rng)
}

/// Synthesizes a BN254 circuit for `m`: optional shared-sum decomposition,
/// constant factoring, simplification (no cancellation), pair extraction,
/// emission and peephole rewrites (including `2x = x + x`).
pub fn synthesize_bn254<R: Rng>(m: &Matrix<Bn254>, s: &Strategy, rng: &mut R) -> Program<Bn254> {
    let w = m.len();
    let r: Vec<Bn254> = match s.shared_rows {
        SharedRows::None => vec![Bn254::zero(); w],
        SharedRows::Modes => column_modes(m),
        SharedRows::Random => (0..w)
            .map(|j| {
                if rng.gen_bool(0.5) {
                    Bn254::zero()
                } else {
                    m[rng.gen_range(0..w)][j]
                }
            })
            .collect(),
    };
    let base = if r.iter().all(Field::is_zero) {
        primitive_bn254(m)
    } else {
        shared_rows_bn254(m, &r)
    };
    let exprs: Vec<_> = base
        .into_iter()
        .map(|e| simplify(factor(e, s.factor, rng)))
        .collect();
    finish(w, &exprs, s, rng)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::baseline::poseidon2_external3;
    use rand::SeedableRng;
    use rand_chacha::ChaCha20Rng;

    #[test]
    fn bn254_shared_rows_find_the_five_addition_circuit() {
        let m = poseidon2_external3();
        let mut rng = ChaCha20Rng::seed_from_u64(9);
        let s = Strategy::for_attempt(FieldKind::Bn254, 0, &mut rng);
        let p = synthesize_bn254(&m, &s, &mut rng);
        assert_eq!(p.coefficient_matrix(), m);
        let ops = p.op_counts();
        assert_eq!((ops.add, ops.mul), (5, 0), "{p:?}");
    }

    #[test]
    fn bn254_internal_matrix_uses_additions_for_doubling() {
        let m: Matrix<Bn254> = [[2u64, 1, 1], [1, 2, 1], [1, 1, 3]]
            .iter()
            .map(|r| r.iter().map(|&k| Bn254::from(k)).collect())
            .collect();
        let mut rng = ChaCha20Rng::seed_from_u64(1);
        let s = Strategy::for_attempt(FieldKind::Bn254, 0, &mut rng);
        let p = synthesize_bn254(&m, &s, &mut rng);
        assert_eq!(p.coefficient_matrix(), m);
        let ops = p.op_counts();
        assert_eq!((ops.add, ops.mul), (6, 0), "{p:?}");
    }

    #[test]
    fn random_strategies_stay_correct() {
        let mut rng = ChaCha20Rng::seed_from_u64(11);
        for i in 0..40 {
            let m: Matrix<Gf256> = (0..4)
                .map(|_| (0..4).map(|_| Gf256(rng.gen())).collect())
                .collect();
            let s = Strategy::for_attempt(FieldKind::Gf256, i, &mut rng);
            let p = synthesize_gf256(&m, &s, &mut rng);
            p.check_at("").unwrap();
            assert_eq!(p.coefficient_matrix(), m, "{}", s.label(FieldKind::Gf256));
            let b: Matrix<Bn254> = (0..3)
                .map(|_| {
                    (0..3)
                        .map(|_| Bn254::from(rng.gen_range(0..4u64)))
                        .collect()
                })
                .collect();
            let s = Strategy::for_attempt(FieldKind::Bn254, i, &mut rng);
            let p = synthesize_bn254(&b, &s, &mut rng);
            p.check_at("").unwrap();
            assert_eq!(p.coefficient_matrix(), b, "{}", s.label(FieldKind::Bn254));
        }
    }
}
