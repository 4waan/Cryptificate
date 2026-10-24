//! Builds real variants with cargo, checks them and times them with the
//! quick-test settings.
//!
//! Variants are built under `CARGO_TARGET_TMPDIR`, so dependencies compiled
//! by one run are reused by the next.

use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};

use cryptificate_core::design::AnyMatrix;
use cryptificate_core::linalg::aes_mixcolumns;
use cryptificate_core::{AnyProgram, Bn254, Field, Instruction, Profile, Program};
use cryptificate_native::{codegen_json, run_native_json, NativeError, NativeOptions};
use cryptificate_search::baseline::{aes_shared_sum, direct_bn254, poseidon2_external3};
use cryptificate_search::{run_search, SearchRequest};
use serde_json::{json, Value};

fn options(name: &str) -> NativeOptions {
    let tmp = PathBuf::from(env!("CARGO_TARGET_TMPDIR"));
    let mut o = NativeOptions::new(tmp.join(format!("native-work-{name}"))).quick_test();
    o.build.target_dir = tmp.join("native-target");
    o
}

fn aes_matrix() -> Value {
    json!([
        ["02", "03", "01", "01"],
        ["01", "02", "03", "01"],
        ["01", "01", "02", "03"],
        ["03", "01", "01", "02"]
    ])
}

fn best_search_candidate() -> AnyProgram {
    let mut req = SearchRequest::new(AnyMatrix::Gf256(aes_mixcolumns()), Profile::Quick);
    req.seed = "c0ffee".into();
    let out = run_search(&req);
    out.candidate(&out.shortlist[0]).unwrap().program.clone()
}

/// The "one wire goes wrong" circuit: xtime(x0 ^ x1) becomes xtime(x0 ^ x2).
fn miswired() -> AnyProgram {
    let mut p = aes_shared_sum();
    p.instructions[3] = Instruction::Add { a: 0, b: 2 };
    p.into()
}

#[test]
fn codegen_document_shape() {
    let out = codegen_json(&json!({
        "field": "gf256", "width": 4, "matrix": aes_matrix(),
        "programs": [{"id": "baseline-known", "program": AnyProgram::from(aes_shared_sum())}]
    }))
    .unwrap();
    assert_eq!(out["kind"], "codegen");
    assert_eq!(out["abi"]["symbol"], "mix_batch");
    assert_eq!(out["abi"]["bytesPerColumn"], 4);
    let v = &out["variants"][0];
    assert_eq!(v["origin"], "baseline-known");
    assert!(v["source"].as_str().unwrap().contains("xtime(r7)"));
    assert!(v["sourceSha256"].as_str().unwrap().starts_with("sha256:"));
    assert!(out["workspace"]["manifest"]
        .as_str()
        .unwrap()
        .contains("[profile.release]"));
    let bn = codegen_json(&json!({
        "field": "bn254", "width": 3,
        "programs": [{"id": "c1", "program": AnyProgram::from(direct_bn254(&poseidon2_external3()))}]
    }))
    .unwrap();
    assert_eq!(bn["abi"]["bytesPerColumn"], 96);
}

