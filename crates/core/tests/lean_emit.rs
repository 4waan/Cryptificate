//! Certificate emission from template fragments.
//!
//! Two kinds of tests: ones against small in-memory template sets, which pin
//! down selection, ordering and substitution exactly, and ones against the
//! repository's `lean/templates`, which check whatever fragments exist there
//! and skip claims whose fragments have not been written.

use std::path::PathBuf;

use cryptificate_core::diagnostics::diagnose;
use cryptificate_core::lean::{emit, Emission, EmitError, TemplateError, TemplateSet};
use cryptificate_core::report::{claim_ids, Status, Witness};
use cryptificate_core::{validate_analysis_request, AnalysisRequest};
use serde_json::{json, Value};

fn example(path: &str) -> Value {
    let p = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../examples")
        .join(path);
    serde_json::from_str(&std::fs::read_to_string(&p).unwrap()).unwrap()
}

fn request(design: &str, program: Option<&str>) -> AnalysisRequest {
    let mut v = json!({ "design": example(&format!("designs/{design}.json")) });
    if let Some(p) = program {
        v["program"] = example(&format!("programs/{p}.json"));
    }
    validate_analysis_request(&v).unwrap()
}

fn emit_with(req: &AnalysisRequest, set: &TemplateSet) -> Result<Emission, EmitError> {
    emit(req, &diagnose(req), set)
}

// ---------------------------------------------------------------------------
// In-memory templates
// ---------------------------------------------------------------------------

fn sidecar(
    name: &str,
    kind: &str,
    claim: Option<(&str, &str, &str)>,
    placeholders: &[&str],
    requires: &[&str],
    field: &str,
) -> String {
    let (claim, status, theorem, ty) = match claim {
        Some((c, s, t)) => (
            json!(c),
            json!(s),
            json!(format!("CryptificateJob.{t}")),
            json!(format!("T {t}")),
        ),
        None => (Value::Null, Value::Null, Value::Null, Value::Null),
    };
    json!({
        "name": name, "kind": kind, "claim": claim, "status": status, "theorem": theorem,
        "expectedType": ty, "placeholders": placeholders, "requires": requires, "field": field
    })
    .to_string()
}

fn toy_set() -> TemplateSet {
    let mut s = TemplateSet::default();
    let mut add = |name: &str, meta: String, text: &str| {
        s.insert_parsed(name, &meta, text.to_string()).unwrap();
    };
    add(
        "header",
        sidecar("header", "header", None, &[], &[], "any"),
        "import Cryptificate\nnamespace CryptificateJob\n",
    );
    add(
        "footer",
        sidecar("footer", "footer", None, &[], &[], "any"),
        "\nend CryptificateJob\n",
    );
    add(
        "const_matrix_gf256",
        sidecar(
            "const_matrix_gf256",
            "constant",
            None,
            &["MATRIX"],
            &["header"],
            "gf256",
        ),
        "\ndef candMatrix := gfMat4 {{MATRIX}}\n#eval Audit.echoInput \"candMatrix\" candMatrix\n",
    );
    add(
        "const_witness_vector_gf256",
        sidecar("const_witness_vector_gf256", "constant", None, &["VECTOR"], &["header"], "gf256"),
        "\ndef witnessVector := gfVec4 {{VECTOR}}\n#eval Audit.echoInput \"witnessVector\" witnessVector\n",
    );
    add(
        "const_offsets",
        sidecar("const_offsets", "constant", None, &["OFFSETS"], &["header"], "gf256"),
        "\ndef candOffsets := offsets4 {{OFFSETS}}\n#eval Audit.echoInput \"candOffsets\" candOffsets\n",
    );
    add(
        "matrix_mds",
        sidecar(
            "matrix_mds",
            "claim",
            Some(("matrix.mds", "proved", "matrix_mds")),
            &[],
            &["const_matrix_gf256"],
            "gf256",
        ),
        "\ntheorem matrix_mds : True := trivial\n",
    );
    add(
        "matrix_not_mds",
        sidecar(
            "matrix_not_mds",
            "claim",
            Some(("matrix.mds", "refuted", "matrix_not_mds")),
            &[],
            &["const_matrix_gf256", "const_witness_vector_gf256"],
            "gf256",
        ),
        "\ntheorem matrix_not_mds : True := trivial\n",
    );
    add(
        "offsets_not_optimal",
        sidecar(
            "offsets_not_optimal",
            "claim",
            Some(("offsets.dispersion", "refuted", "offsets_not_optimal")),
            &["ROW_I", "ROW_J"],
            &["const_offsets"],
            "gf256",
        ),
        "\n/-- rows {{ROW_I}} and {{ROW_J}} -/\ntheorem offsets_not_optimal : ({{ROW_I}} : Fin 4) ≠ {{ROW_J}} := by decide\n",
    );
    // Requires a fragment that does not exist: never usable.
    add(
        "activity_bound",
        sidecar(
            "activity_bound",
            "claim",
            Some(("activity.bound", "proved", "activity_bound")),
            &[],
            &["const_rounds", "matrix_mds"],
            "gf256",
        ),
        "\ntheorem activity_bound : True := trivial\n",
    );
    // Uses a placeholder the engine has no value for.
    add(
        "offsets_optimal",
        sidecar(
            "offsets_optimal",
            "claim",
            Some(("offsets.dispersion", "proved", "offsets_optimal")),
            &["NO_SUCH_VALUE"],
            &["const_offsets"],
            "gf256",
        ),
        "\ntheorem offsets_optimal : {{NO_SUCH_VALUE}} := trivial\n",
    );
    s
}

