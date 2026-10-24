//! Validation, normalization and canonical digests.

use cryptificate_core::canonical::to_canonical_json;
use cryptificate_core::{
    validate_analysis_request, validate_design, validate_experiment_request, validate_program,
    AnalysisRequest, CandidateDesign, ErrorCode, ValidationError,
};
use serde_json::{json, Value};

fn aes_design() -> Value {
    json!({
        "model": "aes-like/gf256/v1", "field": "gf256", "width": 4,
        "matrix": [["02","03","01","01"],["01","02","03","01"],["01","01","02","03"],["03","01","01","02"]],
        "offsets": [0, 1, 2, 3],
        "rounds": 4,
        "sbox": {"kind": "aes"}
    })
}

fn hades_design() -> Value {
    json!({
        "model": "hades/bn254/v1", "field": "bn254", "width": 3,
        "external": [["2","1","1"],["1","2","1"],["1","1","2"]],
        "internal": [["2","1","1"],["1","2","1"],["1","1","3"]],
        "fullRounds": 8, "partialRounds": 56,
        "sbox": {"kind": "power", "exponent": 5},
        "partialMask": [true, false, false],
        "constants": {"kind": "reference"}
    })
}

fn identity_program() -> Value {
    json!({"field": "gf256", "width": 4, "name": "identity", "instructions": [], "outputs": [0, 1, 2, 3]})
}

/// Applies `edit` to a copy of `base` and expects rejection with `code` at `path`.
fn rejects<T: std::fmt::Debug>(
    validate: impl Fn(&Value) -> Result<T, ValidationError>,
    base: &Value,
    edit: impl FnOnce(&mut Value),
    code: ErrorCode,
    path: &str,
) {
    let mut v = base.clone();
    edit(&mut v);
    let e = validate(&v).expect_err(&format!("expected {code} at {path} for {v}"));
    assert_eq!((e.code, e.path.as_str()), (code, path), "{e}");
}

#[test]
fn reference_designs_validate() {
    let d = validate_design(&aes_design()).unwrap();
    assert!(matches!(d, CandidateDesign::AesLike(ref a) if !a.experimental));
    validate_design(&hades_design()).unwrap();
}

#[test]
fn lowercase_bytes_normalize_to_uppercase() {
    let mut lower = aes_design();
    lower["matrix"][0][0] = json!("0a");
    let mut upper = aes_design();
    upper["matrix"][0][0] = json!("0A");
    let a = validate_design(&lower).unwrap();
    let b = validate_design(&upper).unwrap();
    assert_eq!(a, b);
    let text = to_canonical_json(&a);
    assert!(text.contains("\"0A\""), "{text}");
    assert!(!text.contains("\"0a\""));
}

#[test]
fn invalid_bytes_rejected() {
    let d = aes_design();
    for bad in [json!("1G"), json!("1"), json!("123"), json!("0x1"), json!(" 1"), json!("")] {
        rejects(validate_design, &d, |v| v["matrix"][0][1] = bad, ErrorCode::InvalidByte, "/matrix/0/1");
    }
    rejects(validate_design, &d, |v| v["matrix"][0][1] = json!(2), ErrorCode::BadType, "/matrix/0/1");
    rejects(
        validate_design,
        &d,
        |v| v["sbox"] = json!({"kind": "table", "table": vec!["00"; 256].into_iter().enumerate().map(|(i, s)| if i == 7 { "zz".to_string() } else { s.to_string() }).collect::<Vec<_>>()}),
        ErrorCode::InvalidByte,
        "/sbox/table/7",
    );
}

#[test]
fn bn254_values_must_be_canonical() {
    let d = hades_design();
    let p = "21888242871839275222246405745257275088548364400416034343698204186575808495617";
    for bad in ["01", "+1", "-1", " 1", "1 ", "", "1.0", p] {
        rejects(validate_design, &d, |v| v["external"][2][1] = json!(bad), ErrorCode::ValueNotCanonical, "/external/2/1");
    }
    rejects(validate_design, &d, |v| v["external"][2][1] = json!(1), ErrorCode::BadType, "/external/2/1");
    let mut ok = d.clone();
    ok["external"][2][1] = json!("21888242871839275222246405745257275088548364400416034343698204186575808495616");
    validate_design(&ok).unwrap();
}

