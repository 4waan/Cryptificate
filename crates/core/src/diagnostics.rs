//! Unchecked diagnostics of an analysis request.
//!
//! Everything in this module is ordinary Rust computation and proves
//! nothing. The engine uses it for two things: to tell the user early what
//! the certificate is expected to show, and to choose which certificate to
//! generate (a proof or a refutation, and with which witness). Lean then
//! checks that certificate independently; a wrong diagnostic can make a
//! certificate fail, never make a false claim pass.
//!
//! The searches are deliberately independent of the quantities they are
//! compared with. MDS is decided from the list of all square minors, while
//! the low-weight vector that refutes it comes from a separate Gaussian
//! elimination search over the kernels of square submatrices; the two are
//! cross-checked in the tests.
//!
//! Every result is deterministic: equal requests give equal diagnostics,
//! including the choice of witness.

use num_bigint::BigUint;
use num_traits::{One, ToPrimitive};
use serde::{Serialize, Serializer};

use crate::circuit::{CircuitStats, CoefficientMismatch, Distinguisher};
use crate::design::{AesLikeDesign, CandidateDesign, HadesDesign, SboxSpec, Target};
use crate::field::{bn254_modulus, Bn254, Field, FieldKind, Gf256};
use crate::limits;
use crate::linalg::{
    basis, combinations, coordinates, determinant, encode_vec, kernel_vector, mat_vec,
    nullspace_basis, rank, submatrix, vec_mat, weight, Matrix,
};
use crate::prime::{pratt_certificate, with_modulus, Fp, Modulus, PrattStep};
use crate::program::Program;
use crate::report::{
    aes_like_activity_bound, claim_ids, hades_outer_activity_bound_width,
    hades_total_activity_bound_width, labels, Status, Witness,
};
use crate::request::AnalysisRequest;
use crate::AnyProgram;

// ---------------------------------------------------------------------------
// Matrices
// ---------------------------------------------------------------------------

/// The determinant of one square submatrix.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Minor<F> {
    /// Selected rows, increasing.
    pub rows: Vec<usize>,
    /// Selected columns, increasing.
    pub cols: Vec<usize>,
    pub value: F,
}

/// Every square minor of `m`: order 1 first, then order 2, and so on; within
/// one order, row subsets in lexicographic order and, for each, column
/// subsets in lexicographic order. A `4 x 4` matrix has 69 minors and a
/// `3 x 3` matrix 19.
pub fn all_minors<F: Field>(m: &Matrix<F>) -> Vec<Minor<F>> {
    let n = m.len();
    let mut out = Vec::new();
    for k in 1..=n {
        let subsets = combinations(n, k);
        for rows in &subsets {
            for cols in &subsets {
                out.push(Minor {
                    rows: rows.clone(),
                    cols: cols.clone(),
                    value: determinant(&submatrix(m, rows, cols)),
                });
            }
        }
    }
    out
}

/// A nonzero input whose weight plus the weight of its image is below the
/// MDS branch number `width + 1`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchWitness<F> {
    pub input: Vec<F>,
    /// `M input`.
    pub output: Vec<F>,
    pub input_weight: usize,
    pub output_weight: usize,
    /// The branch number of an MDS matrix of this size, `width + 1`.
    pub bound: usize,
    /// The input coordinates the search allowed to be nonzero.
    pub support: Vec<usize>,
    /// The output coordinates the search forced to zero.
    pub zero_outputs: Vec<usize>,
}

impl<F: Field> BranchWitness<F> {
    /// The report form (`{"kind":"branch",...}`).
    pub fn to_witness(&self) -> Witness {
        Witness::Branch {
            input: encode_vec(&self.input),
            output: encode_vec(&self.output),
            input_weight: self.input_weight,
            output_weight: self.output_weight,
            bound: self.bound,
        }
    }

    /// Combined weight of input and output.
    pub fn combined_weight(&self) -> usize {
        self.input_weight + self.output_weight
    }
}

/// Searches for a nonzero `x` with `weight(x) + weight(M x) < n + 1`.
///
/// For each support size `s = 1..=n`, each set `S` of `s` input coordinates
/// and each set `Z` of `s` output coordinates (both in lexicographic order),
/// a nonzero kernel vector of the square submatrix `M[Z, S]`, placed on `S`,
/// gives an `x` with `weight(x) <= s` whose image vanishes on `Z`, so
/// `weight(x) + weight(M x) <= n`. Such a kernel vector exists exactly when
/// that minor is zero, so the search finds a witness if and only if `M` is
/// not MDS. Among all candidates the one with the smallest combined weight is
/// returned; ties go to the first one found.
///
/// That weight is the branch number of `M`, the least combined weight over
/// all nonzero vectors. Take a lightest vector, with support `S` and image
/// zero on `Z`. If `M` is not MDS its weight is at most `n`, so
/// `|Z| >= |S|`. Some `Z' ⊆ Z` with `|Z'| = |S|` contains a row basis of
/// `M[Z, S]`, so `M[Z', S]` has the same kernel; every nonzero vector of that
/// kernel, placed on `S`, has image zero on `Z` and weighs at most
/// `|S| + n - |Z|`, the lightest weight.
///
/// This uses Gaussian elimination only and does not consult the minors list.
pub fn branch_witness<F: Field>(m: &Matrix<F>) -> Option<BranchWitness<F>> {
    let n = m.len();
    let mut best: Option<BranchWitness<F>> = None;
    for s in 1..=n {
        let subsets = combinations(n, s);
        for support in &subsets {
            for zero_outputs in &subsets {
                let Some(k) = kernel_vector(&submatrix(m, zero_outputs, support)) else {
                    continue;
                };
                let mut input = vec![F::zero(); n];
                for (&i, &v) in support.iter().zip(&k) {
                    input[i] = v;
                }
                let output = mat_vec(m, &input);
                let candidate = BranchWitness {
                    input_weight: weight(&input),
                    output_weight: weight(&output),
                    input,
                    output,
                    bound: n + 1,
                    support: support.clone(),
                    zero_outputs: zero_outputs.clone(),
                };
                if best
                    .as_ref()
                    .is_none_or(|b| candidate.combined_weight() < b.combined_weight())
                {
                    best = Some(candidate);
                }
            }
        }
    }
    best
}