#[test]
fn toy_refutations_with_witnesses() {
    let req = request("identity", None);
    let mut design = serde_json::to_value(&req).unwrap();
    design["design"]["offsets"] = json!([0, 1, 1, 3]);
    let req = validate_analysis_request(&design).unwrap();
    let e = emit_with(&req, &toy_set()).unwrap();
    assert_eq!(
        e.fragments,
        vec![
            "header",
            "const_matrix_gf256",
            "const_offsets",
            "const_witness_vector_gf256",
            "matrix_not_mds",
            "offsets_not_optimal",
            "footer"
        ]
    );
    assert_eq!(
        e.source,
        "import Cryptificate\nnamespace CryptificateJob\n\
         \ndef candMatrix := gfMat4 0x01 0x00 0x00 0x00 0x00 0x01 0x00 0x00 0x00 0x00 0x01 0x00 0x00 0x00 0x00 0x01\n\
         #eval Audit.echoInput \"candMatrix\" candMatrix\n\
         \ndef candOffsets := offsets4 0 1 1 3\n#eval Audit.echoInput \"candOffsets\" candOffsets\n\
         \ndef witnessVector := gfVec4 0x01 0x00 0x00 0x00\n#eval Audit.echoInput \"witnessVector\" witnessVector\n\
         \ntheorem matrix_not_mds : True := trivial\n\
         \n/-- rows 1 and 2 -/\ntheorem offsets_not_optimal : (1 : Fin 4) ≠ 2 := by decide\n\
         \nend CryptificateJob\n\
         #cryptificate_audit CryptificateJob.matrix_not_mds\n\
         #cryptificate_audit CryptificateJob.offsets_not_optimal\n"
    );
    let claims: Vec<(&str, Status)> = e
        .expect
        .iter()
        .map(|x| (x.claim.as_str(), x.status))
        .collect();
    assert_eq!(
        claims,
        vec![
            ("matrix.mds", Status::Refuted),
            ("offsets.dispersion", Status::Refuted)
        ]
    );
    assert_eq!(e.expect[0].expected_type, "T matrix_not_mds");
    assert!(matches!(e.expect[0].witness, Some(Witness::Branch { .. })));
    assert_eq!(
        e.expect[1].witness,
        Some(Witness::OffsetCollision {
            rows: vec![1, 2],
            offset: 1
        })
    );
    assert_eq!(
        Value::Object(e.inputs_echo.clone()),
        json!({
            "candMatrix": [["01","00","00","00"],["00","01","00","00"],["00","00","01","00"],["00","00","00","01"]],
            "candOffsets": [0, 1, 1, 3],
            "witnessVector": ["01", "00", "00", "00"]
        })
    );
    // sbox.bijective has no fragment; activity is out of reach for this design.
    let skipped: Vec<&str> = e.skipped.iter().map(|s| s.claim.as_str()).collect();
    assert_eq!(skipped, vec!["sbox.bijective", "activity.bound"]);
    assert!(e.skipped[0].reason.contains("sbox_bijective_aes"));
}

