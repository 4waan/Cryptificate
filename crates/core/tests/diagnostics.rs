//! Unchecked diagnostics: MDS decisions, low-weight witnesses, offsets,
//! S-boxes, power maps and program mismatches.

use cryptificate_core::design::aes_sbox;
use cryptificate_core::diagnostics::{
    all_minors, analyze_matrix, analyze_power, branch_witness, diagnose, ModelDiagnostics,
};
use cryptificate_core::linalg::{combinations, mat_vec, weight, Matrix};
use cryptificate_core::report::{claim_ids, Status, Witness};
use cryptificate_core::{validate_analysis_request, Bn254, Field, Gf256};
use rand::{Rng, SeedableRng};
use rand_chacha::ChaCha20Rng;
use serde_json::{json, Value};

const AES: [[&str; 4]; 4] = [
    ["02", "03", "01", "01"],
    ["01", "02", "03", "01"],
    ["01", "01", "02", "03"],
    ["03", "01", "01", "02"],
];

fn aes_design(matrix: Value, offsets: Value) -> Value {
    json!({
        "model": "aes-like/gf256/v1", "field": "gf256", "width": 4,
        "matrix": matrix, "offsets": offsets, "rounds": 10, "sbox": {"kind": "aes"}
    })
}

fn add(a: usize, b: usize) -> Value {
    json!({"op": "add", "a": a, "b": b})
}

fn xtime(a: usize) -> Value {
    json!({"op": "mul", "k": "02", "a": a})
}

/// The textbook MixColumns column with a shared sum (15 XOR, 4 xtime);
/// instruction 3 computes the pair sum feeding the first output's xtime.
fn shared_sum(first_pair: (usize, usize)) -> Value {
    json!({
        "field": "gf256", "width": 4, "name": "aes-shared-sum",
        "instructions": [
            add(0, 1), add(4, 2), add(5, 3),
            add(first_pair.0, first_pair.1), xtime(7), add(0, 8), add(9, 6),
            add(1, 2), xtime(11), add(1, 12), add(13, 6),
            add(2, 3), xtime(15), add(2, 16), add(17, 6),
            add(3, 0), xtime(19), add(3, 20), add(21, 6)
        ],
        "outputs": [10, 14, 18, 22]
    })
}

fn diagnose_json(request: Value) -> (cryptificate_core::diagnostics::Diagnostics, Value) {
    let req = validate_analysis_request(&request).expect("valid request");
    let d = diagnose(&req);
    let v = serde_json::to_value(&d).unwrap();
    (d, v)
}

#[test]
fn aes_with_known_circuit() {
    let (d, v) = diagnose_json(json!({
        "design": aes_design(json!(AES), json!([0, 1, 2, 3])),
        "program": shared_sum((0, 1))
    }));
    assert_eq!(v["kind"], "diagnostics");
    assert_eq!(v["checked"], false);
    assert_eq!(v["label"], "Unchecked diagnostic");
    assert_eq!(v["matrix"]["minorCount"], 69);
    assert_eq!(v["matrix"]["mds"], true);
    assert!(v["matrix"]["branchWitness"].is_null());
    assert_eq!(v["offsets"]["distinct"], true);
    assert_eq!(v["sbox"]["bijective"], true);
    assert_eq!(v["sbox"]["source"], "aes");
    assert_eq!(v["sbox"]["inverse"][0x63], "00");
    assert_eq!(v["activity"]["applicable"], true);
    assert_eq!(v["activity"]["bound"], 55);
    assert_eq!(v["program"]["equivalent"], true);
    assert_eq!(
        v["program"]["stats"],
        json!({"ops": {"add": 15, "mul": 4, "xtime": 4}, "depth": 4, "temps": 5})
    );
    let statuses: Vec<(&str, Status)> = d.claims.iter().map(|c| (c.claim, c.predicted)).collect();
    assert_eq!(
        statuses,
        vec![
            (claim_ids::MATRIX_MDS, Status::Proved),
            (claim_ids::OFFSETS_DISPERSION, Status::Proved),
            (claim_ids::SBOX_BIJECTIVE, Status::Proved),
            (claim_ids::ACTIVITY_BOUND, Status::Proved),
            (claim_ids::CIRCUIT_EQUIVALENCE, Status::Proved),
        ]
    );
}

