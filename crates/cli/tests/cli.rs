//! Runs `cryptificate-engine` over the example inputs in `examples/` and
//! compares the essential parts of its output with the snapshots in
//! `tests/snapshots/`.
//!
//! Set `UPDATE_SNAPSHOTS=1` to rewrite the snapshots after an intended
//! change, then review the diff.
//!
//! `cargo test -p cryptificate-cli -- --ignored` additionally runs Lean on
//! every emitted certificate (needs `lake` and a built `lean/` package) and
//! checks each audit line and echoed input against what the engine expected.

use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use serde_json::{json, Value};

const ENGINE: &str = env!("CARGO_BIN_EXE_cryptificate-engine");

fn repo() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

struct Output {
    code: i32,
    json: Value,
    stderr: String,
}

fn run_in(dir: &Path, args: &[&str], input: &str, env: &[(&str, &str)]) -> Output {
    let mut cmd = Command::new(ENGINE);
    cmd.args(args)
        .current_dir(dir)
        .env_remove("CRYPTIFICATE_LEAN_DIR")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    for (k, v) in env {
        cmd.env(k, v);
    }
    let mut child = cmd.spawn().expect("engine starts");
    child
        .stdin
        .take()
        .unwrap()
        .write_all(input.as_bytes())
        .unwrap();
    let out = child.wait_with_output().unwrap();
    let stdout = String::from_utf8(out.stdout).unwrap();
    Output {
        code: out.status.code().unwrap_or(-1),
        json: serde_json::from_str(&stdout).unwrap_or(Value::Null),
        stderr: String::from_utf8(out.stderr).unwrap(),
    }
}

fn run(args: &[&str], input: &str) -> Output {
    run_in(&repo(), args, input, &[])
}

fn example(path: &str) -> Value {
    let text = std::fs::read_to_string(repo().join("examples").join(path)).unwrap();
    serde_json::from_str(&text).unwrap()
}

/// The story cases: name, design, optional program.
const CASES: &[(&str, &str, Option<&str>)] = &[
    ("aes-known", "aes", Some("aes-known-shared-sum")),
    ("aes-wrong-wire", "aes", Some("aes-wrong-wire")),
    ("identity", "identity", Some("identity")),
    ("aes-row-scaled", "aes-row-scaled", None),
    ("repeated-offsets", "repeated-offsets", None),
    (
        "poseidon2",
        "poseidon2-bn254",
        Some("poseidon2-external-shared-sum"),
    ),
    (
        "poseidon2-exponent3",
        "poseidon2-exponent3",
        Some("poseidon2-external-shared-sum"),
    ),
];

fn analysis_request(design: &str, program: Option<&str>) -> String {
    let mut v = json!({ "design": example(&format!("designs/{design}.json")) });
    if let Some(p) = program {
        v["program"] = example(&format!("programs/{p}.json"));
    }
    v.to_string()
}

/// The parts of `diagnose` output a reader relies on; the full minors list
/// and tables are left out of the snapshot.
fn essential_diagnostics(d: &Value) -> Value {
    let matrix = |m: &Value| {
        json!({
            "mds": m["mds"],
            "minorCount": m["minorCount"],
            "zeroMinors": m["zeroMinors"],
            "determinant": m["determinant"],
            "branchWitness": m["branchWitness"],
            "kernelVector": m["kernelVector"],
        })
    };
    let mut out = json!({
        "model": d["model"],
        "target": d["target"],
        "claims": d["claims"],
    });
    for key in ["matrix", "external", "internal"] {
        if d.get(key).is_some() {
            out[key] = matrix(&d[key]);
        }
    }
    for key in ["offsets", "activity"] {
        if d.get(key).is_some() {
            out[key] = d[key].clone();
        }
    }
    if let Some(s) = d.get("sbox") {
        out["sbox"] = json!({"source": s["source"], "bijective": s["bijective"], "collision": s["collision"]});
    }
    if let Some(p) = d.get("power") {
        out["power"] = p.clone();
    }
    if let Some(p) = d.get("program").filter(|p| !p.is_null()) {
        out["program"] = json!({
            "stats": p["stats"],
            "identityHash": p["identityHash"],
            "equivalent": p["equivalent"],
            "coefficientMatrix": p["coefficientMatrix"],
            "firstMismatch": p["firstMismatch"],
            "distinguisher": p["distinguisher"],
        });
    }
    out
}