#[test]
fn dimensions_checked() {
    let d = aes_design();
    rejects(validate_design, &d, |v| v["matrix"].as_array_mut().unwrap().pop().map(drop).unwrap(), ErrorCode::BadDimension, "/matrix");
    rejects(validate_design, &d, |v| v["matrix"][2].as_array_mut().unwrap().push(json!("01")), ErrorCode::BadDimension, "/matrix/2");
    rejects(validate_design, &d, |v| v["offsets"] = json!([0, 1, 2]), ErrorCode::BadDimension, "/offsets");
    rejects(validate_design, &d, |v| v["sbox"] = json!({"kind": "table", "table": ["00"]}), ErrorCode::BadDimension, "/sbox/table");
    let h = hades_design();
    rejects(validate_design, &h, |v| v["internal"][0] = json!(["1", "2"]), ErrorCode::BadDimension, "/internal/0");
    rejects(validate_design, &h, |v| v["partialMask"] = json!([true, false]), ErrorCode::BadDimension, "/partialMask");
    rejects(validate_design, &h, |v| v["partialMask"] = json!([false, false, false]), ErrorCode::BadPartialMask, "/partialMask");
}

#[test]
fn widths_checked() {
    let d = aes_design();
    for w in [0, 1, 5, 16] {
        rejects(validate_design, &d, |v| v["width"] = json!(w), ErrorCode::UnsupportedWidth, "/width");
    }
    rejects(validate_design, &hades_design(), |v| v["width"] = json!(4), ErrorCode::UnsupportedWidth, "/width");
    let narrow = json!({
        "model": "aes-like/gf256/v1", "field": "gf256", "width": 2,
        "matrix": [["02","03"],["03","02"]], "offsets": [0, 1], "rounds": 6, "sbox": {"kind": "aes"}
    });
    let n = validate_design(&narrow).unwrap();
    let out = serde_json::to_value(&n).unwrap();
    assert_eq!(out["experimental"], json!(true));
    // Normalized output validates again to the same value.
    assert_eq!(validate_design(&out).unwrap(), n);
    assert!(serde_json::to_value(validate_design(&aes_design()).unwrap()).unwrap().get("experimental").is_none());
}

#[test]
fn offsets_and_rounds_ranges() {
    let d = aes_design();
    rejects(validate_design, &d, |v| v["offsets"][3] = json!(4), ErrorCode::OffsetOutOfRange, "/offsets/3");
    rejects(validate_design, &d, |v| v["offsets"][1] = json!(-1), ErrorCode::OffsetOutOfRange, "/offsets/1");
    rejects(validate_design, &d, |v| v["offsets"][1] = json!(1.5), ErrorCode::BadType, "/offsets/1");
    for r in [0, 3, 33, 4_000_000_000u64, 1u64 << 40] {
        rejects(validate_design, &d, |v| v["rounds"] = json!(r), ErrorCode::RoundsOutOfRange, "/rounds");
    }
    for r in [4, 32] {
        let mut ok = d.clone();
        ok["rounds"] = json!(r);
        validate_design(&ok).unwrap();
    }
    let h = hades_design();
    rejects(validate_design, &h, |v| v["fullRounds"] = json!(7), ErrorCode::FullRoundsOdd, "/fullRounds");
    rejects(validate_design, &h, |v| v["fullRounds"] = json!(0), ErrorCode::RoundsOutOfRange, "/fullRounds");
    rejects(validate_design, &h, |v| v["partialRounds"] = json!(153), ErrorCode::RoundsOutOfRange, "/partialRounds");
    let mut max = h.clone();
    max["partialRounds"] = json!(152);
    validate_design(&max).unwrap();
}

#[test]
fn sbox_and_constants() {
    let h = hades_design();
    for e in [0, 65536] {
        rejects(validate_design, &h, |v| v["sbox"]["exponent"] = json!(e), ErrorCode::ExponentOutOfRange, "/sbox/exponent");
    }
    for e in [1, 3, 65535] {
        let mut ok = h.clone();
        ok["sbox"]["exponent"] = json!(e);
        validate_design(&ok).unwrap();
    }
    rejects(validate_design, &h, |v| v["sbox"] = json!({"kind": "aes"}), ErrorCode::BadSboxKind, "/sbox/kind");
    rejects(validate_design, &aes_design(), |v| v["sbox"] = json!({"kind": "power", "exponent": 3}), ErrorCode::BadSboxKind, "/sbox/kind");
    rejects(validate_design, &aes_design(), |v| v["sbox"] = json!({"kind": "magic"}), ErrorCode::BadSboxKind, "/sbox/kind");
    let row = json!(["1", "2", "3"]);
    rejects(
        validate_design,
        &h,
        |v| v["constants"] = json!({"kind": "explicit", "values": vec![row.clone(); 63]}),
        ErrorCode::ConstantsLengthMismatch,
        "/constants/values",
    );
    let mut ok = h.clone();
    ok["constants"] = json!({"kind": "explicit", "values": vec![row.clone(); 64]});
    validate_design(&ok).unwrap();
    rejects(validate_design, &h, |v| v["constants"] = json!({"kind": "random"}), ErrorCode::BadConstantsKind, "/constants/kind");
}