/// Diagnostics of one square matrix.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MatrixAnalysis<F> {
    pub matrix: Matrix<F>,
    /// All square minors, in the order of [`all_minors`].
    pub minors: Vec<Minor<F>>,
    pub minor_count: usize,
    pub zero_minors: usize,
    /// Every minor is nonzero.
    pub mds: bool,
    pub determinant: F,
    pub invertible: bool,
    /// Present exactly when `mds` is false (see [`branch_witness`]).
    pub branch_witness: Option<BranchWitness<F>>,
    /// A nonzero `x` with `M x = 0`, present exactly when the matrix is singular.
    pub kernel_vector: Option<Vec<F>>,
}

/// Minors, MDS decision, determinant, and the witnesses for a failure.
pub fn analyze_matrix<F: Field>(m: &Matrix<F>) -> MatrixAnalysis<F> {
    let minors = all_minors(m);
    let zero_minors = minors.iter().filter(|x| x.value.is_zero()).count();
    let det = determinant(m);
    MatrixAnalysis {
        matrix: m.clone(),
        minor_count: minors.len(),
        zero_minors,
        mds: zero_minors == 0,
        determinant: det,
        invertible: !det.is_zero(),
        branch_witness: if zero_minors == 0 {
            None
        } else {
            branch_witness(m)
        },
        kernel_vector: kernel_vector(m),
        minors,
    }
}

// ---------------------------------------------------------------------------
// Row offsets
// ---------------------------------------------------------------------------

/// Two rows with the same offset.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub struct OffsetCollision {
    /// `rows[0] < rows[1]`.
    pub rows: [usize; 2],
    pub offset: usize,
}

impl OffsetCollision {
    pub fn to_witness(&self) -> Witness {
        Witness::OffsetCollision {
            rows: self.rows.to_vec(),
            offset: self.offset,
        }
    }
}

/// The first repeated offset, scanning rows in order: the first row whose
/// offset already occurred, paired with the earlier row that has it.
/// `[0, 1, 1, 3]` gives rows `[1, 2]` with offset 1.
pub fn offset_collision(offsets: &[usize]) -> Option<OffsetCollision> {
    offsets.iter().enumerate().find_map(|(j, &o)| {
        offsets[..j]
            .iter()
            .position(|&p| p == o)
            .map(|i| OffsetCollision {
                rows: [i, j],
                offset: o,
            })
    })
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct OffsetAnalysis {
    pub offsets: Vec<usize>,
    pub distinct: bool,
    pub collision: Option<OffsetCollision>,
}

pub fn analyze_offsets(offsets: &[usize]) -> OffsetAnalysis {
    let collision = offset_collision(offsets);
    OffsetAnalysis {
        offsets: offsets.to_vec(),
        distinct: collision.is_none(),
        collision,
    }
}

// ---------------------------------------------------------------------------
// Byte S-boxes
// ---------------------------------------------------------------------------

/// Two distinct bytes with the same S-box output.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub struct SboxCollision {
    pub x1: Gf256,
    pub x2: Gf256,
    pub y: Gf256,
}

impl SboxCollision {
    pub fn to_witness(&self) -> Witness {
        Witness::SboxCollision {
            x1: self.x1.encode(),
            x2: self.x2.encode(),
            y: self.y.encode(),
        }
    }
}

/// Where a byte S-box table came from.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SboxSource {
    /// `{"kind": "aes"}`: the AES S-box.
    Aes,
    /// An explicit table.
    Table,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct SboxAnalysis {
    pub source: SboxSource,
    pub table: Vec<Gf256>,
    pub bijective: bool,
    /// The inverse table, present exactly when the table is a bijection.
    pub inverse: Option<Vec<Gf256>>,
    /// The first collision, present exactly when it is not.
    pub collision: Option<SboxCollision>,
}

/// Inverse table of a 256-entry byte table, or its first collision: the
/// smallest `x2` whose output already occurred, with the smallest `x1 < x2`
/// that has it. Panics if `table` does not have 256 entries.
pub fn analyze_sbox(source: SboxSource, table: &[Gf256]) -> SboxAnalysis {
    assert_eq!(
        table.len(),
        limits::SBOX_TABLE_LEN,
        "an S-box table has 256 entries"
    );
    let mut preimage: [Option<u8>; 256] = [None; 256];
    let mut collision = None;
    for (x, &y) in table.iter().enumerate() {
        let x = x as u8;
        match preimage[y.0 as usize] {
            Some(x1) => {
                collision = Some(SboxCollision {
                    x1: Gf256(x1),
                    x2: Gf256(x),
                    y,
                });
                break;
            }
            None => preimage[y.0 as usize] = Some(x),
        }
    }
    // No collision among 256 entries means every output occurs exactly once.
    let inverse = collision.is_none().then(|| {
        preimage
            .iter()
            .map(|x| Gf256(x.expect("a collision-free table is onto")))
            .collect()
    });
    SboxAnalysis {
        source,
        table: table.to_vec(),
        bijective: collision.is_none(),
        inverse,
        collision,
    }
}

// ---------------------------------------------------------------------------
// Power maps over a prime field
// ---------------------------------------------------------------------------

/// `1^e = omega^e` with `omega != 1`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub struct PowerCollision<F = Bn254> {
    /// The base `a` with `omega = a^((p-1)/g)`.
    pub base: u64,
    pub omega: F,
}