#[test]
fn toy_missing_requirements_and_values_skip_claims() {
    let req = request("aes", None);
    let e = emit_with(&req, &toy_set()).unwrap();
    let claims: Vec<&str> = e.expect.iter().map(|x| x.claim.as_str()).collect();
    assert_eq!(claims, vec!["matrix.mds"]);
    let reasons: Vec<(&str, &str)> = e
        .skipped
        .iter()
        .map(|s| (s.claim.as_str(), s.reason.as_str()))
        .collect();
    assert!(reasons
        .iter()
        .any(|(c, r)| *c == "offsets.dispersion" && r.contains("{{NO_SUCH_VALUE}}")));
    assert!(reasons
        .iter()
        .any(|(c, r)| *c == "activity.bound" && r.contains("const_rounds")));
    // A skipped claim leaves no trace in the file except its constants.
    assert!(!e.source.contains("offsets_optimal"));
    assert!(!e.source.contains("activity_bound"));
    assert!(e.source.contains("def candOffsets := offsets4 0 1 2 3"));
}

#[test]
fn toy_header_is_required() {
    let mut s = TemplateSet::default();
    s.insert_parsed(
        "footer",
        &sidecar("footer", "footer", None, &[], &[], "any"),
        String::new(),
    )
    .unwrap();
    assert_eq!(
        emit_with(&request("aes", None), &s),
        Err(EmitError::Templates(TemplateError::Missing("header")))
    );
}

#[test]
fn sidecars_are_checked() {
    let mut s = TemplateSet::default();
    assert!(matches!(
        s.insert_parsed(
            "a",
            &sidecar("b", "constant", None, &[], &[], "any"),
            String::new()
        ),
        Err(TemplateError::BadSidecar { .. })
    ));
    assert!(s
        .insert_parsed(
            "a",
            r#"{"name":"a","kind":"claim","field":"any"}"#,
            String::new()
        )
        .is_err());
    assert!(s.insert_parsed("a", "not json", String::new()).is_err());
}

#[test]
fn experimental_width_is_out_of_scope() {
    let v = json!({"design": {
        "model": "aes-like/gf256/v1", "field": "gf256", "width": 2,
        "matrix": [["02","03"],["03","02"]], "offsets": [0, 1], "rounds": 6, "sbox": {"kind": "aes"}
    }});
    let req = validate_analysis_request(&v).unwrap();
    let e = emit_with(&req, &toy_set()).unwrap();
    assert!(e.expect.is_empty());
    assert_eq!(e.fragments, vec!["header", "footer"]);
    assert!(e.skipped.iter().all(|s| s.reason.contains("width 4 only")));
}

// ---------------------------------------------------------------------------
// The repository's templates
// ---------------------------------------------------------------------------

fn repo_templates() -> Option<TemplateSet> {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../lean/templates");
    let set = TemplateSet::load(&dir).ok()?;
    if set.get("header").is_none() || set.get("footer").is_none() {
        eprintln!("note: {} has no header/footer yet; skipping", dir.display());
        return None;
    }
    Some(set)
}