fn check_snapshot(name: &str, actual: &Value) {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/snapshots")
        .join(format!("{name}.json"));
    let text = serde_json::to_string_pretty(actual).unwrap() + "\n";
    if std::env::var_os("UPDATE_SNAPSHOTS").is_some() {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, text).unwrap();
        return;
    }
    let expected = std::fs::read_to_string(&path).unwrap_or_else(|_| {
        panic!(
            "missing snapshot {}; run with UPDATE_SNAPSHOTS=1",
            path.display()
        )
    });
    let expected: Value = serde_json::from_str(&expected).unwrap();
    assert_eq!(
        &expected, actual,
        "snapshot {name} differs; run with UPDATE_SNAPSHOTS=1 and review the diff"
    );
}

#[test]
fn story_cases_validate_and_diagnose() {
    for &(name, design, program) in CASES {
        let input = analysis_request(design, program);
        let v = run(&["validate"], &input);
        assert_eq!(v.code, 0, "{name}: {}", v.stderr);
        assert_eq!(v.json["kind"], "analysis");
        let d = run(&["diagnose"], &input);
        assert_eq!(d.code, 0, "{name}: {}", d.stderr);
        assert_eq!(d.json["inputDigest"], v.json["inputDigest"]);
        assert_eq!(d.json["checked"], false);
        check_snapshot(
            name,
            &json!({
                "inputDigest": v.json["inputDigest"],
                "diagnostics": essential_diagnostics(&d.json),
            }),
        );
    }
}

/// The guided witness of the "one wire goes wrong" story, end to end.
#[test]
fn wrong_wire_witness() {
    let d = run(
        &["diagnose"],
        &analysis_request("aes", Some("aes-wrong-wire")),
    )
    .json;
    assert_eq!(
        d["program"]["distinguisher"],
        json!({
            "input": ["00", "01", "00", "00"],
            "expected": ["03", "02", "01", "01"],
            "actual": ["01", "02", "01", "01"],
            "differing": [0]
        })
    );
    let claim = d["claims"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["claim"] == "circuit.equivalence")
        .unwrap();
    assert_eq!(claim["predicted"], "refuted");
    assert_eq!(claim["witness"]["kind"], "distinguishing-input");
}

#[test]
fn validate_normalizes_requests() {
    let mut design = example("designs/aes.json");
    design["matrix"][0][0] = json!("0a");
    let v = run(&["validate"], &json!({ "design": design }).to_string());
    assert_eq!(v.code, 0);
    assert_eq!(v.json["request"]["design"]["matrix"][0][0], "0A");
    assert_eq!(v.json["request"]["target"], "matrix");
    assert!(v.json["inputDigest"]
        .as_str()
        .unwrap()
        .starts_with("sha256:"));

    let e = run(
        &["validate"],
        &json!({"design": example("designs/poseidon2-bn254.json"), "profile": "quick", "seed": "C0FFEE"})
            .to_string(),
    );
    assert_eq!(e.code, 0, "{}", e.stderr);
    assert_eq!(e.json["kind"], "experiment");
    assert_eq!(e.json["request"]["seed"], "c0ffee");
    assert_eq!(e.json["request"]["profile"], "quick");
}

#[test]
fn invalid_input_exits_2_with_envelope() {
    let bad = run(&["diagnose"], "{not json");
    assert_eq!(bad.code, 2);
    assert_eq!(bad.json["error"]["code"], "invalid_json");
    assert_eq!(bad.json["error"]["path"], "");

    let mut design = example("designs/aes.json");
    design["matrix"][0][1] = json!("0x03");
    let byte = run(&["emit-lean"], &json!({ "design": design }).to_string());
    assert_eq!(byte.code, 2);
    assert_eq!(byte.json["error"]["code"], "invalid_byte");
    assert_eq!(byte.json["error"]["path"], "/design/matrix/0/1");
    assert!(byte.json["error"]["message"].is_string());

    let wrong_field = run(
        &["validate"],
        &json!({"design": example("designs/aes.json"), "program": example("programs/poseidon2-external-shared-sum.json")})
            .to_string(),
    );
    assert_eq!(wrong_field.code, 2);
    assert_eq!(wrong_field.json["error"]["code"], "field_mismatch");
    assert_eq!(wrong_field.json["error"]["path"], "/program/field");

    let not_analysis = run(
        &["diagnose"],
        &json!({"design": example("designs/aes.json"), "profile": "quick"}).to_string(),
    );
    assert_eq!(not_analysis.code, 2);
    assert_eq!(not_analysis.json["error"]["code"], "unknown_field");
}