#[test]
fn wrong_variants_never_reach_the_leaderboard() {
    let identity =
        json!({"field": "gf256", "width": 4, "instructions": [], "outputs": [0, 1, 2, 3]});
    let input = json!({
        "mode": "protocol", "field": "gf256", "width": 4, "matrix": aes_matrix(), "seed": "5eed",
        "variants": [
            {"id": "c1", "origin": "search", "program": best_search_candidate()},
            {"id": "baseline-known", "program": AnyProgram::from(aes_shared_sum())},
            // No instructions at all: faster than any correct circuit, and wrong.
            {"id": "fast-wrong", "origin": "search", "program": identity},
            {"id": "miswired", "origin": "user", "program": miswired()}
        ]
    });
    let r = run_native_json(&input, &options("gf256")).unwrap();
    let by_id = |id: &str| {
        r["correctness"]
            .as_array()
            .unwrap()
            .iter()
            .find(|c| c["id"] == id)
            .unwrap()
            .clone()
    };
    for id in ["c1", "baseline-known"] {
        let c = by_id(id);
        assert_eq!(c["passed"], true, "{c}");
        assert_eq!(c["cases"], 9214);
        assert_eq!(c["counts"]["basis"], 1021);
        assert_eq!(c["counts"]["multiword"], 8192);
    }
    assert_eq!(by_id("c1")["checksum"], by_id("baseline-known")["checksum"]);
    assert_eq!(by_id("fast-wrong")["passed"], false);
    // The guided wiring witness (story 2).
    let w = &by_id("miswired")["witness"];
    assert_eq!(by_id("miswired")["passed"], false);
    assert_eq!(w["kind"], "distinguishing-input");
    let excluded: Vec<&str> = r["excluded"]
        .as_array()
        .unwrap()
        .iter()
        .map(|e| e["id"].as_str().unwrap())
        .collect();
    assert_eq!(excluded, ["fast-wrong", "miswired"]);
    for list in ["leaderboard", "workloads", "comparisons"] {
        for row in r[list].as_array().unwrap() {
            let id = row.get("id").or(row.get("candidate")).unwrap();
            assert!(id != "fast-wrong" && id != "miswired", "{list}: {row}");
            if let Some(b) = row.get("baseline") {
                assert!(b != "fast-wrong" && b != "miswired");
            }
        }
    }
    let ids: Vec<&str> = r["leaderboard"]
        .as_array()
        .unwrap()
        .iter()
        .map(|e| e["id"].as_str().unwrap())
        .collect();
    assert_eq!(ids.len(), 2);
    // Three sessions; confirmation sessions time the frozen candidate and its baseline.
    assert_eq!(r["sessions"].as_array().unwrap().len(), 3);
    assert_eq!(r["frozen"], "c1");
    assert_eq!(r["sessions"][1]["purpose"], "confirmation");
    assert_ne!(
        r["sessions"][1]["seeds"]["input"],
        r["sessions"][2]["seeds"]["input"]
    );
    assert_eq!(r["sessions"][0]["checksumsAgree"], true);
    // Quick-test settings never support a claimed speed-up.
    assert_eq!(r["verdict"], "inconclusive");
    let workloads = r["workloads"].as_array().unwrap();
    let bytes: Vec<u64> = workloads
        .iter()
        .map(|w| w["bytes"].as_u64().unwrap())
        .collect();
    assert!(bytes.contains(&4096) && bytes.contains(&65536) && bytes.contains(&1_048_576));
    for w in workloads {
        assert_eq!(w["samples"].as_array().unwrap().len(), 5);
        assert!(w["iterations"].as_u64().unwrap() >= 1);
        assert!(w["minSampleNs"].as_u64().unwrap() >= 2_000_000);
    }
    let c = &r["comparisons"][0];
    assert!(c["ci95"][0].as_f64().unwrap() <= c["ratio"].as_f64().unwrap());
    assert!(r["machine"]["ramMiB"].as_u64().is_some());
    assert!(r["build"]["variants"][0]["libSha256"]
        .as_str()
        .unwrap()
        .starts_with("sha256:"));
}

