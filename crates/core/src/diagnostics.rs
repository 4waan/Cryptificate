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
    combinations, determinant, encode_vec, kernel_vector, mat_vec, submatrix, weight, Matrix,
};
use crate::program::Program;
use crate::report::{
    aes_like_activity_bound, claim_ids, hades_outer_activity_bound, labels, Status, Witness,
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
// Power maps over BN254
// ---------------------------------------------------------------------------

/// `1^e = omega^e` with `omega != 1`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub struct PowerCollision {
    /// The base `a` with `omega = a^((p-1)/g)`.
    pub base: u64,
    pub omega: Bn254,
}

/// Bijectivity of `x -> x^e` on the BN254 scalar field.
///
/// The map is a bijection exactly when `gcd(e, p - 1) = 1`. Then
/// `d = e^-1 mod (p - 1)` inverts it, and `k` is the integer with
/// `e * d = (p - 1) * k + 1`. Otherwise `g = gcd(e, p - 1) > 1` and
/// `omega = a^((p - 1) / g)` for the smallest prime `a` with `omega != 1`
/// satisfies `omega^g = 1`, hence `omega^e = 1 = 1^e`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PowerAnalysis {
    pub exponent: u32,
    /// `gcd(e, p - 1)`.
    pub gcd: u32,
    pub bijective: bool,
    /// `d`, as a decimal string (it does not fit a JSON number).
    #[serde(serialize_with = "serialize_opt_decimal")]
    pub inverse_exponent: Option<BigUint>,
    /// `k` with `e * d = (p - 1) * k + 1`; `k < e`.
    pub k: Option<u64>,
    pub collision: Option<PowerCollision>,
}

impl PowerAnalysis {
    /// The report witness for a collision.
    pub fn to_witness(&self) -> Option<Witness> {
        self.collision.map(|c| Witness::PowerCollision {
            exponent: self.exponent,
            x1: Bn254::one().encode(),
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

/// See [`PowerAnalysis`].
pub fn analyze_power(exponent: u32) -> PowerAnalysis {
    let p = bn254_modulus();
    let n: BigUint = p - 1u32;
    let e = BigUint::from(exponent);
    let r = (&n % &e).to_u64().expect("remainder is below the exponent");
    let g = gcd_u64(u64::from(exponent), r) as u32;
    if g == 1 {
        let d = e.modinv(&n).expect("e is a unit modulo p - 1");
        let ed = &e * &d;
        let k = (&ed - 1u32) / &n;
        debug_assert!(((&k * &n) + 1u32) == ed);
        return PowerAnalysis {
            exponent,
            gcd: 1,
            bijective: true,
            k: Some(k.to_u64().expect("k is below the exponent")),
            inverse_exponent: Some(d),
            collision: None,
        };
    }
    let cofactor = &n / BigUint::from(g);
    let collision = (2..MAX_COLLISION_BASE)
        .filter(|&a| is_small_prime(a))
        .find_map(|a| {
            let w = BigUint::from(a).modpow(&cofactor, p);
            (!w.is_one()).then(|| PowerCollision {
                base: a,
                omega: Bn254::from_biguint(&w),
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
pub struct HadesDiagnostics {
    pub external: MatrixAnalysis<Bn254>,
    pub internal: MatrixAnalysis<Bn254>,
    pub power: PowerAnalysis,
    pub activity: ActivityAnalysis,
    pub program: Option<ProgramAnalysis<Bn254>>,
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
        CandidateDesign::Hades(d) => diagnose_hades(d, req.program.as_ref(), req.target),
    };
    Diagnostics {
        kind: DiagnosticsKind::Diagnostics,
        checked: false,
        label: labels::UNCHECKED_DIAGNOSTIC,
        model: req.design.model(),
        field: req.design.field(),
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

fn diagnose_hades(
    d: &HadesDesign,
    program: Option<&AnyProgram>,
    target: Target,
) -> (ModelDiagnostics, Vec<ClaimPrediction>) {
    let external = analyze_matrix(&d.external);
    let internal = analyze_matrix(&d.internal);
    let power = analyze_power(d.exponent().unwrap_or(1));
    let applicable = external.mds && internal.invertible && power.bijective;
    let activity = ActivityAnalysis {
        claim: claim_ids::ACTIVITY_OUTER,
        applicable,
        rounds: d.full_rounds,
        bound: Some(hades_outer_activity_bound(d.full_rounds)),
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
    let program = match program {
        Some(AnyProgram::Bn254(p)) if p.width == d.width => {
            let m = if target == Target::Internal {
                &d.internal
            } else {
                &d.external
            };
            Some(ProgramAnalysis::new(p, target, m))
        }
        _ => None,
    };

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
    ];
    if let Some(p) = &program {
        claims.push(program_prediction(p));
    }
    (
        ModelDiagnostics::Hades(HadesDiagnostics {
            external,
            internal,
            power,
            activity,
            program,
        }),
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