#[test]
fn command_line_handling() {
    let help = run(&["--help"], "");
    assert_eq!(help.code, 0);
    let out = Command::new(ENGINE).arg("--help").output().unwrap();
    let text = String::from_utf8(out.stdout).unwrap();
    for sub in ["validate", "diagnose", "emit-lean"] {
        assert!(
            text.lines()
                .any(|l| l.split_whitespace().next() == Some(sub)),
            "help must list {sub}"
        );
    }
    let version = Command::new(ENGINE).arg("--version").output().unwrap();
    assert!(String::from_utf8(version.stdout)
        .unwrap()
        .starts_with("cryptificate-engine "));
    assert_eq!(run(&["prove"], "{}").code, 64);
    assert_eq!(run(&[], "{}").code, 64);
}

#[test]
fn emit_lean_reports_missing_templates() {
    let missing = run(
        &["--lean-dir", "/nonexistent/cryptificate", "emit-lean"],
        &analysis_request("aes", None),
    );
    assert_eq!(missing.code, 1);
    assert_eq!(missing.json["error"]["code"], "templates_unavailable");
    assert!(missing.stderr.contains("--lean-dir"));
}

fn repo_has_templates() -> bool {
    repo().join("lean/templates/header.json").is_file()
}

/// Every predicted claim is either certified, with the predicted status, or
/// listed as skipped.
fn check_emission(name: &str, diag: &Value, emission: &Value) {
    let source = emission["source"].as_str().unwrap();
    assert!(source.starts_with("import Cryptificate"), "{name}");
    assert!(!source.contains("{{"), "{name}: unfilled placeholder");
    for c in diag["claims"].as_array().unwrap() {
        let id = &c["claim"];
        let certified = emission["expect"]
            .as_array()
            .unwrap()
            .iter()
            .find(|x| &x["claim"] == id);
        let skipped = emission["skipped"]
            .as_array()
            .unwrap()
            .iter()
            .any(|x| &x["claim"] == id);
        match certified {
            Some(x) => {
                assert_eq!(x["status"], c["predicted"], "{name}: {id}");
                assert!(source.contains(&format!(
                    "#cryptificate_audit {}",
                    x["theorem"].as_str().unwrap()
                )));
                assert!(!skipped);
            }
            None => assert!(skipped, "{name}: {id} neither certified nor skipped"),
        }
    }
}

#[test]
fn emit_lean_over_story_cases() {
    if !repo_has_templates() {
        eprintln!("note: lean/templates not present; skipping");
        return;
    }
    for &(name, design, program) in CASES {
        let input = analysis_request(design, program);
        let e = run(&["emit-lean"], &input);
        assert_eq!(e.code, 0, "{name}: {}", e.stderr);
        let d = run(&["diagnose"], &input);
        check_emission(name, &d.json, &e.json);
        assert_eq!(e.json["inputDigest"], d.json["inputDigest"]);
    }
    // The AES story certifies all five claims when its fragments exist.
    let e = run(
        &["emit-lean"],
        &analysis_request("aes", Some("aes-known-shared-sum")),
    )
    .json;
    let names: Vec<&str> = e["fragments"]
        .as_array()
        .unwrap()
        .iter()
        .map(|f| f.as_str().unwrap())
        .collect();
    if [
        "matrix_mds",
        "offsets_optimal",
        "sbox_bijective_aes",
        "activity_bound",
        "circuit_equivalence_gf256",
    ]
    .iter()
    .all(|f| repo().join(format!("lean/templates/{f}.json")).is_file())
    {
        assert_eq!(e["expect"].as_array().unwrap().len(), 5, "{names:?}");
    }
}

