//! Linear expressions over the inputs and the rewrites the search applies
//! before circuit synthesis.
//!
//! An [`Expr`] is a tree: an input, a constant multiple of a subexpression,
//! or a sum of subexpressions (XOR over GF(2^8)). The search starts from the
//! primitive construction of a matrix (polynomial-basis multiples of each
//! input), applies algebraic rewrites chosen by a seeded random generator,
//! and hands the result to [`crate::synth`], which shares common pairs and
//! emits a program.

use std::collections::HashMap;

use cryptificate_core::linalg::{basis, Matrix};
use cryptificate_core::{Bn254, Field, Gf256};
use rand::Rng;

/// A linear expression over the inputs `x_0 .. x_{w-1}`.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub enum Expr<F> {
    /// The input `x_j`.
    Input(usize),
    /// `k * e`.
    Scale(F, Box<Expr<F>>),
    /// The sum of the children; the empty sum is zero.
    Sum(Vec<Expr<F>>),
}

impl<F: Field> Expr<F> {
    /// `k * self`.
    pub fn scaled(self, k: F) -> Self {
        Expr::Scale(k, Box::new(self))
    }

    /// The coefficients of this expression over the `width` inputs.
    pub fn form(&self, width: usize) -> Vec<F> {
        match self {
            Expr::Input(j) => basis(width, *j),
            Expr::Scale(k, e) => e.form(width).into_iter().map(|c| *k * c).collect(),
            Expr::Sum(children) => {
                let mut acc = vec![F::zero(); width];
                for c in children {
                    for (a, b) in acc.iter_mut().zip(c.form(width)) {
                        *a = *a + b;
                    }
                }
                acc
            }
        }
    }
}

/// `x * 02^b` as a chain of `b` multiplications by `02`.
fn xtime_chain(j: usize, b: u32) -> Expr<Gf256> {
    (0..b).fold(Expr::Input(j), |e, _| e.scaled(Gf256(0x02)))
}

/// The primitive construction over GF(2^8): output `i` is the sum, over every
/// input `j` and every set bit `b` of `m[i][j]`, of `x_j * 02^b`, where
/// `x_j * 02^b` is a chain of `b` xtime steps.
///
/// Lowered without sharing (except the per-input chains), a `w x w` matrix
/// needs at most `7w` xtime operations and `w (8w - 1)` additions; see
/// [`primitive_bound`].
pub fn primitive_gf256(m: &Matrix<Gf256>) -> Vec<Expr<Gf256>> {
    m.iter()
        .map(|row| {
            let mut terms = Vec::new();
            for (j, k) in row.iter().enumerate() {
                for b in 0..8 {
                    if (k.0 >> b) & 1 == 1 {
                        terms.push(xtime_chain(j, b));
                    }
                }
            }
            Expr::Sum(terms)
        })
        .collect()
}

/// Upper bound on the operation count of the primitive construction of a
/// `width x width` matrix: `7 width` xtime steps plus `width (8 width - 1)`
/// additions over GF(2^8) (152 for width 4); `width^2` multiplications plus
/// `width (width - 1)` additions over BN254.
pub fn primitive_bound(field: cryptificate_core::FieldKind, width: usize) -> usize {
    match field {
        cryptificate_core::FieldKind::Gf256 => 7 * width + width * (8 * width - 1),
        cryptificate_core::FieldKind::Bn254 => width * width + width * (width - 1),
    }
}

/// The primitive construction over BN254: output `i` is the sum of
/// `m[i][j] * x_j` over the nonzero coefficients (coefficient one needs no
/// multiplication).
pub fn primitive_bn254(m: &Matrix<Bn254>) -> Vec<Expr<Bn254>> {
    m.iter()
        .map(|row| {
            Expr::Sum(
                row.iter()
                    .enumerate()
                    .filter(|(_, k)| !k.is_zero())
                    .map(|(j, k)| scale_input(*k, j))
                    .collect(),
            )
        })
        .collect()
}

fn scale_input<F: Field>(k: F, j: usize) -> Expr<F> {
    if k.is_one() {
        Expr::Input(j)
    } else {
        Expr::Input(j).scaled(k)
    }
}

/// Shared-sum decomposition over BN254: with a row vector `r`, write
/// `M = 1 r^T + M'` and compute `s = sum_j r_j x_j` once, then
/// `y_i = s + sum_j M'_ij x_j`. Coefficients of `M'` are reduced modulo p.
pub fn shared_rows_bn254(m: &Matrix<Bn254>, r: &[Bn254]) -> Vec<Expr<Bn254>> {
    let shared: Vec<Expr<Bn254>> = r
        .iter()
        .enumerate()
        .filter(|(_, k)| !k.is_zero())
        .map(|(j, k)| scale_input(*k, j))
        .collect();
    m.iter()
        .map(|row| {
            let mut terms = Vec::new();
            if !shared.is_empty() {
                terms.push(Expr::Sum(shared.clone()));
            }
            for (j, (k, rj)) in row.iter().zip(r).enumerate() {
                let c = *k - *rj;
                if !c.is_zero() {
                    terms.push(scale_input(c, j));
                }
            }
            Expr::Sum(terms)
        })
        .collect()
}

