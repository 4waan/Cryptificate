//! Program evaluation, coefficient matrices and cost measures.

use cryptificate_core::circuit::OpCounts;
use cryptificate_core::linalg::{aes_mixcolumns, identity, mat_vec};
use cryptificate_core::{validate_program, AnyProgram, Bn254, Field, Gf256, Instruction, Program};
use rand::{Rng, SeedableRng};
use rand_chacha::ChaCha20Rng;
use serde_json::json;

fn add<F>(a: usize, b: usize) -> Instruction<F> {
    Instruction::Add { a, b }
}

fn xtime(a: usize) -> Instruction<Gf256> {
    Instruction::Mul { k: Gf256(0x02), a }
}

/// AES MixColumns with a shared sum: t = a+b+c+d, y_i = 2(x_i + x_{i+1}) + t + x_i.
/// 15 additions and 4 multiplications by 02.
fn aes_shared_sum(first_pair: (usize, usize)) -> Program<Gf256> {
    let instructions = vec![
        add(0, 1),                       // 4
        add(4, 2),                       // 5
        add(5, 3),                       // 6  t
        add(first_pair.0, first_pair.1), // 7  a+b
        add(1, 2),                       // 8  b+c
        add(2, 3),                       // 9  c+d
        add(3, 0),                       // 10 d+a
        xtime(7),                        // 11
        xtime(8),                        // 12
        xtime(9),                        // 13
        xtime(10),                       // 14
        add(11, 6),                      // 15
        add(15, 0),                      // 16 y0
        add(12, 6),                      // 17
        add(17, 1),                      // 18 y1
        add(13, 6),                      // 19
        add(19, 2),                      // 20 y2
        add(14, 6),                      // 21
        add(21, 3),                      // 22 y3
    ];
    let p = Program {
        width: 4,
        name: Some("aes-shared-sum".into()),
        instructions,
        outputs: vec![16, 18, 20, 22],
    };
    p.check_at("").unwrap();
    p
}

fn bytes(v: &[u8]) -> Vec<Gf256> {
    v.iter().copied().map(Gf256).collect()
}

#[test]
fn shared_sum_implements_aes() {
    let p = aes_shared_sum((0, 1));
    assert_eq!(p.coefficient_matrix(), aes_mixcolumns());
    assert_eq!(p.first_mismatch(&aes_mixcolumns()), None);
    assert_eq!(p.distinguishing_input(&aes_mixcolumns()), None);
    // Section 2 gates through the program.
    assert_eq!(
        p.evaluate(&bytes(&[0x01, 0, 0, 0])),
        bytes(&[0x02, 0x01, 0x01, 0x03])
    );
    assert_eq!(
        p.evaluate(&bytes(&[0x80, 0, 0, 0])),
        bytes(&[0x1B, 0x80, 0x80, 0x9B])
    );
    // Random inputs agree with the matrix product.
    let mut rng = ChaCha20Rng::seed_from_u64(7);
    let m = aes_mixcolumns();
    for _ in 0..1000 {
        let x: Vec<Gf256> = (0..4).map(|_| Gf256(rng.gen())).collect();
        assert_eq!(p.evaluate(&x), mat_vec(&m, &x));
    }
}

#[test]
fn shared_sum_costs() {
    let p = aes_shared_sum((0, 1));
    let s = p.stats();
    assert_eq!(
        s.ops,
        OpCounts {
            add: 15,
            mul: 4,
            xtime: 4
        }
    );
    assert_eq!(s.depth, 5);
    assert_eq!(s.temps, 5);
    assert_eq!(
        serde_json::to_value(s).unwrap(),
        json!({"ops": {"add": 15, "mul": 4, "xtime": 4}, "depth": 5, "temps": 5})
    );
}

#[test]
fn one_wire_goes_wrong() {
    // xtime(a + b) in the first output replaced by xtime(a + c).
    let p = aes_shared_sum((0, 2));
    let m = aes_mixcolumns();
    let mismatch = p.first_mismatch(&m).unwrap();
    assert_eq!((mismatch.row, mismatch.col), (0, 1));
    assert_eq!(
        (mismatch.expected, mismatch.actual),
        (Gf256(0x03), Gf256(0x01))
    );
    let d = p.distinguishing_input(&m).unwrap();
    assert_eq!(d.input, bytes(&[0x00, 0x01, 0x00, 0x00]));
    assert_eq!(d.expected, bytes(&[0x03, 0x02, 0x01, 0x01]));
    assert_eq!(d.actual, bytes(&[0x01, 0x02, 0x01, 0x01]));
    assert_eq!(d.differing, vec![0]);
}