/// Bijectivity of `x -> x^e` on a prime field `F_p` (the BN254 scalar field
/// unless stated).
///
/// The map is a bijection exactly when `gcd(e, p - 1) = 1`. Then
/// `d = e^-1 mod (p - 1)` inverts it, and `k` is the integer with
/// `e * d = (p - 1) * k + 1`. Otherwise `g = gcd(e, p - 1) > 1` and
/// `omega = a^((p - 1) / g)` for the smallest prime `a` with `omega != 1`
/// satisfies `omega^g = 1`, hence `omega^e = 1 = 1^e`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PowerAnalysis<F = Bn254> {
    pub exponent: u32,
    /// `gcd(e, p - 1)`.
    pub gcd: u32,
    pub bijective: bool,
    /// `d`, as a decimal string (it does not fit a JSON number).
    #[serde(serialize_with = "serialize_opt_decimal")]
    pub inverse_exponent: Option<BigUint>,
    /// `k` with `e * d = (p - 1) * k + 1`; `k < e`.
    pub k: Option<u64>,
    pub collision: Option<PowerCollision<F>>,
}

impl<F: Field> PowerAnalysis<F> {
    /// The report witness for a collision.
    pub fn to_witness(&self) -> Option<Witness> {
        self.collision.map(|c| Witness::PowerCollision {
            exponent: self.exponent,
            x1: F::one().encode(),
            x2: c.omega.encode(),
            note: format!(
                "omega^{e} = 1 = 1^{e}, where omega = {a}^((p-1)/{g}) is not 1",
                e = self.exponent,
                a = c.base,
                g = self.gcd
            ),
        })
    }
}

fn serialize_opt_decimal<S: Serializer>(v: &Option<BigUint>, s: S) -> Result<S::Ok, S::Error> {
    match v {
        Some(n) => s.serialize_str(&n.to_str_radix(10)),
        None => s.serialize_none(),
    }
}

fn gcd_u64(mut a: u64, mut b: u64) -> u64 {
    while b != 0 {
        (a, b) = (b, a % b);
    }
    a
}

fn is_small_prime(n: u64) -> bool {
    n >= 2
        && (2..)
            .take_while(|d| d * d <= n)
            .all(|d| !n.is_multiple_of(d))
}

/// Bases tried for the collision witness: the primes below this bound. A
/// base fails only if it is a `g`-th power residue, which at most a `1/g`
/// share of the group is, so the first few primes always suffice in practice.
const MAX_COLLISION_BASE: u64 = 10_000;

/// See [`PowerAnalysis`]; over the BN254 scalar field.
pub fn analyze_power(exponent: u32) -> PowerAnalysis {
    analyze_power_mod(exponent, bn254_modulus(), Bn254::from_biguint)
}

/// See [`PowerAnalysis`]; over `Z/pZ` for the modulus of the current
/// [`with_modulus`] scope.
pub fn analyze_power_fp(exponent: u32) -> PowerAnalysis<Fp> {
    let p = crate::prime::current_modulus().expect("analyze_power_fp runs under a modulus");
    analyze_power_mod(exponent, &BigUint::from(p), |w| {
        Fp(w.to_u64()
            .expect("a residue of a 64-bit modulus fits a u64"))
    })
}

/// See [`PowerAnalysis`]; `elem` maps a residue below `p` to the field.
fn analyze_power_mod<F: Field>(
    exponent: u32,
    p: &BigUint,
    elem: impl Fn(&BigUint) -> F,
) -> PowerAnalysis<F> {
    let n: BigUint = p - 1u32;
    let e = BigUint::from(exponent);
    let r = (&n % &e).to_u64().expect("remainder is below the exponent");
    let g = gcd_u64(u64::from(exponent), r) as u32;
    if g == 1 {
        // Modulo `p - 1 = 1` every exponent is congruent to 0; `d = 1`
        // still satisfies `e * d = (p - 1) * k + 1`, with `k = e - 1`.
        let d = if n.is_one() {
            BigUint::one()
        } else {
            e.modinv(&n).expect("e is a unit modulo p - 1")
        };
        let ed = &e * &d;
        let k = (&ed - 1u32) / &n;
        debug_assert!(((&k * &n) + 1u32) == ed);
        return PowerAnalysis {
            exponent,
            gcd: 1,
            bijective: true,
            k: Some(k.to_u64().expect("k is below the exponent")),
            collision: None,
            inverse_exponent: Some(d),
        };
    }
    let cofactor = &n / BigUint::from(g);
    let collision = (2..MAX_COLLISION_BASE)
        .filter(|&a| is_small_prime(a))
        .find_map(|a| {
            let w = BigUint::from(a).modpow(&cofactor, p);
            // A base divisible by a small modulus gives 0, which is no root.
            (!w.is_one() && w != BigUint::ZERO).then(|| PowerCollision {
                base: a,
                omega: elem(&w),
            })
        });
    if let Some(c) = &collision {
        debug_assert!(c.omega.pow(u64::from(exponent)).is_one());
        debug_assert!(!c.omega.is_one() && !c.omega.is_zero());
    }
    PowerAnalysis {
        exponent,
        gcd: g,
        bijective: false,
        inverse_exponent: None,
        k: None,
        collision,
    }
}

// ---------------------------------------------------------------------------
// Programs
// ---------------------------------------------------------------------------

/// A program compared with the matrix it is meant to implement.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgramAnalysis<F> {
    pub target: Target,
    pub identity_hash: String,
    pub stats: CircuitStats,
    pub coefficient_matrix: Matrix<F>,
    pub equivalent: bool,
    /// The first coefficient, in row-major order, that differs from the target.
    pub first_mismatch: Option<CoefficientMismatch<F>>,
    /// The basis input `e_col` for that coefficient, with `M e_col` and the
    /// program's output on it.
    pub distinguisher: Option<Distinguisher<F>>,
}