/// For every column, the value that occurs most often (the first such value
/// from the top on ties), or zero when every value occurs once.
pub fn column_modes<F: Field>(m: &Matrix<F>) -> Vec<F> {
    let w = m.first().map_or(0, Vec::len);
    (0..w)
        .map(|j| {
            let mut counts: HashMap<F, usize> = HashMap::new();
            let mut best = (F::zero(), 1usize);
            for row in m {
                let c = counts.entry(row[j]).or_insert(0);
                *c += 1;
                if *c > best.1 {
                    best = (row[j], *c);
                }
            }
            best.0
        })
        .collect()
}

/// Factoring `k*a + k*b = k*(a + b)`: in every sum, the children of the form
/// `Scale(k, e)` with the same constant `k` (not 0 or 1) are grouped, with
/// probability `prob` per group, into one `Scale(k, Sum(e...))`. The rewrite
/// is applied again inside the new sums, so with `prob = 1` a GF(2^8)
/// primitive construction becomes Horner form
/// `S_0 + 02 (S_1 + 02 (S_2 + ...))`, where xtime(a) xor xtime(b) becomes
/// xtime(a xor b).
pub fn factor<F: Field, R: Rng>(e: Expr<F>, prob: f64, rng: &mut R) -> Expr<F> {
    match e {
        Expr::Input(_) => e,
        Expr::Scale(k, inner) => Expr::Scale(k, Box::new(factor(*inner, prob, rng))),
        Expr::Sum(children) => {
            // Group scaled children by constant, keeping first-seen order.
            let mut order: Vec<F> = Vec::new();
            let mut groups: HashMap<F, Vec<Expr<F>>> = HashMap::new();
            let mut rest = Vec::new();
            for c in children {
                match c {
                    Expr::Scale(k, inner) if !k.is_zero() && !k.is_one() => {
                        if !groups.contains_key(&k) {
                            order.push(k);
                        }
                        groups.entry(k).or_default().push(*inner);
                    }
                    other => rest.push(other),
                }
            }
            let mut out: Vec<Expr<F>> = rest.into_iter().map(|c| factor(c, prob, rng)).collect();
            for k in order {
                let members = groups.remove(&k).unwrap_or_default();
                if members.len() >= 2 && rng.gen_bool(prob.clamp(0.0, 1.0)) {
                    // The new group's own children may share further constants.
                    out.push(factor(Expr::Sum(members), prob, rng).scaled(k));
                } else {
                    out.extend(members.into_iter().map(|m| factor(m, prob, rng).scaled(k)));
                }
            }
            Expr::Sum(out)
        }
    }
}

/// Simplification over GF(2^8), where `a + a = 0`: nested sums are
/// flattened, equal children cancel in pairs, scaled zeros disappear and
/// one-child sums collapse. Applied bottom-up.
pub fn cancel_gf256(e: Expr<Gf256>) -> Expr<Gf256> {
    match e {
        Expr::Input(_) => e,
        Expr::Scale(k, inner) => {
            let inner = cancel_gf256(*inner);
            if k.is_zero() || is_zero(&inner) {
                Expr::Sum(Vec::new())
            } else if k.is_one() {
                inner
            } else {
                inner.scaled(k)
            }
        }
        Expr::Sum(children) => {
            let mut flat = Vec::new();
            for c in children {
                match cancel_gf256(c) {
                    Expr::Sum(grand) => flat.extend(grand),
                    other => flat.push(other),
                }
            }
            // Cancel equal children in pairs, keeping first-seen order.
            let mut parity: HashMap<Expr<Gf256>, bool> = HashMap::new();
            for c in &flat {
                let p = parity.entry(c.clone()).or_insert(false);
                *p = !*p;
            }
            let mut kept = Vec::new();
            for c in flat {
                if parity.get(&c) == Some(&true) {
                    parity.insert(c.clone(), false);
                    kept.push(c);
                }
            }
            if kept.len() == 1 {
                kept.pop().expect("one child")
            } else {
                Expr::Sum(kept)
            }
        }
    }
}