#[test]
fn identity_program() {
    let p: Program<Gf256> = Program {
        width: 4,
        name: None,
        instructions: vec![],
        outputs: vec![0, 1, 2, 3],
    };
    assert_eq!(p.coefficient_matrix(), identity::<Gf256>(4));
    let s = p.stats();
    assert_eq!((s.ops, s.depth, s.temps), (OpCounts::default(), 0, 0));
}

#[test]
fn bn254_shared_sum_implements_external_matrix() {
    // s = x0 + x1 + x2; y_i = s + x_i.
    let p: Program<Bn254> = Program {
        width: 3,
        name: None,
        instructions: vec![add(0, 1), add(3, 2), add(4, 0), add(4, 1), add(4, 2)],
        outputs: vec![5, 6, 7],
    };
    p.check_at("").unwrap();
    let m: Vec<Vec<Bn254>> = [[2u64, 1, 1], [1, 2, 1], [1, 1, 2]]
        .iter()
        .map(|r| r.iter().map(|&v| Bn254::from_u64(v)).collect())
        .collect();
    assert_eq!(p.coefficient_matrix(), m);
    let x = [Bn254::from_u64(5), -Bn254::one(), Bn254::from_u64(1 << 40)];
    assert_eq!(p.evaluate(&x), mat_vec(&m, &x));
    let s = p.stats();
    assert_eq!(
        s.ops,
        OpCounts {
            add: 5,
            mul: 0,
            xtime: 0
        }
    );
    assert_eq!(s.depth, 3);
    assert_eq!(s.temps, 3);
    // Multiplying by 2 over BN254 is not an xtime.
    let q: Program<Bn254> = Program {
        width: 3,
        name: None,
        instructions: vec![Instruction::Mul {
            k: Bn254::from_u64(2),
            a: 0,
        }],
        outputs: vec![3, 1, 2],
    };
    assert_eq!(
        q.op_counts(),
        OpCounts {
            add: 0,
            mul: 1,
            xtime: 0
        }
    );
}

#[test]
fn identity_hash_ignores_name_and_add_order() {
    let p = aes_shared_sum((0, 1));
    let mut renamed = p.clone();
    renamed.name = Some("other".into());
    let mut swapped = p.clone();
    swapped.instructions[0] = add(1, 0);
    assert_eq!(p.identity_hash(), renamed.identity_hash());
    assert_eq!(p.identity_hash(), swapped.identity_hash());
    assert_ne!(p.identity_hash(), aes_shared_sum((0, 2)).identity_hash());
    let mut outputs = p.clone();
    outputs.outputs.swap(0, 1);
    assert_ne!(p.identity_hash(), outputs.identity_hash());
    assert!(p.identity_hash().starts_with("sha256:"));
}

#[test]
fn program_json_round_trip() {
    let p = AnyProgram::Gf256(aes_shared_sum((0, 1)));
    let v = serde_json::to_value(&p).unwrap();
    assert_eq!(v["field"], "gf256");
    assert_eq!(
        v["instructions"][7],
        json!({"op": "mul", "k": "02", "a": 7})
    );
    assert_eq!(validate_program(&v).unwrap(), p);
    assert_eq!(serde_json::from_value::<AnyProgram>(v.clone()).unwrap(), p);
    let mut bad = v.clone();
    bad["field"] = json!("bn254");
    assert!(serde_json::from_value::<Program<Gf256>>(bad).is_err());
}

#[test]
fn dead_and_reused_temporaries() {
    // r4 = x0 + x1 is never used; r5 = x2 * 03 is used twice.
    let p: Program<Gf256> = Program {
        width: 4,
        name: None,
        instructions: vec![
            add(0, 1),
            Instruction::Mul {
                k: Gf256(0x03),
                a: 2,
            },
            add(5, 3),
            add(5, 0),
        ],
        outputs: vec![6, 7, 2, 3],
    };
    p.check_at("").unwrap();
    // After instruction 2: r5 (needed by instruction 3) and r6 (output).
    assert_eq!(p.max_live_temporaries(), 2);
    assert_eq!(
        p.op_counts(),
        OpCounts {
            add: 3,
            mul: 1,
            xtime: 0
        }
    );
    assert_eq!(p.depth(), 2);
}