/// Story preset "one wire goes wrong": the first output's xtime(a0 ^ a1)
/// becomes xtime(a0 ^ a2).
#[test]
fn guided_wrong_wire_witness() {
    let (d, v) = diagnose_json(json!({
        "design": aes_design(json!(AES), json!([0, 1, 2, 3])),
        "program": shared_sum((0, 2))
    }));
    let p = &v["program"];
    assert_eq!(p["equivalent"], false);
    assert_eq!(
        p["coefficientMatrix"][0],
        json!(["02", "01", "03", "01"]),
        "row 0 of the changed circuit"
    );
    assert_eq!(
        p["firstMismatch"],
        json!({"row": 0, "col": 1, "expected": "03", "actual": "01"})
    );
    assert_eq!(
        p["distinguisher"],
        json!({
            "input": ["00", "01", "00", "00"],
            "expected": ["03", "02", "01", "01"],
            "actual": ["01", "02", "01", "01"],
            "differing": [0]
        })
    );
    let c = d.claim(claim_ids::CIRCUIT_EQUIVALENCE).unwrap();
    assert_eq!(c.predicted, Status::Refuted);
    assert_eq!(
        c.witness,
        Some(Witness::DistinguishingInput {
            input: vec!["00".into(), "01".into(), "00".into(), "00".into()],
            expected: vec!["03".into(), "02".into(), "01".into(), "01".into()],
            actual: vec!["01".into(), "02".into(), "01".into(), "01".into()],
            differing: vec![0],
        })
    );
}

/// Story preset "perfect implementation, weak diffusion".
#[test]
fn identity_matrix_and_circuit() {
    let id = json!([
        ["01", "00", "00", "00"],
        ["00", "01", "00", "00"],
        ["00", "00", "01", "00"],
        ["00", "00", "00", "01"]
    ]);
    let (d, v) = diagnose_json(json!({
        "design": aes_design(id, json!([0, 1, 2, 3])),
        "program": {"field": "gf256", "width": 4, "instructions": [], "outputs": [0, 1, 2, 3]}
    }));
    assert_eq!(v["matrix"]["mds"], false);
    // 12 off-diagonal entries, 36 - 6 order-2 minors (only the 6 principal ones are nonzero)
    // and 16 - 4 order-3 minors are zero.
    assert_eq!(v["matrix"]["zeroMinors"], 12 + 30 + 12);
    assert_eq!(
        d.claim(claim_ids::MATRIX_MDS).unwrap().witness,
        Some(Witness::Branch {
            input: vec!["01".into(), "00".into(), "00".into(), "00".into()],
            output: vec!["01".into(), "00".into(), "00".into(), "00".into()],
            input_weight: 1,
            output_weight: 1,
            bound: 5,
        })
    );
    assert_eq!(
        d.claim(claim_ids::ACTIVITY_BOUND).unwrap().predicted,
        Status::NotEstablished
    );
    assert_eq!(
        d.claim(claim_ids::CIRCUIT_EQUIVALENCE).unwrap().predicted,
        Status::Proved
    );
}

#[test]
fn row_scaled_aes_is_mds() {
    let mut m = json!(AES);
    m[0] = json!(["04", "06", "02", "02"]);
    let (d, _) = diagnose_json(json!({"design": aes_design(m, json!([0, 1, 2, 3]))}));
    assert_eq!(
        d.claim(claim_ids::MATRIX_MDS).unwrap().predicted,
        Status::Proved
    );
    assert!(d.claim(claim_ids::CIRCUIT_EQUIVALENCE).is_none());
}

#[test]
fn repeated_offsets() {
    let (d, v) = diagnose_json(json!({"design": aes_design(json!(AES), json!([0, 1, 1, 3]))}));
    assert_eq!(
        v["offsets"]["collision"],
        json!({"rows": [1, 2], "offset": 1})
    );
    let c = d.claim(claim_ids::OFFSETS_DISPERSION).unwrap();
    assert_eq!(c.predicted, Status::Refuted);
    assert_eq!(
        c.witness,
        Some(Witness::OffsetCollision {
            rows: vec![1, 2],
            offset: 1
        })
    );
    assert_eq!(
        d.claim(claim_ids::ACTIVITY_BOUND).unwrap().predicted,
        Status::NotEstablished
    );
}