impl<F: Field> ProgramAnalysis<F> {
    pub fn new(program: &Program<F>, target: Target, matrix: &Matrix<F>) -> Self {
        let coefficient_matrix = program.coefficient_matrix();
        let first_mismatch = program.first_mismatch(matrix);
        let distinguisher = program.distinguishing_input(matrix);
        ProgramAnalysis {
            target,
            identity_hash: program.identity_hash(),
            stats: program.stats(),
            equivalent: first_mismatch.is_none(),
            coefficient_matrix,
            first_mismatch,
            distinguisher,
        }
    }

    /// The report witness for a mismatch.
    pub fn to_witness(&self) -> Option<Witness> {
        self.distinguisher
            .as_ref()
            .map(|d| Witness::DistinguishingInput {
                input: encode_vec(&d.input),
                expected: encode_vec(&d.expected),
                actual: encode_vec(&d.actual),
                differing: d.differing.clone(),
            })
    }
}

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

/// Whether the activity claim has the preconditions its certificate needs.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct ActivityAnalysis {
    pub claim: &'static str,
    pub applicable: bool,
    pub rounds: u32,
    /// The number of active S-boxes the certificate would establish: the
    /// AES-like bound `floor(r/4)*25 + (5 if r mod 4 >= 2)` for width 4, or
    /// the HADES full-round bound ([`hades_outer_activity_bound`]).
    pub bound: Option<u32>,
    pub reason: String,
}

// ---------------------------------------------------------------------------
// Partial rounds
// ---------------------------------------------------------------------------

/// Row `position` of `M^power`, for a masked `position`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct ObservabilityRow<F> {
    pub power: u32,
    pub position: usize,
    pub row: Vec<F>,
}

/// A nonzero difference that the partial rounds never bring to an S-box.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PartialBypass<F> {
    /// The difference, scaled so that its first nonzero coordinate is one.
    pub difference: Vec<F>,
    /// A basis of the largest subspace that every power of the internal
    /// matrix keeps at zero on the masked positions, starting with
    /// `difference`; empty when that subspace is zero and the difference
    /// only survives the few partial rounds the design has.
    pub invariant_basis: Vec<Vec<F>>,
    /// `M b_k = sum_l coefficients[k][l] b_l` for the basis vectors `b_k`.
    pub coefficients: Vec<Vec<F>>,
}

impl<F: Field> PartialBypass<F> {
    /// Whether the difference lies in an invariant subspace, so that it
    /// passes any number of partial rounds.
    pub fn invariant(&self) -> bool {
        !self.invariant_basis.is_empty()
    }
}

/// Which differences can pass the partial rounds of a HADES design without
/// reaching an S-box.
///
/// In a partial round with no active S-box the difference is multiplied by
/// the internal matrix `M`. A difference `d` therefore avoids every S-box of
/// `L` consecutive partial rounds exactly when `(M^j d)_i = 0` for every
/// masked position `i` and every `j < L`: when `d` is in the null space of
/// the stack of rows `e_i M^j`. The rows are scanned in order of `j`, then
/// of `i`, and a row is kept when it raises the rank. Once one power adds
/// nothing the row space stops growing, so full rank, if it comes at all,
/// comes within `width` powers.
///
/// A design with no partial rounds has nothing to charge and nothing to
/// bypass: `window` and `bypass` are then both `None`, and the claim
/// `activity.partial` does not apply.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PartialAnalysis<F> {
    /// The masked positions, increasing.
    pub positions: Vec<usize>,
    pub partial_rounds: u32,
    /// The smallest `L <= partial_rounds` for which the rows `e_i M^j`,
    /// `j < L`, have full rank: every `L` consecutive partial rounds then
    /// activate an S-box. `None` when no such `L` exists.
    pub window: Option<u32>,
    /// The rows kept by the scan, `width` of them when `window` is set.
    pub rows: Vec<ObservabilityRow<F>>,
    /// The determinant of the kept rows, when there are `width` of them.
    pub determinant: Option<F>,
    /// A bypass, when `window` is `None` and there are partial rounds.
    pub bypass: Option<PartialBypass<F>>,
}

impl<F: Field> PartialAnalysis<F> {
    /// The report witness for a bypass.
    pub fn to_witness(&self) -> Option<Witness> {
        self.bypass.as_ref().map(|b| Witness::PartialBypass {
            difference: encode_vec(&b.difference),
            positions: self.positions.clone(),
            partial_rounds: self.partial_rounds,
        })
    }
}

/// `v` scaled so that its first nonzero coordinate is one.
fn normalize<F: Field>(v: &[F]) -> Vec<F> {
    match v.iter().find(|x| !x.is_zero()) {
        Some(&lead) => {
            let inv = lead.inverse().expect("nonzero");
            v.iter().map(|&x| x * inv).collect()
        }
        None => v.to_vec(),
    }
}