/// Simplification over any field without cancellation: scaled zeros
/// disappear, `1 * e = e`, `k1 * (k2 * e) = (k1 k2) * e`, and one-child sums
/// collapse. Nested sums are kept, since they mark shared partial sums.
pub fn simplify<F: Field>(e: Expr<F>) -> Expr<F> {
    match e {
        Expr::Input(_) => e,
        Expr::Scale(k, inner) => {
            let inner = simplify(*inner);
            if k.is_zero() || is_zero(&inner) {
                Expr::Sum(Vec::new())
            } else if k.is_one() {
                inner
            } else if let Expr::Scale(k2, e2) = inner {
                simplify(Expr::Scale(k * k2, e2))
            } else {
                inner.scaled(k)
            }
        }
        Expr::Sum(children) => {
            let mut kept: Vec<Expr<F>> = children
                .into_iter()
                .map(simplify)
                .filter(|c| !is_zero(c))
                .collect();
            if kept.len() == 1 {
                kept.pop().expect("one child")
            } else {
                Expr::Sum(kept)
            }
        }
    }
}

fn is_zero<F>(e: &Expr<F>) -> bool {
    matches!(e, Expr::Sum(c) if c.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;
    use cryptificate_core::linalg::aes_mixcolumns;
    use cryptificate_core::FieldKind;
    use rand::SeedableRng;
    use rand_chacha::ChaCha20Rng;

    fn forms<F: Field>(es: &[Expr<F>], w: usize) -> Vec<Vec<F>> {
        es.iter().map(|e| e.form(w)).collect()
    }

    #[test]
    fn primitive_construction_matches_matrix() {
        let m = aes_mixcolumns();
        assert_eq!(forms(&primitive_gf256(&m), 4), m);
        let full: Matrix<Gf256> = vec![vec![Gf256(0xFF); 4]; 4];
        assert_eq!(forms(&primitive_gf256(&full), 4), full);
        assert_eq!(primitive_bound(FieldKind::Gf256, 4), 152);
        assert_eq!(primitive_bound(FieldKind::Bn254, 3), 15);
    }

    #[test]
    fn factoring_and_cancellation_preserve_forms() {
        let mut rng = ChaCha20Rng::seed_from_u64(1);
        let m: Matrix<Gf256> = (0..4)
            .map(|_| (0..4).map(|_| Gf256(rng.gen())).collect())
            .collect();
        for prob in [0.0, 0.5, 1.0] {
            let es: Vec<_> = primitive_gf256(&m)
                .into_iter()
                .map(|e| cancel_gf256(factor(e, prob, &mut rng)))
                .collect();
            assert_eq!(forms(&es, 4), m, "prob {prob}");
        }
    }

    #[test]
    fn full_factoring_gives_horner_form_for_aes() {
        let mut rng = ChaCha20Rng::seed_from_u64(0);
        let e = cancel_gf256(factor(
            primitive_gf256(&aes_mixcolumns()).remove(0),
            1.0,
            &mut rng,
        ));
        // y0 = x1 + x2 + x3 + 02 (x0 + x1)
        let expected = Expr::Sum(vec![
            Expr::Input(1),
            Expr::Input(2),
            Expr::Input(3),
            Expr::Sum(vec![Expr::Input(0), Expr::Input(1)]).scaled(Gf256(2)),
        ]);
        assert_eq!(e, expected);
    }

    #[test]
    fn cancellation_removes_pairs() {
        let x = |j| Expr::<Gf256>::Input(j);
        let e = Expr::Sum(vec![x(0), Expr::Sum(vec![x(0), x(1)]), x(2), x(2), x(2)]);
        assert_eq!(cancel_gf256(e), Expr::Sum(vec![x(1), x(2)]));
    }

    #[test]
    fn shared_rows_keep_the_matrix() {
        let m: Matrix<Bn254> = [[2u64, 1, 1], [1, 2, 1], [1, 1, 3]]
            .iter()
            .map(|r| r.iter().map(|&k| Bn254::from(k)).collect())
            .collect();
        let r = column_modes(&m);
        assert_eq!(r, vec![Bn254::from(1); 3]);
        let es = shared_rows_bn254(&m, &r);
        assert_eq!(forms(&es, 3), m);
        // An entry below the shared value gives a modular coefficient.
        let r2 = vec![Bn254::from(2), Bn254::zero(), Bn254::zero()];
        assert_eq!(forms(&shared_rows_bn254(&m, &r2), 3), m);
        assert_eq!(forms(&primitive_bn254(&m), 3), m);
        let mut rng = ChaCha20Rng::seed_from_u64(3);
        let f: Vec<_> = es
            .into_iter()
            .map(|e| simplify(factor(e, 1.0, &mut rng)))
            .collect();
        assert_eq!(forms(&f, 3), m);
    }
}