#[test]
fn table_sbox_collision() {
    let mut table: Vec<String> = aes_sbox().iter().map(|b| format!("{b:02X}")).collect();
    table[0x01] = table[0x00].clone();
    let mut design = aes_design(json!(AES), json!([0, 1, 2, 3]));
    design["sbox"] = json!({"kind": "table", "table": table});
    let (d, v) = diagnose_json(json!({ "design": design }));
    assert_eq!(v["sbox"]["source"], "table");
    assert!(v["sbox"]["inverse"].is_null());
    assert_eq!(
        d.claim(claim_ids::SBOX_BIJECTIVE).unwrap().witness,
        Some(Witness::SboxCollision {
            x1: "00".into(),
            x2: "01".into(),
            y: "63".into()
        })
    );
}

fn hades(exponent: u32) -> Value {
    json!({
        "model": "hades/bn254/v1", "field": "bn254", "width": 3,
        "external": [["2","1","1"],["1","2","1"],["1","1","2"]],
        "internal": [["2","1","1"],["1","2","1"],["1","1","3"]],
        "fullRounds": 8, "partialRounds": 56,
        "sbox": {"kind": "power", "exponent": exponent}
    })
}

#[test]
fn poseidon2_style_design() {
    let program = json!({
        "field": "bn254", "width": 3,
        "instructions": [add(0, 1), add(3, 2), add(4, 0), add(4, 1), add(4, 2)],
        "outputs": [5, 6, 7]
    });
    let (d, v) = diagnose_json(json!({"design": hades(5), "program": program}));
    assert_eq!(v["target"], "external");
    assert_eq!(v["external"]["minorCount"], 19);
    assert_eq!(v["external"]["mds"], true);
    assert_eq!(v["external"]["determinant"], "4");
    assert_eq!(v["internal"]["determinant"], "7");
    assert_eq!(v["internal"]["invertible"], true);
    assert_eq!(v["power"]["gcd"], 1);
    assert_eq!(v["power"]["bijective"], true);
    assert!(v["power"]["inverseExponent"].is_string());
    // p - 1 = 1 (mod 5), so 5 d = k (p - 1) + 1 needs k = 4.
    assert_eq!(v["power"]["k"], 4);
    assert_eq!(v["program"]["equivalent"], true);
    assert_eq!(
        v["program"]["stats"]["ops"],
        json!({"add": 5, "mul": 0, "xtime": 0})
    );
    let statuses: Vec<Status> = d.claims.iter().map(|c| c.predicted).collect();
    assert_eq!(statuses, vec![Status::Proved; 5]);
    assert!(matches!(d.details, ModelDiagnostics::Hades(_)));
}

#[test]
fn exponent_three_collides() {
    let (d, v) = diagnose_json(json!({ "design": hades(3) }));
    assert_eq!(v["power"]["gcd"], 3);
    assert!(v["power"]["inverseExponent"].is_null());
    let c = d.claim(claim_ids::SBOX_BIJECTIVE).unwrap();
    assert_eq!(c.predicted, Status::Refuted);
    let Some(Witness::PowerCollision {
        exponent, x1, x2, ..
    }) = &c.witness
    else {
        panic!("expected a power collision, got {:?}", c.witness)
    };
    assert_eq!(*exponent, 3);
    assert_eq!(x1, "1");
    let omega = Bn254::decode(x2).unwrap();
    assert!(!omega.is_one());
    assert_eq!(omega.pow(3), Bn254::one());
    assert_eq!(
        d.claim(claim_ids::ACTIVITY_OUTER).unwrap().predicted,
        Status::NotEstablished
    );
    // The independent check: omega is a primitive cube root, 1 + omega + omega^2 = 0.
    assert!((Bn254::one() + omega + omega * omega).is_zero());
    // 2 is a cube in this field, so the first base that works is 3.
    assert_eq!(analyze_power(3).collision.unwrap().base, 3);
}

