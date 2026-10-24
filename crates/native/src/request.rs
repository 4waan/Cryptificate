//! Validated inputs of the `codegen` and `native` subcommands.

use cryptificate_core::design::AnyMatrix;
use cryptificate_core::error::pointer_push as at;
use cryptificate_core::report::CandidateOrigin;
use cryptificate_core::{AnyProgram, Bn254, ErrorCode, FieldKind, Gf256, ValidationError};
use cryptificate_search::input::{self, Obj, Result};
use serde_json::Value;

/// Most variants accepted in one request.
pub const MAX_VARIANTS: usize = 32;
/// Most extra correctness cases accepted in one request.
pub const MAX_EXTRA_CASES: usize = 256;

/// One program to generate, check and time.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct VariantSpec {
    /// 1 to 64 characters from `A-Z a-z 0-9 _ . -`.
    pub id: String,
    pub origin: CandidateOrigin,
    pub program: AnyProgram,
    /// When the request came from a codegen document: the source digest it
    /// recorded, which must match the regenerated source.
    pub source_sha256: Option<String>,
}

/// The role of a variant follows its origin: `search` and `user` circuits
/// are contenders; `baseline-direct` and `baseline-known` are references.
pub fn is_reference(origin: CandidateOrigin) -> bool {
    matches!(
        origin,
        CandidateOrigin::BaselineDirect | CandidateOrigin::BaselineKnown
    )
}

/// The origin implied by an id when none is given: `baseline-direct`,
/// `baseline-known` and `user` by name, `search` otherwise.
pub fn origin_from_id(id: &str) -> CandidateOrigin {
    match id {
        "baseline-direct" => CandidateOrigin::BaselineDirect,
        "baseline-known" => CandidateOrigin::BaselineKnown,
        "user" => CandidateOrigin::User,
        _ => CandidateOrigin::Search,
    }
}

fn err(code: ErrorCode, path: impl Into<String>, msg: impl Into<String>) -> ValidationError {
    ValidationError::new(code, path, msg)
}

fn origin_at(v: &Value, path: &str) -> Result<CandidateOrigin> {
    const EXPECTED: &str = "search, baseline-direct, baseline-known or user";
    Ok(match input::str_at(v, path)? {
        "search" => CandidateOrigin::Search,
        "baseline-direct" => CandidateOrigin::BaselineDirect,
        "baseline-known" => CandidateOrigin::BaselineKnown,
        "user" => CandidateOrigin::User,
        s => {
            let msg = format!("unknown origin {s:?} (expected {EXPECTED})");
            return Err(err(ErrorCode::BadType, path, msg));
        }
    })
}

fn id_at(v: &Value, path: &str) -> Result<String> {
    let s = input::str_at(v, path)?;
    let ok = !s.is_empty()
        && s.len() <= 64
        && s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'.' | b'-'));
    if !ok {
        return Err(err(
            ErrorCode::BadName,
            path,
            "variant id must be 1 to 64 characters from A-Z a-z 0-9 _ . -",
        ));
    }
    Ok(s.to_string())
}

/// Parses a list of `{id, program, origin?, sourceSha256?}` entries.
fn variants_at(v: &Value, path: &str, field: FieldKind, width: usize) -> Result<Vec<VariantSpec>> {
    let items = input::array_at(v, path)?;
    if items.is_empty() || items.len() > MAX_VARIANTS {
        return Err(err(
            ErrorCode::BadDimension,
            path,
            format!("expected 1 to {MAX_VARIANTS} variants, got {}", items.len()),
        ));
    }
    let mut out: Vec<VariantSpec> = Vec::new();
    for (i, item) in items.iter().enumerate() {
        let base = at(path, i);
        // Codegen documents carry extra members describing the generated crate.
        let o = Obj::new(
            item,
            &base,
            &[
                "id",
                "origin",
                "program",
                "sourceSha256",
                "source",
                "manifest",
                "package",
                "libName",
            ],
        )?;
        let id = id_at(o.req("id")?, &o.path("id"))?;
        if out.iter().any(|x| x.id == id) {
            return Err(err(
                ErrorCode::BadName,
                o.path("id"),
                format!("duplicate variant id {id:?}"),
            ));
        }
        let origin = match o.opt("origin") {
            Some(x) => origin_at(x, &o.path("origin"))?,
            None => origin_from_id(&id),
        };
        let program = input::program_at(o.req("program")?, &o.path("program"), field, width)?;
        let source_sha256 = o
            .opt("sourceSha256")
            .map(|s| input::str_at(s, &o.path("sourceSha256")).map(str::to_string))
            .transpose()?;
        out.push(VariantSpec {
            id,
            origin,
            program,
            source_sha256,
        });
    }
    Ok(out)
}

/// A validated `codegen` request.
#[derive(Clone, Debug, PartialEq)]
pub struct CodegenRequest {
    pub field: FieldKind,
    pub width: usize,
    pub variants: Vec<VariantSpec>,
}