#[test]
fn hades_defaults_fill_in() {
    let mut h = hades_design();
    let obj = h.as_object_mut().unwrap();
    obj.remove("partialMask");
    obj.remove("constants");
    let d = validate_design(&h).unwrap();
    assert_eq!(d, validate_design(&hades_design()).unwrap());
}

#[test]
fn models_fields_and_members() {
    let d = aes_design();
    rejects(validate_design, &d, |v| v["model"] = json!("aes/v2"), ErrorCode::UnknownModel, "/model");
    rejects(validate_design, &d, |v| { v.as_object_mut().unwrap().remove("model"); }, ErrorCode::MissingField, "/model");
    rejects(validate_design, &d, |v| v["field"] = json!("bn254"), ErrorCode::FieldMismatch, "/field");
    rejects(validate_design, &d, |v| { v.as_object_mut().unwrap().remove("rounds"); }, ErrorCode::MissingField, "/rounds");
    rejects(validate_design, &d, |v| v["colour"] = json!("blue"), ErrorCode::UnknownField, "/colour");
    rejects(validate_design, &d, |v| v["sbox"]["extra"] = json!(1), ErrorCode::UnknownField, "/sbox/extra");
    rejects(validate_design, &json!([]), |_| {}, ErrorCode::BadType, "");
}

#[test]
fn program_references_and_limits() {
    let p = identity_program();
    validate_program(&p).unwrap();
    rejects(validate_program, &p, |v| v["outputs"] = json!([0, 1, 2]), ErrorCode::BadDimension, "/outputs");
    rejects(validate_program, &p, |v| v["outputs"][2] = json!(4), ErrorCode::BadReference, "/outputs/2");
    rejects(validate_program, &p, |v| v["instructions"] = json!([{"op": "add", "a": 0, "b": 4}]), ErrorCode::BadReference, "/instructions/0/b");
    rejects(validate_program, &p, |v| v["instructions"] = json!([{"op": "add", "a": 0, "b": 1}, {"op": "mul", "k": "02", "a": 5}]), ErrorCode::BadReference, "/instructions/1/a");
    rejects(validate_program, &p, |v| v["instructions"] = json!([{"op": "mul", "k": "2", "a": 0}]), ErrorCode::InvalidByte, "/instructions/0/k");
    rejects(validate_program, &p, |v| v["instructions"] = json!([{"op": "sub", "a": 0, "b": 1}]), ErrorCode::BadOp, "/instructions/0/op");
    rejects(validate_program, &p, |v| v["instructions"] = json!([{"op": "add", "a": 0}]), ErrorCode::MissingField, "/instructions/0/b");
    rejects(validate_program, &p, |v| v["instructions"] = json!([{"op": "add", "a": 0, "b": 1, "k": "02"}]), ErrorCode::UnknownField, "/instructions/0/k");
    rejects(validate_program, &p, |v| v["field"] = json!("gf2"), ErrorCode::FieldMismatch, "/field");
    rejects(validate_program, &p, |v| v["name"] = json!("a\nb"), ErrorCode::BadName, "/name");

    let add = json!({"op": "add", "a": 0, "b": 1});
    let mut max = p.clone();
    max["instructions"] = json!(vec![add.clone(); 256]);
    max["outputs"] = json!([259, 258, 257, 256]);
    validate_program(&max).unwrap();
    rejects(validate_program, &p, |v| v["instructions"] = json!(vec![add.clone(); 257]), ErrorCode::TooManyInstructions, "/instructions");

    let bn = json!({"field": "bn254", "width": 3, "instructions": [{"op": "mul", "k": "007", "a": 0}], "outputs": [3, 1, 2]});
    rejects(validate_program, &bn, |_| {}, ErrorCode::ValueNotCanonical, "/instructions/0/k");
}