/// See [`PartialAnalysis`]. `mask` marks the S-box positions of a partial
/// round.
pub fn analyze_partial<F: Field>(
    m: &Matrix<F>,
    mask: &[bool],
    partial_rounds: u32,
) -> PartialAnalysis<F> {
    let n = m.len();
    let positions: Vec<usize> = (0..n).filter(|&i| mask.get(i) == Some(&true)).collect();
    if partial_rounds == 0 {
        // Every difference avoids the S-boxes of zero rounds; that is no
        // bypass of anything.
        return PartialAnalysis {
            positions,
            partial_rounds,
            window: None,
            rows: Vec::new(),
            determinant: None,
            bypass: None,
        };
    }
    // `stack[j]` holds the rows e_i M^j for the masked i.
    let mut stack: Vec<Vec<Vec<F>>> = Vec::new();
    let mut current: Vec<Vec<F>> = positions.iter().map(|&i| basis(n, i)).collect();
    for _ in 0..n {
        stack.push(current.clone());
        current = current.iter().map(|r| vec_mat(r, m)).collect();
    }
    let horizon = (partial_rounds as usize).min(n);
    let mut rows: Vec<ObservabilityRow<F>> = Vec::new();
    let mut window = None;
    'scan: for (j, layer) in stack.iter().enumerate().take(horizon) {
        for (row, &i) in layer.iter().zip(&positions) {
            let mut kept: Matrix<F> = rows.iter().map(|r| r.row.clone()).collect();
            kept.push(row.clone());
            if rank(&kept) == kept.len() {
                rows.push(ObservabilityRow {
                    power: j as u32,
                    position: i,
                    row: row.clone(),
                });
                if rows.len() == n {
                    window = Some(j as u32 + 1);
                    break 'scan;
                }
            }
        }
    }
    let determinant = (rows.len() == n)
        .then(|| determinant(&rows.iter().map(|r| r.row.clone()).collect::<Vec<_>>()));
    let bypass = window.is_none().then(|| {
        let all: Matrix<F> = stack.iter().flatten().cloned().collect();
        let mut invariant = nullspace_basis(&all, n);
        if let Some(first) = invariant.first_mut() {
            *first = normalize(first);
            let coefficients = invariant
                .iter()
                .map(|b| {
                    coordinates(&invariant, &mat_vec(m, b))
                        .expect("the null space of the full stack is invariant")
                })
                .collect();
            PartialBypass {
                difference: invariant[0].clone(),
                invariant_basis: invariant,
                coefficients,
            }
        } else {
            // Only the first `partial_rounds` powers constrain the difference.
            let short: Matrix<F> = stack.iter().take(horizon).flatten().cloned().collect();
            let difference = nullspace_basis(&short, n)
                .into_iter()
                .next()
                .map(|v| normalize(&v))
                .expect("the stack below full rank has a null vector");
            PartialBypass {
                difference,
                invariant_basis: Vec::new(),
                coefficients: Vec::new(),
            }
        }
    });
    PartialAnalysis {
        positions,
        partial_rounds,
        window,
        rows,
        determinant,
        bypass,
    }
}

fn partial_note<F: Field>(p: &PartialAnalysis<F>) -> String {
    let plural = |k: u32| if k == 1 { "" } else { "s" };
    match (&p.window, &p.bypass) {
        (Some(l), _) => {
            let rows = p
                .rows
                .iter()
                .map(|r| format!("e{} M^{}", r.position, r.power))
                .collect::<Vec<_>>()
                .join(", ");
            format!(
                "the rows {rows} of the powers of the internal matrix M at the masked positions \
                 have determinant {}, so no nonzero difference avoids the S-boxes of {l} \
                 consecutive partial round{}",
                p.determinant.map(|d| d.encode()).unwrap_or_default(),
                plural(*l)
            )
        }
        (None, Some(b)) if b.invariant() => format!(
            "every power of the internal matrix keeps a subspace of dimension {} at zero on the \
             masked positions, so a nonzero difference in it passes all {} partial round{} with \
             no active S-box",
            b.invariant_basis.len(),
            p.partial_rounds,
            plural(p.partial_rounds)
        ),
        (None, None) => "not applicable: the design has no partial rounds, so there is no \
                         partial-round S-box to activate or to bypass"
            .into(),
        _ => format!(
            "no nonzero difference avoids the masked positions forever, but one stays at zero \
             on them through the design's {} partial round{}, so it passes them with no active \
             S-box",
            p.partial_rounds,
            plural(p.partial_rounds)
        ),
    }
}

// ---------------------------------------------------------------------------
// Whole requests
// ---------------------------------------------------------------------------

/// The expected outcome of one claim, from the diagnostics alone.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct ClaimPrediction {
    pub claim: &'static str,
    /// `proved`, `refuted` or `not_established` (never `unsupported`).
    pub predicted: Status,
    /// `true`/`false` when the property is decided, `null` when the claim is
    /// out of reach of this method.
    pub holds: Option<bool>,
    pub witness: Option<Witness>,
    pub note: String,
}