/// Checks invariants every emission must satisfy, and returns the claims
/// it certifies with their statuses.
fn check_emission(set: &TemplateSet, e: &Emission) -> Vec<(String, Status)> {
    assert!(e.source.starts_with(&set.get("header").unwrap().text));
    assert_eq!(e.fragments.first().map(String::as_str), Some("header"));
    assert_eq!(e.fragments.last().map(String::as_str), Some("footer"));
    assert!(
        !e.source.contains("{{"),
        "unfilled placeholder in\n{}",
        e.source
    );
    let audits: Vec<&str> = e
        .source
        .lines()
        .filter_map(|l| l.strip_prefix("#cryptificate_audit "))
        .collect();
    let theorems: Vec<&str> = e.expect.iter().map(|x| x.theorem.as_str()).collect();
    assert_eq!(audits, theorems);
    for x in &e.expect {
        let meta = &set.get(&x.fragment).unwrap().meta;
        assert_eq!(
            meta.expected_type.as_deref(),
            Some(x.expected_type.as_str())
        );
        assert_eq!(x.status == Status::Refuted, x.witness.is_some(), "{x:?}");
    }
    // Every fragment's requirements come earlier.
    for (i, name) in e.fragments.iter().enumerate() {
        for r in &set.get(name).unwrap().meta.requires {
            let j = e
                .fragments
                .iter()
                .position(|n| n == r)
                .unwrap_or_else(|| panic!("{name} needs {r}"));
            assert!(j < i, "{r} must precede {name}");
        }
    }
    e.expect
        .iter()
        .map(|x| (x.claim.clone(), x.status))
        .collect()
}

/// Whether `name` and everything it needs, transitively, are present.
fn complete(set: &TemplateSet, name: &str) -> bool {
    set.get(name)
        .is_some_and(|f| f.meta.requires.iter().all(|r| complete(set, r)))
}

/// Asserts `claim` is certified with `status` if its fragment and that
/// fragment's requirements exist, and listed as skipped otherwise.
fn expect_claim(set: &TemplateSet, e: &Emission, fragment: &str, claim: &str, status: Status) {
    let found = e.expect.iter().find(|x| x.claim == claim);
    if complete(set, fragment) {
        let x = found.unwrap_or_else(|| panic!("{claim} missing; skipped: {:?}", e.skipped));
        assert_eq!(x.status, status, "{claim}");
        assert_eq!(x.fragment, fragment);
    } else {
        assert!(found.is_none());
        assert!(
            e.skipped.iter().any(|s| s.claim == claim),
            "{claim} must be listed as skipped"
        );
        eprintln!("note: fragment {fragment} or a requirement is not present; {claim} skipped");
    }
}

#[test]
fn repo_aes_with_known_circuit() {
    let Some(set) = repo_templates() else { return };
    let req = request("aes", Some("aes-known-shared-sum"));
    let e = emit_with(&req, &set).unwrap();
    check_emission(&set, &e);
    expect_claim(
        &set,
        &e,
        "matrix_mds",
        claim_ids::MATRIX_MDS,
        Status::Proved,
    );
    expect_claim(
        &set,
        &e,
        "offsets_optimal",
        claim_ids::OFFSETS_DISPERSION,
        Status::Proved,
    );
    expect_claim(
        &set,
        &e,
        "sbox_bijective_aes",
        claim_ids::SBOX_BIJECTIVE,
        Status::Proved,
    );
    expect_claim(
        &set,
        &e,
        "activity_bound",
        claim_ids::ACTIVITY_BOUND,
        Status::Proved,
    );
    expect_claim(
        &set,
        &e,
        "circuit_equivalence_gf256",
        claim_ids::CIRCUIT_EQUIVALENCE,
        Status::Proved,
    );
    if set.get("const_matrix_gf256").is_some() {
        assert!(e
            .source
            .contains("gfMat4 0x02 0x03 0x01 0x01 0x01 0x02 0x03 0x01 0x01 0x01 0x02 0x03 0x03 0x01 0x01 0x02"));
        assert_eq!(
            e.inputs_echo["candMatrix"][3],
            json!(["03", "01", "01", "02"])
        );
    }
    if set.get("const_program_gf256").is_some() {
        assert!(e
            .source
            .contains("[.add 0 1, .add 4 2, .add 5 3, .add 0 1, .mul 0x02 7, .add 0 8,"));
        assert!(e.source.contains("] 10 14 18 22"));
        let p = &e.inputs_echo["candProgram"];
        assert!(p.get("name").is_none());
        assert_eq!(
            p["instructions"][4],
            json!({"op": "mul", "k": "02", "a": 7})
        );
    }
    if set.get("const_sbox_aes").is_some() {
        assert_eq!(e.inputs_echo["candSboxTable"], json!({"kind": "aes"}));
    }
    if set.get("const_rounds").is_some() {
        assert_eq!(e.inputs_echo["candRounds"], json!(4));
    }
}