#[test]
fn analysis_request_normalizes() {
    let req = json!({"design": aes_design(), "program": identity_program()});
    let a = validate_analysis_request(&req).unwrap();
    let out = serde_json::to_value(&a).unwrap();
    assert_eq!(out["target"], "matrix");
    // The normalized request validates to itself, and serde agrees.
    assert_eq!(validate_analysis_request(&out).unwrap(), a);
    assert_eq!(serde_json::from_value::<AnalysisRequest>(out.clone()).unwrap(), a);
    // Digest is stable and depends only on the normalized content.
    let mut reordered = json!({"program": identity_program(), "target": "matrix", "design": aes_design()});
    reordered["design"]["matrix"][3][0] = json!("03");
    let b = validate_analysis_request(&reordered).unwrap();
    assert_eq!(a.input_digest(), b.input_digest());
    assert!(a.input_digest().starts_with("sha256:"));
    assert_eq!(a.input_digest().len(), "sha256:".len() + 64);
    let mut changed = req.clone();
    changed["design"]["rounds"] = json!(5);
    assert_ne!(validate_analysis_request(&changed).unwrap().input_digest(), a.input_digest());

    let h = validate_analysis_request(&json!({"design": hades_design(), "program": null})).unwrap();
    assert_eq!(serde_json::to_value(&h).unwrap()["target"], "external");
    assert!(serde_json::to_value(&h).unwrap().get("program").is_none());
}

#[test]
fn analysis_request_rejections() {
    let req = json!({"design": aes_design(), "program": identity_program()});
    rejects(validate_analysis_request, &req, |v| v["target"] = json!("external"), ErrorCode::BadTarget, "/target");
    rejects(validate_analysis_request, &req, |v| v["target"] = json!("rows"), ErrorCode::BadTarget, "/target");
    rejects(validate_analysis_request, &req, |v| v["program"]["width"] = json!(3), ErrorCode::BadDimension, "/program/width");
    rejects(validate_analysis_request, &req, |v| v["design"]["matrix"][1][1] = json!("q1"), ErrorCode::InvalidByte, "/design/matrix/1/1");
    let bn_prog = json!({"field": "bn254", "width": 3, "instructions": [], "outputs": [0, 1, 2]});
    rejects(validate_analysis_request, &req, |v| v["program"] = bn_prog, ErrorCode::FieldMismatch, "/program/field");
    rejects(validate_analysis_request, &json!({}), |_| {}, ErrorCode::MissingField, "/design");
    let h = json!({"design": hades_design(), "target": "internal"});
    assert_eq!(
        serde_json::to_value(validate_analysis_request(&h).unwrap()).unwrap()["target"],
        "internal"
    );
    rejects(validate_analysis_request, &h, |v| v["target"] = json!("matrix"), ErrorCode::BadTarget, "/target");
}

#[test]
fn experiment_request() {
    let req = json!({"design": aes_design(), "profile": "quick", "seed": "00ABcd"});
    let e = validate_experiment_request(&req).unwrap();
    assert_eq!(e.seed.as_deref(), Some("00abcd"));
    let out = serde_json::to_value(&e).unwrap();
    assert_eq!(validate_experiment_request(&out).unwrap(), e);
    rejects(validate_experiment_request, &req, |v| v["profile"] = json!("slow"), ErrorCode::BadProfile, "/profile");
    rejects(validate_experiment_request, &req, |v| { v.as_object_mut().unwrap().remove("profile"); }, ErrorCode::MissingField, "/profile");
    for bad in ["", "xyz", "0x12", &"a".repeat(65)] {
        rejects(validate_experiment_request, &req, |v| v["seed"] = json!(bad), ErrorCode::BadSeed, "/seed");
    }
    rejects(validate_experiment_request, &req, |v| v["target"] = json!("matrix"), ErrorCode::UnknownField, "/target");
}

#[test]
fn error_envelope() {
    let e = validate_design(&json!({"model": "aes-like/gf256/v1"})).unwrap_err();
    let env = e.to_envelope();
    assert_eq!(env["error"]["code"], "missing_field");
    assert_eq!(env["error"]["path"], "/field");
    assert!(env["error"]["message"].as_str().unwrap().contains("field"));
    let bad_json = cryptificate_core::parse_json("{").unwrap_err();
    assert_eq!(bad_json.code, ErrorCode::InvalidJson);
}