fn random_matrix<F: Field>(
    rng: &mut ChaCha20Rng,
    n: usize,
    sample: impl Fn(&mut ChaCha20Rng) -> F,
) -> Matrix<F> {
    (0..n)
        .map(|_| (0..n).map(|_| sample(rng)).collect())
        .collect()
}

/// The Gaussian-elimination search and the minors list are computed
/// independently; they must agree on MDS, and every witness must be valid.
fn cross_check<F: Field>(m: &Matrix<F>) {
    let n = m.len();
    let mds = all_minors(m).iter().all(|x| !x.value.is_zero());
    let w = branch_witness(m);
    assert_eq!(mds, w.is_none(), "{m:?}");
    if let Some(w) = w {
        assert!(weight(&w.input) > 0);
        assert_eq!(w.output, mat_vec(m, &w.input));
        assert_eq!(w.input_weight, weight(&w.input));
        assert_eq!(w.output_weight, weight(&w.output));
        assert!(w.input_weight + w.output_weight < n + 1);
        assert!(w.input_weight <= w.support.len());
        assert!(w.zero_outputs.iter().all(|&z| w.output[z].is_zero()));
    }
    let a = analyze_matrix(m);
    assert_eq!(a.mds, mds);
    assert_eq!(a.kernel_vector.is_some(), !a.invertible);
    if let Some(k) = &a.kernel_vector {
        assert!(weight(k) > 0);
        assert!(mat_vec(m, k).iter().all(Field::is_zero));
    }
}

/// The branch number `min weight(x) + weight(M x)` over nonzero `x`, from
/// the minors list alone: an `x` supported on `S` with `M x` vanishing on
/// `Z` exists exactly when `M[Z, S]` has rank below `|S|`, that is, when
/// every `|S| x |S|` minor with columns `S` and rows inside `Z` is zero.
/// Such a vector has weight at most `|S| + n - |Z|`, and the vector of
/// least weight reaches that bound for its own support and zero set.
fn branch_number_from_minors<F: Field>(m: &Matrix<F>) -> usize {
    let n = m.len();
    let minors = all_minors(m);
    let zero = |rows: &[usize], cols: &[usize]| {
        minors
            .iter()
            .find(|x| x.rows == rows && x.cols == cols)
            .is_some_and(|x| x.value.is_zero())
    };
    let mut best = 2 * n;
    for s in 1..=n {
        for cols in combinations(n, s) {
            for z in s..=n {
                for rows in combinations(n, z) {
                    let deficient = combinations(z, s).iter().all(|pick| {
                        let r: Vec<usize> = pick.iter().map(|&i| rows[i]).collect();
                        zero(&r, &cols)
                    });
                    if deficient {
                        best = best.min(s + n - z);
                    }
                }
            }
        }
    }
    best
}

/// The Gaussian-elimination witness has the least combined weight of all
/// nonzero vectors, not only of the vectors it tries.
#[test]
fn branch_witness_has_least_weight() {
    let mut rng = ChaCha20Rng::seed_from_u64(0xb7a9);
    let mut refuted = 0;
    for i in 0..300 {
        let alphabet = [0x00u8, 0x01, 0x02, 0x03, 0x8D][..2 + i % 4].to_vec();
        let m = random_matrix(&mut rng, 4, |r| {
            Gf256(alphabet[r.gen_range(0..alphabet.len())])
        });
        let exact = branch_number_from_minors(&m);
        match branch_witness(&m) {
            Some(w) => {
                refuted += 1;
                assert_eq!(w.combined_weight(), exact, "{m:?}");
            }
            None => assert_eq!(exact, 5, "{m:?}"),
        }
        let b = random_matrix(&mut rng, 3, |r| Bn254::from_u64(r.gen_range(0..3)));
        let exact = branch_number_from_minors(&b);
        assert_eq!(
            branch_witness(&b).map_or(4, |w| w.combined_weight()),
            exact,
            "{b:?}"
        );
    }
    assert!(
        refuted > 100,
        "the sample must contain many non-MDS matrices"
    );
    // Width 2, against every nonzero input.
    for _ in 0..20 {
        let m = random_matrix(&mut rng, 2, |r| {
            Gf256([0x00, 0x01, 0x02][r.gen_range(0..3)])
        });
        let exhaustive = (1..=0xFFFFu16)
            .map(|v| {
                let x = [Gf256((v >> 8) as u8), Gf256(v as u8)];
                weight(&x) + weight(&mat_vec(&m, &x))
            })
            .min()
            .unwrap();
        assert_eq!(
            branch_witness(&m).map_or(3, |w| w.combined_weight()),
            exhaustive,
            "{m:?}"
        );
    }
}