#[test]
fn repo_wrong_wire() {
    let Some(set) = repo_templates() else { return };
    let req = request("aes", Some("aes-wrong-wire"));
    let e = emit_with(&req, &set).unwrap();
    check_emission(&set, &e);
    expect_claim(
        &set,
        &e,
        "circuit_mismatch_gf256",
        claim_ids::CIRCUIT_EQUIVALENCE,
        Status::Refuted,
    );
    if set.get("circuit_mismatch_gf256").is_some() {
        assert!(e.source.contains("gfVec4 0x00 0x01 0x00 0x00"));
        assert!(e.source.contains("gfVec4 0x03 0x02 0x01 0x01"));
        assert!(e.source.contains("gfVec4 0x01 0x02 0x01 0x01"));
        assert_eq!(
            e.inputs_echo["witnessInput"],
            json!(["00", "01", "00", "00"])
        );
        assert_eq!(
            e.inputs_echo["witnessExpected"],
            json!(["03", "02", "01", "01"])
        );
        assert_eq!(
            e.inputs_echo["witnessActual"],
            json!(["01", "02", "01", "01"])
        );
        let x = e
            .expect
            .iter()
            .find(|x| x.claim == "circuit.equivalence")
            .unwrap();
        assert_eq!(
            x.witness,
            Some(Witness::DistinguishingInput {
                input: vec!["00".into(), "01".into(), "00".into(), "00".into()],
                expected: vec!["03".into(), "02".into(), "01".into(), "01".into()],
                actual: vec!["01".into(), "02".into(), "01".into(), "01".into()],
                differing: vec![0],
            })
        );
    }
}

#[test]
fn repo_identity_and_repeated_offsets() {
    let Some(set) = repo_templates() else { return };
    let e = emit_with(&request("identity", Some("identity")), &set).unwrap();
    check_emission(&set, &e);
    expect_claim(
        &set,
        &e,
        "matrix_not_mds",
        claim_ids::MATRIX_MDS,
        Status::Refuted,
    );
    expect_claim(
        &set,
        &e,
        "circuit_equivalence_gf256",
        claim_ids::CIRCUIT_EQUIVALENCE,
        Status::Proved,
    );
    assert!(e
        .expect
        .iter()
        .all(|x| x.claim != claim_ids::ACTIVITY_BOUND));
    if set.get("matrix_not_mds").is_some() {
        assert!(e.source.contains("gfVec4 0x01 0x00 0x00 0x00"));
        assert!(e.source.contains("[] 0 1 2 3") || set.get("const_program_gf256").is_none());
    }

    let e = emit_with(&request("repeated-offsets", None), &set).unwrap();
    check_emission(&set, &e);
    expect_claim(
        &set,
        &e,
        "offsets_not_optimal",
        claim_ids::OFFSETS_DISPERSION,
        Status::Refuted,
    );
    if set.get("offsets_not_optimal").is_some() {
        assert!(e
            .source
            .contains("not_diffusionOptimal_of_offset_collision (1 : Fin 4) 2"));
    }
    assert!(e
        .skipped
        .iter()
        .any(|s| s.claim == claim_ids::ACTIVITY_BOUND));
}