impl ClaimPrediction {
    fn decided(claim: &'static str, holds: bool, witness: Option<Witness>, note: String) -> Self {
        ClaimPrediction {
            claim,
            predicted: if holds {
                Status::Proved
            } else {
                Status::Refuted
            },
            holds: Some(holds),
            witness: if holds { None } else { witness },
            note,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct AesLikeDiagnostics {
    pub matrix: MatrixAnalysis<Gf256>,
    pub offsets: OffsetAnalysis,
    pub sbox: SboxAnalysis,
    pub activity: ActivityAnalysis,
    pub program: Option<ProgramAnalysis<Gf256>>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct HadesDiagnostics<F = Bn254> {
    pub external: MatrixAnalysis<F>,
    pub internal: MatrixAnalysis<F>,
    pub power: PowerAnalysis<F>,
    pub activity: ActivityAnalysis,
    /// The partial rounds: a charged window or a bypass.
    pub partial: PartialAnalysis<F>,
    /// The bound over the whole permutation (claim `activity.total`).
    pub total: ActivityAnalysis,
    pub program: Option<ProgramAnalysis<F>>,
}

/// The modulus of a prime-field design and the Pratt certificate the
/// engine computed for it (claim `field.prime`; Lean checks it).
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrimeFieldAnalysis {
    pub field: FieldKind,
    pub modulus: Modulus,
    /// The prime factorization of `p - 1`, as `[prime, exponent]` pairs.
    pub factorization: Vec<(Modulus, u32)>,
    /// One step per prime of the certificate, the modulus last.
    pub pratt: Vec<PrattStep>,
}

impl PrimeFieldAnalysis {
    /// The certificate for the prime `p` (validated designs only).
    pub fn new(field: FieldKind, p: u64) -> Self {
        let pratt = pratt_certificate(p).expect("a validated modulus is prime");
        let factorization = pratt
            .last()
            .expect("a certificate proves its modulus last")
            .factors
            .iter()
            .map(|&(q, k)| (Modulus(q.0), k))
            .collect();
        PrimeFieldAnalysis {
            field,
            modulus: Modulus(p),
            factorization,
            pratt,
        }
    }

    fn note(&self) -> String {
        let factors = self
            .factorization
            .iter()
            .map(|(q, k)| {
                if *k == 1 {
                    q.to_string()
                } else {
                    format!("{q}^{k}")
                }
            })
            .collect::<Vec<_>>()
            .join(" * ");
        let base = self.pratt.last().map_or(0, |s| s.a);
        format!(
            "{} is prime: p - 1 = {factors}, and {base} has order p - 1 modulo p (a Pratt \
             certificate of {} step{})",
            self.modulus,
            self.pratt.len(),
            if self.pratt.len() == 1 { "" } else { "s" }
        )
    }
}

/// A HADES design over a 64-bit prime field: its modulus and certificate,
/// then the same analyses as over BN254.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct HadesPrimeDiagnostics {
    pub prime: PrimeFieldAnalysis,
    #[serde(flatten)]
    pub hades: HadesDiagnostics<Fp>,
}

/// The per-model part of [`Diagnostics`].
///
/// The variants differ in size (the AES-like one carries two S-box tables);
/// a request produces exactly one value, so boxing would buy nothing.
#[allow(clippy::large_enum_variant)]
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(untagged)]
pub enum ModelDiagnostics {
    AesLike(AesLikeDiagnostics),
    Hades(HadesDiagnostics),
    HadesPrime(HadesPrimeDiagnostics),
}

/// Marker serialized as `"diagnostics"`.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
pub enum DiagnosticsKind {
    #[default]
    #[serde(rename = "diagnostics")]
    Diagnostics,
}

/// The `diagnose` document.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostics {
    pub kind: DiagnosticsKind,
    /// Always `false`: nothing here is checked.
    pub checked: bool,
    /// [`labels::UNCHECKED_DIAGNOSTIC`].
    pub label: &'static str,
    pub model: &'static str,
    pub field: FieldKind,
    /// The modulus of a prime-field design (absent for the other models).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modulus: Option<Modulus>,
    pub width: usize,
    pub target: Target,
    pub input_digest: String,
    #[serde(flatten)]
    pub details: ModelDiagnostics,
    /// One entry per claim of the model, in report order.
    pub claims: Vec<ClaimPrediction>,
}

impl Diagnostics {
    /// The prediction for a claim id, if the model has that claim.
    pub fn claim(&self, id: &str) -> Option<&ClaimPrediction> {
        self.claims.iter().find(|c| c.claim == id)
    }
}

/// Diagnoses a validated, normalized analysis request.
pub fn diagnose(req: &AnalysisRequest) -> Diagnostics {
    let (details, claims) = match &req.design {
        CandidateDesign::AesLike(d) => diagnose_aes_like(d, req.program.as_ref()),
        CandidateDesign::Hades(d) => {
            let program = match &req.program {
                Some(AnyProgram::Bn254(p)) if p.width == d.width => Some(p),
                _ => None,
            };
            let (h, claims) = diagnose_hades(d, program, req.target, analyze_power);
            (ModelDiagnostics::Hades(h), claims)
        }
        CandidateDesign::HadesPrime(d) => {
            let p = d.modulus_value();
            let prime = PrimeFieldAnalysis::new(d.field, p);
            let (hades, mut claims) =
                with_modulus(p, || diagnose_hades(d, None, req.target, analyze_power_fp));
            claims.insert(
                0,
                ClaimPrediction::decided(claim_ids::FIELD_PRIME, true, None, prime.note()),
            );
            (
                ModelDiagnostics::HadesPrime(HadesPrimeDiagnostics { prime, hades }),
                claims,
            )
        }
    };
    Diagnostics {
        kind: DiagnosticsKind::Diagnostics,
        checked: false,
        label: labels::UNCHECKED_DIAGNOSTIC,
        model: req.design.model(),
        field: req.design.field(),
        modulus: req.design.modulus().map(Modulus),
        width: req.design.width(),
        target: req.target,
        input_digest: req.input_digest(),
        details,
        claims,
    }
}

fn mds_note(a: &MatrixAnalysis<impl Field>, what: &str) -> String {
    let n = a.matrix.len();
    match &a.branch_witness {
        None => format!(
            "all {} square minors of the {what} are nonzero, so its branch number is {}",
            a.minor_count,
            n + 1
        ),
        Some(w) => format!(
            "{} of {} square minors of the {what} are zero; a nonzero input of weight {} maps to \
             an output of weight {}, {} in total, below the {} an MDS matrix guarantees",
            a.zero_minors,
            a.minor_count,
            w.input_weight,
            w.output_weight,
            w.combined_weight(),
            w.bound
        ),
    }
}

fn program_prediction<F: Field>(p: &ProgramAnalysis<F>) -> ClaimPrediction {
    let matrix = match p.target {
        Target::Matrix => "design matrix",
        Target::External => "external matrix",
        Target::Internal => "internal matrix",
    };
    let note = match (&p.first_mismatch, &p.distinguisher) {
        (Some(m), Some(d)) => format!(
            "coefficient ({}, {}) of the program is {} where the {matrix} has {}; on basis \
             input e{} the outputs differ at {:?}",
            m.row, m.col, m.actual, m.expected, m.col, d.differing
        ),
        _ => format!("the program's coefficient matrix equals the {matrix}"),
    };
    ClaimPrediction::decided(
        claim_ids::CIRCUIT_EQUIVALENCE,
        p.equivalent,
        p.to_witness(),
        note,
    )
}

fn diagnose_aes_like(
    d: &AesLikeDesign,
    program: Option<&AnyProgram>,
) -> (ModelDiagnostics, Vec<ClaimPrediction>) {
    let matrix = analyze_matrix(&d.matrix);
    let offsets = analyze_offsets(&d.offsets);
    let (source, table) = match &d.sbox {
        SboxSpec::Table { table } => (SboxSource::Table, table.clone()),
        _ => (
            SboxSource::Aes,
            crate::design::aes_sbox()
                .iter()
                .copied()
                .map(Gf256)
                .collect(),
        ),
    };
    let sbox = analyze_sbox(source, &table);
    // The bound is stated for the width-4 state only.
    let bound = (d.width == limits::GF256_WIDTH).then(|| aes_like_activity_bound(d.rounds));
    let applicable = matrix.mds && offsets.distinct && bound.is_some();
    let activity = ActivityAnalysis {
        claim: claim_ids::ACTIVITY_BOUND,
        applicable,
        rounds: d.rounds,
        bound,
        reason: if applicable {
            "the matrix is MDS and the offsets are distinct, so the wide trail bound applies".into()
        } else if bound.is_none() {
            format!(
                "not established by this method: the bound is stated for width {} only",
                limits::GF256_WIDTH
            )
        } else {
            "not established by this method: the bound needs an MDS matrix and distinct offsets"
                .into()
        },
    };
    let program = match program {
        Some(AnyProgram::Gf256(p)) if p.width == d.width => {
            Some(ProgramAnalysis::new(p, Target::Matrix, &d.matrix))
        }
        _ => None,
    };

    let mut claims = vec![
        ClaimPrediction::decided(
            claim_ids::MATRIX_MDS,
            matrix.mds,
            matrix
                .branch_witness
                .as_ref()
                .map(BranchWitness::to_witness),
            mds_note(&matrix, "matrix"),
        ),
        ClaimPrediction::decided(
            claim_ids::OFFSETS_DISPERSION,
            offsets.distinct,
            offsets.collision.map(|c| c.to_witness()),
            match offsets.collision {
                None => {
                    "the row offsets are distinct, so each column spreads over all columns".into()
                }
                Some(c) => format!(
                    "rows {} and {} share offset {}, so two bytes of a column stay in one column",
                    c.rows[0], c.rows[1], c.offset
                ),
            },
        ),
        ClaimPrediction::decided(
            claim_ids::SBOX_BIJECTIVE,
            sbox.bijective,
            sbox.collision.map(|c| c.to_witness()),
            match sbox.collision {
                None => match sbox.source {
                    SboxSource::Aes => "the AES S-box has an inverse table".into(),
                    SboxSource::Table => "the S-box table has an inverse table".into(),
                },
                Some(c) => format!("bytes {} and {} both map to {}", c.x1, c.x2, c.y),
            },
        ),
        ClaimPrediction {
            claim: claim_ids::ACTIVITY_BOUND,
            predicted: if applicable {
                Status::Proved
            } else {
                Status::NotEstablished
            },
            holds: applicable.then_some(true),
            witness: None,
            note: activity.reason.clone(),
        },
    ];
    if let Some(p) = &program {
        claims.push(program_prediction(p));
    }
    (
        ModelDiagnostics::AesLike(AesLikeDiagnostics {
            matrix,
            offsets,
            sbox,
            activity,
            program,
        }),
        claims,
    )
}

/// The HADES analyses, for any field; `power` analyzes the S-box exponent
/// over that field, and `program` is a circuit for the `target` matrix.
fn diagnose_hades<F: Field>(
    d: &HadesDesign<F>,
    program: Option<&Program<F>>,
    target: Target,
    power: impl Fn(u32) -> PowerAnalysis<F>,
) -> (HadesDiagnostics<F>, Vec<ClaimPrediction>) {
    let external = analyze_matrix(&d.external);
    let internal = analyze_matrix(&d.internal);
    let power = power(d.exponent().unwrap_or(1));
    let applicable = external.mds && internal.invertible && power.bijective;
    let w = d.width;
    let activity = ActivityAnalysis {
        claim: claim_ids::ACTIVITY_OUTER,
        applicable,
        rounds: d.full_rounds,
        bound: Some(hades_outer_activity_bound_width(d.full_rounds, w)),
        reason: if applicable {
            "the external matrix is MDS, the internal matrix is invertible and the power map is \
             a bijection, so the full-round bound applies"
                .into()
        } else {
            "not established by this method: the full-round bound needs an MDS external matrix, \
             an invertible internal matrix and a bijective power map"
                .into()
        },
    };
    let partial = analyze_partial(&d.internal, &d.partial_mask, d.partial_rounds);
    let total_applicable = applicable && partial.window.is_some();
    let total = ActivityAnalysis {
        claim: claim_ids::ACTIVITY_TOTAL,
        applicable: total_applicable,
        rounds: d.total_rounds(),
        bound: partial
            .window
            .map(|l| hades_total_activity_bound_width(d.full_rounds, d.partial_rounds, l, w)),
        reason: match partial.window {
            Some(l) if applicable => format!(
                "the full-round bound {} plus one active S-box in each of the {} disjoint \
                 windows of {l} partial rounds",
                hades_outer_activity_bound_width(d.full_rounds, w),
                d.partial_rounds / l
            ),
            Some(_) => "not established by this method: the bound needs an MDS external \
                        matrix, an invertible internal matrix and a bijective power map"
                .into(),
            None if d.partial_rounds == 0 => "not established by this method: the design has \
                no partial rounds, so every S-box is in the full rounds and activity.outer gives \
                the bound; no certificate is emitted for this claim"
                .into(),
            None => "not established by this method: the bound needs every window of some \
                     length inside the partial rounds to be charged, and a nonzero difference \
                     passes them with no active S-box"
                .into(),
        },
    };
    let program = program.map(|p| {
        let m = if target == Target::Internal {
            &d.internal
        } else {
            &d.external
        };
        ProgramAnalysis::new(p, target, m)
    });

    let mut claims = vec![
        ClaimPrediction::decided(
            claim_ids::EXTERNAL_MDS,
            external.mds,
            external
                .branch_witness
                .as_ref()
                .map(BranchWitness::to_witness),
            mds_note(&external, "external matrix"),
        ),
        ClaimPrediction::decided(
            claim_ids::INTERNAL_INVERTIBLE,
            internal.invertible,
            None,
            if internal.invertible {
                format!(
                    "the internal matrix has determinant {}",
                    internal.determinant
                )
            } else {
                "the internal matrix has determinant 0 and a nonzero kernel vector".into()
            },
        ),
        ClaimPrediction::decided(
            claim_ids::SBOX_BIJECTIVE,
            power.bijective,
            power.to_witness(),
            if power.bijective {
                format!(
                    "gcd({}, p-1) = 1, so x^{} is inverted by x^d with d = {}",
                    power.exponent,
                    power.exponent,
                    power
                        .inverse_exponent
                        .as_ref()
                        .map(|d| d.to_str_radix(10))
                        .unwrap_or_default()
                )
            } else {
                format!(
                    "gcd({}, p-1) = {}, so x^{} identifies 1 with a nontrivial root of unity",
                    power.exponent, power.gcd, power.exponent
                )
            },
        ),
        ClaimPrediction {
            claim: claim_ids::ACTIVITY_OUTER,
            predicted: if applicable {
                Status::Proved
            } else {
                Status::NotEstablished
            },
            holds: applicable.then_some(true),
            witness: None,
            note: activity.reason.clone(),
        },
        if d.partial_rounds == 0 {
            // `L <= RP` fails for every window length and every nonzero
            // difference passes zero rounds: neither outcome says anything.
            ClaimPrediction {
                claim: claim_ids::ACTIVITY_PARTIAL,
                predicted: Status::NotEstablished,
                holds: None,
                witness: None,
                note: partial_note(&partial),
            }
        } else {
            ClaimPrediction::decided(
                claim_ids::ACTIVITY_PARTIAL,
                partial.window.is_some(),
                partial.to_witness(),
                partial_note(&partial),
            )
        },
        ClaimPrediction {
            claim: claim_ids::ACTIVITY_TOTAL,
            predicted: if total_applicable {
                Status::Proved
            } else {
                Status::NotEstablished
            },
            holds: total_applicable.then_some(true),
            witness: None,
            note: total.reason.clone(),
        },
    ];
    if let Some(p) = &program {
        claims.push(program_prediction(p));
    }
    (
        HadesDiagnostics {
            external,
            internal,
            power,
            activity,
            partial,
            total,
            program,
        },
        claims,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::linalg::{aes_mixcolumns, identity};

    #[test]
    fn aes_matrix_is_mds() {
        let a = analyze_matrix(&aes_mixcolumns());
        assert_eq!(a.minor_count, 69);
        assert!(a.mds);
        assert!(a.branch_witness.is_none());
        assert!(a.kernel_vector.is_none());
        assert_eq!(a.minors[0].value, Gf256(0x02));
        assert_eq!(a.minors[68].rows, vec![0, 1, 2, 3]);
    }

    #[test]
    fn identity_is_refuted_by_a_basis_vector() {
        let a = analyze_matrix::<Gf256>(&identity(4));
        assert!(!a.mds);
        assert!(a.invertible);
        let w = a.branch_witness.unwrap();
        assert_eq!(w.input, vec![Gf256(1), Gf256(0), Gf256(0), Gf256(0)]);
        assert_eq!(w.output, w.input);
        assert_eq!(w.combined_weight(), 2);
        assert_eq!(w.bound, 5);
    }

    #[test]
    fn offset_collisions() {
        assert_eq!(offset_collision(&[0, 1, 2, 3]), None);
        assert_eq!(
            offset_collision(&[0, 1, 1, 3]),
            Some(OffsetCollision {
                rows: [1, 2],
                offset: 1
            })
        );
        assert_eq!(
            offset_collision(&[0, 1, 1, 0]).unwrap().rows,
            [1, 2],
            "the first repeat in row order wins"
        );
    }

    #[test]
    fn power_exponents() {
        let five = analyze_power(5);
        assert!(five.bijective);
        let d = five.inverse_exponent.clone().unwrap();
        let n = bn254_modulus() - 1u32;
        assert_eq!((BigUint::from(5u32) * &d) % &n, BigUint::one());
        let k = five.k.unwrap();
        assert_eq!(BigUint::from(5u32) * &d, &n * k + 1u32);
        let x = Bn254::from_u64(123_456_789);
        let y = x.pow(5);
        // (x^5)^d = x, with d applied by square-and-multiply on big exponents.
        let back = Bn254::from_biguint(&y.to_biguint().modpow(&d, bn254_modulus()));
        assert_eq!(back, x);

        let three = analyze_power(3);
        assert!(!three.bijective);
        assert_eq!(three.gcd, 3);
        let c = three.collision.unwrap();
        assert!(!c.omega.is_one());
        assert!(c.omega.pow(3).is_one());
        assert!(matches!(
            three.to_witness(),
            Some(Witness::PowerCollision { exponent: 3, .. })
        ));

        assert_eq!(analyze_power(1).inverse_exponent, Some(BigUint::one()));
        assert_eq!(analyze_power(1).k, Some(0));
        let two = analyze_power(2);
        assert_eq!(two.gcd, 2);
        assert_eq!(two.collision.unwrap().omega, -Bn254::one());
    }

    #[test]
    fn sbox_collision_is_first_repeat() {
        let mut table: Vec<Gf256> = (0..=255u8).map(Gf256).collect();
        let a = analyze_sbox(SboxSource::Table, &table);
        assert!(a.bijective);
        assert_eq!(a.inverse.as_deref(), Some(&table[..]));
        table[0x10] = Gf256(0x05);
        table[0x20] = Gf256(0x07);
        let b = analyze_sbox(SboxSource::Table, &table);
        assert!(!b.bijective);
        assert_eq!(
            b.collision,
            Some(SboxCollision {
                x1: Gf256(0x05),
                x2: Gf256(0x10),
                y: Gf256(0x05)
            })
        );
    }
}