/// Validates `{ "field", "width", "matrix"?, "programs": [{id, program, origin?}] }`
/// (`variants` is accepted in place of `programs`).
pub fn parse_codegen_request(v: &Value) -> Result<CodegenRequest> {
    let o = Obj::new(v, "", &["field", "width", "matrix", "programs", "variants"])?;
    let field = input::field_at(o.req("field")?, &o.path("field"))?;
    let width = input::width_at(o.req("width")?, &o.path("width"), field)?;
    if let Some(m) = o.opt("matrix") {
        input::matrix_at(m, &o.path("matrix"), field, width)?;
    }
    let (key, list) = one_of(&o, &["programs", "variants"])?;
    let variants = variants_at(list, &o.path(key), field, width)?;
    Ok(CodegenRequest {
        field,
        width,
        variants,
    })
}

fn one_of<'a>(o: &Obj<'a>, keys: &[&'static str]) -> Result<(&'static str, &'a Value)> {
    let present: Vec<&'static str> = keys
        .iter()
        .copied()
        .filter(|k| o.opt(k).is_some())
        .collect();
    match present.as_slice() {
        [k] => Ok((k, o.opt(k).expect("present"))),
        [] => Err(err(
            ErrorCode::MissingField,
            o.path(keys[0]),
            format!("expected one of {keys:?}"),
        )),
        _ => Err(err(
            ErrorCode::UnknownField,
            o.path(present[1]),
            format!("give only one of {keys:?}"),
        )),
    }
}

/// What a `native` run does.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    /// Build and check correctness only.
    Correctness,
    /// Correctness, then one timing session of every correct variant.
    Benchmark,
    /// Correctness, an exploration session, then two confirmation sessions
    /// of the best contender against its baselines, and a verdict.
    Protocol,
}

/// Extra correctness cases in either field.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ExtraCases {
    Gf256(Vec<Vec<Gf256>>),
    Bn254(Vec<Vec<Bn254>>),
}

/// A validated `native` request.
#[derive(Clone, Debug, PartialEq)]
pub struct NativeRequest {
    pub mode: Mode,
    pub field: FieldKind,
    pub width: usize,
    /// The reference matrix (`y = M x`).
    pub matrix: AnyMatrix,
    pub variants: Vec<VariantSpec>,
    /// Lowercase hex; derived from the request when absent.
    pub seed: Option<String>,
    /// Session number for `benchmark` mode (default 1).
    pub session: u32,
    pub extra_cases: ExtraCases,
}