#[test]
fn templates_found_from_env_and_from_other_directories() {
    if !repo_has_templates() {
        return;
    }
    let input = analysis_request("aes", None);
    let elsewhere = std::env::temp_dir();
    let lean = repo().join("lean");
    let via_env = run_in(
        &elsewhere,
        &["emit-lean"],
        &input,
        &[("CRYPTIFICATE_LEAN_DIR", lean.to_str().unwrap())],
    );
    assert_eq!(via_env.code, 0, "{}", via_env.stderr);
    let via_flag = run_in(
        &elsewhere,
        &["--lean-dir", lean.to_str().unwrap(), "emit-lean"],
        &input,
        &[],
    );
    assert_eq!(via_flag.json, via_env.json);
    // From inside the repository the templates are found by walking up.
    let nested = run_in(&repo().join("crates/cli"), &["emit-lean"], &input, &[]);
    assert_eq!(nested.json, via_env.json);
}

/// Runs Lean on each emitted certificate and checks that every expected
/// theorem is audited with its expected statement and allowed axioms, and
/// that every echoed input matches.
#[test]
#[ignore = "runs Lean; needs lake and a built lean/ package"]
fn lean_accepts_emitted_certificates() {
    let dir = std::env::temp_dir().join(format!("cryptificate-cli-lean-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let lake = std::env::var("LAKE").unwrap_or_else(|_| "lake".into());
    for &(name, design, program) in CASES {
        let e = run(&["emit-lean"], &analysis_request(design, program)).json;
        let file = dir.join(format!("{name}.lean"));
        std::fs::write(&file, e["source"].as_str().unwrap()).unwrap();
        let out = Command::new(&lake)
            .args(["env", "lean", "--threads=1", "-M", "3072"])
            .arg(&file)
            .current_dir(repo().join("lean"))
            .output()
            .expect("lake runs");
        let stdout = String::from_utf8_lossy(&out.stdout);
        assert!(
            out.status.success(),
            "{name}: Lean failed:\n{stdout}\n{}",
            String::from_utf8_lossy(&out.stderr)
        );
        let mut audits = std::collections::BTreeMap::new();
        let mut inputs = std::collections::BTreeMap::new();
        for line in stdout.lines() {
            if let Some(a) = line.strip_prefix("CRYPTIFICATE_AUDIT ") {
                let a: Value = serde_json::from_str(a).unwrap();
                audits.insert(a["theorem"].as_str().unwrap().to_string(), a);
            } else if let Some(rest) = line.strip_prefix("CRYPTIFICATE_INPUT ") {
                let (k, v) = rest.split_once(' ').unwrap();
                inputs.insert(k.to_string(), serde_json::from_str::<Value>(v).unwrap());
            }
        }
        for x in e["expect"].as_array().unwrap() {
            let a = &audits[x["theorem"].as_str().unwrap()];
            assert_eq!(a["type"], x["expectedType"], "{name}");
            for ax in a["axioms"].as_array().unwrap() {
                assert!(
                    ["propext", "Classical.choice", "Quot.sound"].contains(&ax.as_str().unwrap()),
                    "{name}: axiom {ax}"
                );
            }
        }
        for (k, v) in e["inputsEcho"].as_object().unwrap() {
            assert_eq!(inputs.get(k), Some(v), "{name}: echo {k}");
        }
        eprintln!(
            "{name}: {} theorem(s) accepted",
            e["expect"].as_array().unwrap().len()
        );
    }
    std::fs::remove_dir_all(&dir).ok();
}

#[cfg(feature = "search")]
#[test]
fn search_passes_through() {
    let design = example("designs/aes.json");
    let input = json!({
        "matrix": design["matrix"], "field": "gf256", "width": 4,
        "profile": "quick", "seed": "01", "maxCandidates": 2, "synthMs": 2000
    });
    let out = run(&["search"], &input.to_string());
    assert_eq!(out.code, 0, "{}", out.stderr);
    assert!(out.json["history"]
        .as_array()
        .is_some_and(|h| !h.is_empty()));
    let again = run(&["search"], &input.to_string());
    assert_eq!(
        out.json["history"][0]["identity"],
        again.json["history"][0]["identity"]
    );
    let help = Command::new(ENGINE).arg("--help").output().unwrap();
    assert!(String::from_utf8(help.stdout)
        .unwrap()
        .lines()
        .any(|l| l.trim_start().starts_with("search ")));

    let bad = run(
        &["search"],
        &json!({"field": "gf256", "width": 4}).to_string(),
    );
    assert_eq!(bad.code, 2);
    assert_eq!(bad.json["error"]["code"], "missing_field");
}