#[test]
fn search_agrees_with_minors_on_random_matrices() {
    let mut rng = ChaCha20Rng::seed_from_u64(0x5eed);
    let mut refuted = 0;
    for i in 0..600 {
        // Few distinct values make zero minors common.
        let alphabet = [0x00u8, 0x01, 0x02, 0x03, 0x8D][..2 + i % 4].to_vec();
        let m = random_matrix(&mut rng, 4, |r| {
            Gf256(alphabet[r.gen_range(0..alphabet.len())])
        });
        cross_check(&m);
        refuted += usize::from(branch_witness(&m).is_some());
        let full = random_matrix(&mut rng, 4, |r| Gf256(r.gen()));
        cross_check(&full);
        let b = random_matrix(&mut rng, 3, |r| Bn254::from_u64(r.gen_range(0..4)));
        cross_check(&b);
    }
    assert!(
        refuted > 100,
        "the sample must contain many non-MDS matrices"
    );
}

#[test]
fn diagnostics_are_deterministic() {
    let req = json!({
        "design": aes_design(json!(AES), json!([0, 0, 2, 2])),
        "program": shared_sum((0, 3))
    });
    let (_, a) = diagnose_json(req.clone());
    let (_, b) = diagnose_json(req);
    assert_eq!(a, b);
}

#[test]
fn hades_internal_target() {
    // The external shared-sum circuit checked against the internal matrix:
    // they differ only in the last diagonal entry (3 instead of 2).
    let program = json!({
        "field": "bn254", "width": 3,
        "instructions": [add(0, 1), add(3, 2), add(4, 0), add(4, 1), add(4, 2)],
        "outputs": [5, 6, 7]
    });
    let (d, v) =
        diagnose_json(json!({"design": hades(5), "program": program, "target": "internal"}));
    assert_eq!(v["target"], "internal");
    assert_eq!(v["program"]["target"], "internal");
    assert_eq!(
        v["program"]["firstMismatch"],
        json!({"row": 2, "col": 2, "expected": "3", "actual": "2"})
    );
    assert_eq!(
        v["program"]["distinguisher"],
        json!({"input": ["0", "0", "1"], "expected": ["1", "1", "3"], "actual": ["1", "1", "2"], "differing": [2]})
    );
    let c = d.claim(claim_ids::CIRCUIT_EQUIVALENCE).unwrap();
    assert_eq!(c.predicted, Status::Refuted);
    assert!(c.note.contains("internal matrix"));
}

#[test]
fn singular_internal_matrix() {
    let mut design = hades(5);
    design["internal"] = json!([["1", "1", "0"], ["1", "1", "0"], ["0", "0", "1"]]);
    let (d, v) = diagnose_json(json!({ "design": design }));
    assert_eq!(v["internal"]["determinant"], "0");
    assert_eq!(v["internal"]["invertible"], false);
    let k: Vec<Bn254> = v["internal"]["kernelVector"]
        .as_array()
        .unwrap()
        .iter()
        .map(|x| Bn254::decode(x.as_str().unwrap()).unwrap())
        .collect();
    let m: Matrix<Bn254> = [[1u64, 1, 0], [1, 1, 0], [0, 0, 1]]
        .iter()
        .map(|r| r.iter().map(|&x| Bn254::from_u64(x)).collect())
        .collect();
    assert!(weight(&k) > 0);
    assert!(mat_vec(&m, &k).iter().all(Field::is_zero));
    assert_eq!(
        d.claim(claim_ids::INTERNAL_INVERTIBLE).unwrap().predicted,
        Status::Refuted
    );
}