/// Validates
///
/// ```json
/// { "mode": "protocol", "field": "gf256", "width": 4, "matrix": [[...]],
///   "variants": [{"id": "c1", "origin": "search", "program": {...}}],
///   "seed": "c0ffee", "session": 1, "extraCases": [["00","01","00","00"]] }
/// ```
///
/// Instead of `variants`, a `codegen` member may carry the output of the
/// codegen subcommand (its `variants` with their programs), or `programs`
/// the codegen input list. Sources are always regenerated from the
/// programs; a recorded `sourceSha256` must match. `mode` defaults to
/// `protocol`.
pub fn parse_native_request(v: &Value) -> Result<NativeRequest> {
    let o = Obj::new(
        v,
        "",
        &[
            "mode",
            "field",
            "width",
            "matrix",
            "variants",
            "programs",
            "codegen",
            "seed",
            "session",
            "extraCases",
        ],
    )?;
    let mode = match o.opt("mode") {
        None => Mode::Protocol,
        Some(m) => match input::str_at(m, &o.path("mode"))? {
            "correctness" => Mode::Correctness,
            "benchmark" => Mode::Benchmark,
            "protocol" => Mode::Protocol,
            s => {
                return Err(err(
                    ErrorCode::BadProfile,
                    o.path("mode"),
                    format!("unknown mode {s:?} (expected correctness, benchmark or protocol)"),
                ))
            }
        },
    };
    let field = input::field_at(o.req("field")?, &o.path("field"))?;
    let width = input::width_at(o.req("width")?, &o.path("width"), field)?;
    let matrix = input::matrix_at(o.req("matrix")?, &o.path("matrix"), field, width)?;
    let (key, list) = one_of(&o, &["variants", "programs", "codegen"])?;
    let variants = if key == "codegen" {
        let base = o.path("codegen");
        let doc = list.as_object().ok_or_else(|| {
            err(
                ErrorCode::BadType,
                &base,
                "expected the codegen output object",
            )
        })?;
        let inner = doc.get("variants").ok_or_else(|| {
            err(
                ErrorCode::MissingField,
                at(&base, "variants"),
                "missing member \"variants\"",
            )
        })?;
        if let Some(f) = doc.get("field").and_then(Value::as_str) {
            if FieldKind::parse(f) != Some(field) {
                return Err(err(
                    ErrorCode::FieldMismatch,
                    at(&base, "field"),
                    format!("codegen field {f:?} differs from field {field}"),
                ));
            }
        }
        variants_at(inner, &at(&base, "variants"), field, width)?
    } else {
        variants_at(list, &o.path(key), field, width)?
    };
    let seed = o
        .opt("seed")
        .map(|s| input::seed_at(s, &o.path("seed")))
        .transpose()?;
    let session = match o.opt("session") {
        None => 1,
        Some(s) => {
            let n = input::u64_at(s, &o.path("session"))?;
            u32::try_from(n).ok().filter(|&n| n >= 1).ok_or_else(|| {
                err(
                    ErrorCode::BadType,
                    o.path("session"),
                    "session must be a positive integer",
                )
            })?
        }
    };
    let extra_cases = match o.opt("extraCases") {
        None => match field {
            FieldKind::Gf256 => ExtraCases::Gf256(Vec::new()),
            FieldKind::Bn254 => ExtraCases::Bn254(Vec::new()),
        },
        Some(x) => {
            let path = o.path("extraCases");
            let items = input::array_at(x, &path)?;
            if items.len() > MAX_EXTRA_CASES {
                return Err(err(
                    ErrorCode::BadDimension,
                    &path,
                    format!("at most {MAX_EXTRA_CASES} extra cases"),
                ));
            }
            match field {
                FieldKind::Gf256 => ExtraCases::Gf256(
                    items
                        .iter()
                        .enumerate()
                        .map(|(i, c)| input::vector_at::<Gf256>(c, &at(&path, i), width))
                        .collect::<Result<_>>()?,
                ),
                FieldKind::Bn254 => ExtraCases::Bn254(
                    items
                        .iter()
                        .enumerate()
                        .map(|(i, c)| input::vector_at::<Bn254>(c, &at(&path, i), width))
                        .collect::<Result<_>>()?,
                ),
            }
        }
    };
    Ok(NativeRequest {
        mode,
        field,
        width,
        matrix,
        variants,
        seed,
        session,
        extra_cases,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn aes() -> Value {
        json!([
            ["02", "03", "01", "01"],
            ["01", "02", "03", "01"],
            ["01", "01", "02", "03"],
            ["03", "01", "01", "02"]
        ])
    }

    fn identity_program() -> Value {
        json!({"field": "gf256", "width": 4, "instructions": [], "outputs": [0, 1, 2, 3]})
    }

    #[test]
    fn native_request_defaults_and_origins() {
        let v = json!({
            "field": "gf256", "width": 4, "matrix": aes(),
            "variants": [
                {"id": "baseline-known", "program": identity_program()},
                {"id": "c1", "program": identity_program()},
                {"id": "mine", "origin": "user", "program": identity_program()}
            ],
            "extraCases": [["00", "01", "00", "00"]]
        });
        let r = parse_native_request(&v).unwrap();
        assert_eq!(r.mode, Mode::Protocol);
        assert_eq!(r.session, 1);
        assert_eq!(r.variants[0].origin, CandidateOrigin::BaselineKnown);
        assert_eq!(r.variants[1].origin, CandidateOrigin::Search);
        assert_eq!(r.variants[2].origin, CandidateOrigin::User);
        assert!(matches!(&r.extra_cases, ExtraCases::Gf256(c) if c.len() == 1));
    }

    #[test]
    fn native_request_errors() {
        let base = json!({
            "field": "gf256", "width": 4, "matrix": aes(),
            "variants": [{"id": "c1", "program": identity_program()}]
        });
        let mut v = base.clone();
        v["variants"][0]["id"] = json!("bad id");
        assert_eq!(
            parse_native_request(&v).unwrap_err().code,
            ErrorCode::BadName
        );
        let mut v = base.clone();
        v["variants"] = json!([{"id": "a", "program": identity_program()}, {"id": "a", "program": identity_program()}]);
        assert_eq!(
            parse_native_request(&v).unwrap_err().code,
            ErrorCode::BadName
        );
        let mut v = base.clone();
        v["programs"] = v["variants"].clone();
        assert_eq!(
            parse_native_request(&v).unwrap_err().code,
            ErrorCode::UnknownField
        );
        let mut v = base.clone();
        v["mode"] = json!("fast");
        assert_eq!(
            parse_native_request(&v).unwrap_err().code,
            ErrorCode::BadProfile
        );
        let mut v = base.clone();
        v["extraCases"] = json!([["00", "01"]]);
        let e = parse_native_request(&v).unwrap_err();
        assert_eq!(
            (e.code, e.path.as_str()),
            (ErrorCode::BadDimension, "/extraCases/0")
        );
        let mut v = base;
        v["variants"][0]["program"]["field"] = json!("bn254");
        let e = parse_native_request(&v).unwrap_err();
        assert_eq!(
            (e.code, e.path.as_str()),
            (ErrorCode::FieldMismatch, "/variants/0/program/field")
        );
    }

    #[test]
    fn codegen_documents_are_accepted() {
        let v = json!({
            "mode": "correctness", "field": "gf256", "width": 4, "matrix": aes(),
            "codegen": {"field": "gf256", "variants": [{"id": "c1", "program": identity_program(), "source": "...", "sourceSha256": "sha256:00"}]}
        });
        let r = parse_native_request(&v).unwrap();
        assert_eq!(r.variants[0].source_sha256.as_deref(), Some("sha256:00"));
        let c = parse_codegen_request(&json!({"field": "gf256", "width": 4, "matrix": aes(), "programs": [{"id": "c1", "program": identity_program()}]})).unwrap();
        assert_eq!(c.variants.len(), 1);
    }
}