#[test]
fn repo_row_scaled_and_table_sbox() {
    let Some(set) = repo_templates() else { return };
    let e = emit_with(&request("aes-row-scaled", None), &set).unwrap();
    check_emission(&set, &e);
    expect_claim(
        &set,
        &e,
        "matrix_mds",
        claim_ids::MATRIX_MDS,
        Status::Proved,
    );
    if set.get("const_matrix_gf256").is_some() {
        assert!(e.source.contains("gfMat4 0x04 0x06 0x02 0x02 0x01"));
    }

    // A table S-box: the AES table itself (bijective) and with entry 01
    // changed to 63 (collision of 00 and 01).
    let mut v = serde_json::to_value(request("aes", None)).unwrap();
    let table: Vec<String> = cryptificate_core::design::aes_sbox()
        .iter()
        .map(|b| format!("{b:02X}"))
        .collect();
    v["design"]["sbox"] = json!({"kind": "table", "table": table});
    let e = emit_with(&validate_analysis_request(&v).unwrap(), &set).unwrap();
    check_emission(&set, &e);
    expect_claim(
        &set,
        &e,
        "sbox_bijective",
        claim_ids::SBOX_BIJECTIVE,
        Status::Proved,
    );
    if set.get("const_sbox_inv").is_some() && set.get("sbox_bijective").is_some() {
        // The inverse table starts 52 09 6A D5 (FIPS 197, Figure 14).
        assert!(e.source.contains("byteTable![0x52 0x09 0x6A 0xD5 "));
        assert_eq!(e.inputs_echo["candSboxInv"][0], "52");
        assert_eq!(e.inputs_echo["candSboxTable"]["kind"], "table");
    }

    v["design"]["sbox"]["table"][1] = json!("63");
    let e = emit_with(&validate_analysis_request(&v).unwrap(), &set).unwrap();
    check_emission(&set, &e);
    expect_claim(
        &set,
        &e,
        "sbox_not_injective",
        claim_ids::SBOX_BIJECTIVE,
        Status::Refuted,
    );
    if set.get("sbox_not_injective").is_some() {
        assert!(e
            .source
            .contains("not_injective_of_collision (gf 0x00) (gf 0x01)"));
    }
}

#[test]
fn repo_hades() {
    let Some(set) = repo_templates() else { return };
    for (design, holds) in [("poseidon2-bn254", true), ("poseidon2-exponent3", false)] {
        let req = request(design, Some("poseidon2-external-shared-sum"));
        let e = emit_with(&req, &set).unwrap();
        check_emission(&set, &e);
        expect_claim(
            &set,
            &e,
            "external_mds",
            claim_ids::EXTERNAL_MDS,
            Status::Proved,
        );
        expect_claim(
            &set,
            &e,
            "internal_invertible",
            claim_ids::INTERNAL_INVERTIBLE,
            Status::Proved,
        );
        if holds {
            expect_claim(
                &set,
                &e,
                "power_bijective",
                claim_ids::SBOX_BIJECTIVE,
                Status::Proved,
            );
        } else {
            expect_claim(
                &set,
                &e,
                "power_not_injective",
                claim_ids::SBOX_BIJECTIVE,
                Status::Refuted,
            );
        }
        expect_claim(
            &set,
            &e,
            "circuit_equivalence_bn254_external",
            claim_ids::CIRCUIT_EQUIVALENCE,
            Status::Proved,
        );
        if set.get("const_program_bn254").is_some()
            && e.fragments.iter().any(|f| f == "const_program_bn254")
        {
            assert!(e
                .source
                .contains("bnProgram3 [.add 0 1, .add 3 2, .add 4 0, .add 4 1, .add 4 2] 5 6 7"));
        }
    }
}

#[test]
fn emission_is_deterministic() {
    let Some(set) = repo_templates() else { return };
    let req = request("aes", Some("aes-wrong-wire"));
    assert_eq!(emit_with(&req, &set), emit_with(&req, &set));
}