#[test]
fn bn254_variants_pass_correctness() {
    let m = poseidon2_external3();
    // A circuit with a large constant: y0 = (p - 1) * (-(2 x0 + x1 + x2)).
    let mut negated = direct_bn254(&m);
    let y0 = negated.outputs[0];
    negated.instructions.push(Instruction::Mul {
        k: -Bn254::one(),
        a: y0,
    });
    let r1 = negated.register_count() - 1;
    negated.instructions.push(Instruction::Mul {
        k: -Bn254::one(),
        a: r1,
    });
    negated.outputs[0] = r1 + 1;
    let wrong = Program::<Bn254> {
        instructions: vec![Instruction::Add { a: 0, b: 1 }],
        outputs: vec![3, 1, 2],
        ..direct_bn254(&m)
    };
    let input = json!({
        "mode": "benchmark", "session": 2, "field": "bn254", "width": 3,
        "matrix": [["2","1","1"],["1","2","1"],["1","1","2"]],
        "variants": [
            {"id": "baseline-direct", "program": AnyProgram::from(direct_bn254(&m))},
            {"id": "c1", "program": AnyProgram::from(cryptificate_search::baseline::bn254_shared_sum())},
            {"id": "c2", "program": AnyProgram::from(negated)},
            {"id": "c3", "program": AnyProgram::from(wrong)}
        ]
    });
    let r = run_native_json(&input, &options("bn254")).unwrap();
    let results: Vec<(String, bool)> = r["correctness"]
        .as_array()
        .unwrap()
        .iter()
        .map(|c| {
            (
                c["id"].as_str().unwrap().to_string(),
                c["passed"].as_bool().unwrap(),
            )
        })
        .collect();
    assert_eq!(
        results,
        [
            ("baseline-direct".into(), true),
            ("c1".into(), true),
            ("c2".into(), true),
            ("c3".into(), false)
        ]
    );
    let c = &r["correctness"][0];
    assert_eq!(c["counts"]["basis"], 1 + 3 * 28);
    assert_eq!(c["cases"], 1 + 3 * 28 + 8192 + 1);
    assert_eq!(r["sessions"].as_array().unwrap().len(), 1);
    assert_eq!(r["sessions"][0]["session"], 2);
    assert!(r["verdict"].is_null());
    assert_eq!(r["workloads"][0]["bytes"], 4032); // 42 columns of 96 bytes
    assert_eq!(r["abi"]["bytesPerColumn"], 96);
}

#[test]
fn invalid_requests_are_reported_as_such() {
    let base = json!({
        "mode": "correctness", "field": "gf256", "width": 4, "matrix": aes_matrix(),
        "codegen": {"variants": [{"id": "c1", "program": AnyProgram::from(aes_shared_sum()), "sourceSha256": "sha256:00"}]}
    });
    match run_native_json(&base, &options("invalid")) {
        Err(NativeError::Invalid(e)) => {
            assert!(e.message.contains("differs from the regenerated source"))
        }
        other => panic!("expected an invalid-input error, got {other:?}"),
    }
    let mut bad = base.clone();
    bad["matrix"][0][0] = json!("zz");
    let e = run_native_json(&bad, &options("invalid")).unwrap_err();
    assert_eq!(e.to_envelope()["error"]["path"], "/matrix/0/0");
}

#[test]
fn bench_binary_reads_stdin_and_sets_exit_codes() {
    let tmp = PathBuf::from(env!("CARGO_TARGET_TMPDIR"));
    let run = |input: &str| {
        let mut child = Command::new(env!("CARGO_BIN_EXE_cryptificate-bench"))
            .args(["--quick-test", "--work-dir"])
            .arg(tmp.join("native-work-bin"))
            .arg("--target-dir")
            .arg(tmp.join("native-target"))
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .unwrap();
        child
            .stdin
            .take()
            .unwrap()
            .write_all(input.as_bytes())
            .unwrap();
        let out = child.wait_with_output().unwrap();
        (
            out.status.code(),
            serde_json::from_slice::<Value>(&out.stdout).unwrap(),
        )
    };
    let ok = json!({
        "mode": "correctness", "field": "gf256", "width": 4, "matrix": aes_matrix(),
        "variants": [{"id": "baseline-known", "program": AnyProgram::from(aes_shared_sum())}]
    });
    let (code, report) = run(&ok.to_string());
    assert_eq!(code, Some(0));
    assert_eq!(report["correctness"][0]["passed"], true);
    assert_eq!(report["mode"], "correctness");
    let (code, err) = run("{");
    assert_eq!(code, Some(2));
    assert_eq!(err["error"]["code"], "invalid_json");
}
