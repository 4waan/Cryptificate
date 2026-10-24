//! Validation of untrusted JSON into normalized, typed values.
//!
//! Every error carries a stable [`ErrorCode`] and the JSON pointer of the
//! offending value. Parsing proceeds in two stages: a structural walk over the
//! JSON value (types, required and unknown members, field element syntax),
//! then the semantic checks of the typed value (`check_at`), which other
//! crates can also run on values they build themselves.
//!
//! Optional members may be absent or `null`; both mean "not given".

use serde_json::{Map, Value};

use crate::design::{
    AesLikeDesign, CandidateDesign, ConstantsSpec, HadesDesign, SboxSpec, Target, MODEL_AES_LIKE,
    MODEL_HADES,
};
use crate::error::{pointer_push as at, ErrorCode, ValidationError};
use crate::field::{Bn254, Field, FieldKind, Gf256};
use crate::limits;
use crate::program::{AnyProgram, Instruction, Program};
use crate::request::{AnalysisRequest, ExperimentRequest, Profile};

type Result<T> = std::result::Result<T, ValidationError>;

fn err(code: ErrorCode, path: impl Into<String>, msg: impl Into<String>) -> ValidationError {
    ValidationError::new(code, path, msg)
}

/// Parses JSON text, mapping syntax errors to `invalid_json` at the root.
pub fn parse_json(text: &str) -> Result<Value> {
    serde_json::from_str(text).map_err(|e| err(ErrorCode::InvalidJson, "", e.to_string()))
}

/// Validates and normalizes a candidate design.
pub fn validate_design(v: &Value) -> Result<CandidateDesign> {
    design_at(v, "")
}

/// Validates a standalone program.
pub fn validate_program(v: &Value) -> Result<AnyProgram> {
    program_at(v, "")
}

/// Validates and normalizes an analysis request.
pub fn validate_analysis_request(v: &Value) -> Result<AnalysisRequest> {
    let o = Obj::new(v, "", &["design", "program", "target"])?;
    let design = design_at(o.req("design")?, &o.path("design"))?;
    let program = o
        .opt("program")
        .map(|p| program_for_design(p, &o.path("program"), &design))
        .transpose()?;
    let target = match o.opt("target") {
        None => design.default_target(),
        Some(t) => {
            let path = o.path("target");
            let s = str_at(t, &path)?;
            let target = match s {
                "matrix" => Target::Matrix,
                "external" => Target::External,
                "internal" => Target::Internal,
                _ => {
                    return Err(err(
                        ErrorCode::BadTarget,
                        path,
                        format!("unknown target {s:?} (expected matrix, external or internal)"),
                    ))
                }
            };
            if design.target_matrix(target).is_none() {
                return Err(err(
                    ErrorCode::BadTarget,
                    path,
                    format!("model {} has no {s:?} matrix", design.model()),
                ));
            }
            target
        }
    };
    Ok(AnalysisRequest {
        design,
        program,
        target,
    })
}

/// Validates and normalizes an experiment request.
pub fn validate_experiment_request(v: &Value) -> Result<ExperimentRequest> {
    let o = Obj::new(v, "", &["design", "program", "profile", "seed"])?;
    let design = design_at(o.req("design")?, &o.path("design"))?;
    let program = o
        .opt("program")
        .map(|p| program_for_design(p, &o.path("program"), &design))
        .transpose()?;
    let profile_path = o.path("profile");
    let profile = match str_at(o.req("profile")?, &profile_path)? {
        "quick" => Profile::Quick,
        "research" => Profile::Research,
        s => {
            return Err(err(
                ErrorCode::BadProfile,
                profile_path,
                format!("unknown profile {s:?} (expected quick or research)"),
            ))
        }
    };
    let seed = match o.opt("seed") {
        None => None,
        Some(s) => {
            let path = o.path("seed");
            let s = str_at(s, &path)?;
            if s.is_empty()
                || s.len() > limits::MAX_SEED_HEX_DIGITS
                || !s.bytes().all(|b| b.is_ascii_hexdigit())
            {
                return Err(err(
                    ErrorCode::BadSeed,
                    path,
                    format!("seed must be 1..{} hex digits", limits::MAX_SEED_HEX_DIGITS),
                ));
            }
            Some(s.to_ascii_lowercase())
        }
    };
    Ok(ExperimentRequest {
        design,
        program,
        profile,
        seed,
    })
}

fn program_for_design(v: &Value, path: &str, design: &CandidateDesign) -> Result<AnyProgram> {
    // Compare field and width with the design before the program's own
    // checks, so that a program written for another design is reported as
    // such rather than through a downstream symptom (e.g. output count).
    let field_mismatch = |f: FieldKind| {
        err(
            ErrorCode::FieldMismatch,
            at(path, "field"),
            format!(
                "program field {f} differs from design field {}",
                design.field()
            ),
        )
    };
    let width_mismatch = |w: usize| {
        err(
            ErrorCode::BadDimension,
            at(path, "width"),
            format!(
                "program width {w} differs from design width {}",
                design.width()
            ),
        )
    };
    if let Some(f) = v
        .get("field")
        .and_then(Value::as_str)
        .and_then(FieldKind::parse)
    {
        if f != design.field() {
            return Err(field_mismatch(f));
        }
        if let Some(w) = v.get("width").and_then(Value::as_u64) {
            if w != design.width() as u64 {
                return Err(width_mismatch(usize::try_from(w).unwrap_or(usize::MAX)));
            }
        }
    }
    let program = program_at(v, path)?;
    if program.field() != design.field() {
        return Err(field_mismatch(program.field()));
    }
    if program.width() != design.width() {
        return Err(width_mismatch(program.width()));
    }
    Ok(program)
}

// ---------------------------------------------------------------------------
// Designs
// ---------------------------------------------------------------------------

fn design_at(v: &Value, base: &str) -> Result<CandidateDesign> {
    let map = obj_map(v, base)?;
    let model_path = at(base, "model");
    let model = map.get("model").filter(|m| !m.is_null()).ok_or_else(|| {
        err(
            ErrorCode::MissingField,
            &model_path,
            "missing member \"model\"",
        )
    })?;
    let mut design = match str_at(model, &model_path)? {
        MODEL_AES_LIKE => CandidateDesign::AesLike(aes_like_at(v, base)?),
        MODEL_HADES => CandidateDesign::Hades(hades_at(v, base)?),
        other => {
            return Err(err(
                ErrorCode::UnknownModel,
                model_path,
                format!("unknown model {other:?} (expected {MODEL_AES_LIKE} or {MODEL_HADES})"),
            ))
        }
    };
    design.normalize();
    design.check_at(base)?;
    Ok(design)
}

fn field_member(o: &Obj, expected: FieldKind) -> Result<FieldKind> {
    let path = o.path("field");
    let s = str_at(o.req("field")?, &path)?;
    match FieldKind::parse(s) {
        Some(f) if f == expected => Ok(f),
        _ => Err(err(
            ErrorCode::FieldMismatch,
            path,
            format!("this model requires field \"{expected}\", got {s:?}"),
        )),
    }
}

fn aes_like_at(v: &Value, base: &str) -> Result<AesLikeDesign> {
    let o = Obj::new(
        v,
        base,
        &[
            "model",
            "field",
            "width",
            "matrix",
            "offsets",
            "rounds",
            "sbox",
            "experimental",
        ],
    )?;
    let field = field_member(&o, FieldKind::Gf256)?;
    let width = usize_at(
        o.req("width")?,
        &o.path("width"),
        ErrorCode::UnsupportedWidth,
    )?;
    let matrix = matrix_at::<Gf256>(o.req("matrix")?, &o.path("matrix"))?;
    let offsets_path = o.path("offsets");
    let offsets = array_at(o.req("offsets")?, &offsets_path)?
        .iter()
        .enumerate()
        .map(|(i, x)| usize_at(x, &at(&offsets_path, i), ErrorCode::OffsetOutOfRange))
        .collect::<Result<Vec<_>>>()?;
    let rounds = u32_at(
        o.req("rounds")?,
        &o.path("rounds"),
        ErrorCode::RoundsOutOfRange,
    )?;
    let sbox = sbox_at(o.req("sbox")?, &o.path("sbox"))?;
    if let Some(e) = o.opt("experimental") {
        // Accepted so that normalized output can be fed back; the value is
        // recomputed from the width by normalization.
        bool_at(e, &o.path("experimental"))?;
    }
    Ok(AesLikeDesign {
        field,
        width,
        matrix,
        offsets,
        rounds,
        sbox,
        experimental: false,
    })
}

fn hades_at(v: &Value, base: &str) -> Result<HadesDesign> {
    let o = Obj::new(
        v,
        base,
        &[
            "model",
            "field",
            "width",
            "external",
            "internal",
            "fullRounds",
            "partialRounds",
            "sbox",
            "partialMask",
            "constants",
        ],
    )?;
    let field = field_member(&o, FieldKind::Bn254)?;
    let width = usize_at(
        o.req("width")?,
        &o.path("width"),
        ErrorCode::UnsupportedWidth,
    )?;
    let external = matrix_at::<Bn254>(o.req("external")?, &o.path("external"))?;
    let internal = matrix_at::<Bn254>(o.req("internal")?, &o.path("internal"))?;
    let full_rounds = u32_at(
        o.req("fullRounds")?,
        &o.path("fullRounds"),
        ErrorCode::RoundsOutOfRange,
    )?;
    let partial_rounds = u32_at(
        o.req("partialRounds")?,
        &o.path("partialRounds"),
        ErrorCode::RoundsOutOfRange,
    )?;
    let sbox = sbox_at(o.req("sbox")?, &o.path("sbox"))?;
    let partial_mask = match o.opt("partialMask") {
        None => HadesDesign::default_partial_mask(width),
        Some(m) => {
            let path = o.path("partialMask");
            array_at(m, &path)?
                .iter()
                .enumerate()
                .map(|(i, b)| bool_at(b, &at(&path, i)))
                .collect::<Result<Vec<_>>>()?
        }
    };
    let constants = match o.opt("constants") {
        None => ConstantsSpec::Reference,
        Some(c) => constants_at(c, &o.path("constants"))?,
    };
    Ok(HadesDesign {
        field,
        width,
        external,
        internal,
        full_rounds,
        partial_rounds,
        sbox,
        partial_mask,
        constants,
    })
}

fn kind_of<'a>(v: &'a Value, base: &str) -> Result<&'a str> {
    let map = obj_map(v, base)?;
    let path = at(base, "kind");
    let k = map
        .get("kind")
        .filter(|k| !k.is_null())
        .ok_or_else(|| err(ErrorCode::MissingField, &path, "missing member \"kind\""))?;
    str_at(k, &path)
}

fn sbox_at(v: &Value, base: &str) -> Result<SboxSpec> {
    match kind_of(v, base)? {
        "aes" => {
            Obj::new(v, base, &["kind"])?;
            Ok(SboxSpec::Aes)
        }
        "table" => {
            let o = Obj::new(v, base, &["kind", "table"])?;
            let path = o.path("table");
            let table = vec_at::<Gf256>(o.req("table")?, &path)?;
            Ok(SboxSpec::Table { table })
        }
        "power" => {
            let o = Obj::new(v, base, &["kind", "exponent"])?;
            let exponent = u32_at(
                o.req("exponent")?,
                &o.path("exponent"),
                ErrorCode::ExponentOutOfRange,
            )?;
            Ok(SboxSpec::Power { exponent })
        }
        other => Err(err(
            ErrorCode::BadSboxKind,
            at(base, "kind"),
            format!("unknown S-box kind {other:?} (expected aes, table or power)"),
        )),
    }
}

fn constants_at(v: &Value, base: &str) -> Result<ConstantsSpec> {
    match kind_of(v, base)? {
        "reference" => {
            Obj::new(v, base, &["kind"])?;
            Ok(ConstantsSpec::Reference)
        }
        "explicit" => {
            let o = Obj::new(v, base, &["kind", "values"])?;
            let values = matrix_at::<Bn254>(o.req("values")?, &o.path("values"))?;
            Ok(ConstantsSpec::Explicit { values })
        }
        other => Err(err(
            ErrorCode::BadConstantsKind,
            at(base, "kind"),
            format!("unknown constants kind {other:?} (expected reference or explicit)"),
        )),
    }
}

// ---------------------------------------------------------------------------
// Programs
// ---------------------------------------------------------------------------

fn program_at(v: &Value, base: &str) -> Result<AnyProgram> {
    let o = Obj::new(
        v,
        base,
        &["field", "width", "name", "instructions", "outputs"],
    )?;
    let path = o.path("field");
    let s = str_at(o.req("field")?, &path)?;
    let program = match FieldKind::parse(s) {
        Some(FieldKind::Gf256) => AnyProgram::Gf256(program_body::<Gf256>(&o)?),
        Some(FieldKind::Bn254) => AnyProgram::Bn254(program_body::<Bn254>(&o)?),
        None => {
            return Err(err(
                ErrorCode::FieldMismatch,
                path,
                format!("unknown field {s:?} (expected gf256 or bn254)"),
            ))
        }
    };
    program.check_at(base)?;
    Ok(program)
}

fn program_body<F: Field>(o: &Obj) -> Result<Program<F>> {
    let width = usize_at(
        o.req("width")?,
        &o.path("width"),
        ErrorCode::UnsupportedWidth,
    )?;
    let name = match o.opt("name") {
        None => None,
        Some(n) => Some(str_at(n, &o.path("name"))?.to_owned()),
    };
    let instrs_path = o.path("instructions");
    let raw = array_at(o.req("instructions")?, &instrs_path)?;
    if raw.len() > limits::MAX_INSTRUCTIONS {
        return Err(err(
            ErrorCode::TooManyInstructions,
            instrs_path,
            format!(
                "at most {} instructions are allowed, got {}",
                limits::MAX_INSTRUCTIONS,
                raw.len()
            ),
        ));
    }
    let instructions = raw
        .iter()
        .enumerate()
        .map(|(i, ins)| instruction_at::<F>(ins, &at(&instrs_path, i)))
        .collect::<Result<Vec<_>>>()?;
    let outputs_path = o.path("outputs");
    let outputs = array_at(o.req("outputs")?, &outputs_path)?
        .iter()
        .enumerate()
        .map(|(j, r)| usize_at(r, &at(&outputs_path, j), ErrorCode::BadReference))
        .collect::<Result<Vec<_>>>()?;
    Ok(Program {
        width,
        name,
        instructions,
        outputs,
    })
}

fn instruction_at<F: Field>(v: &Value, base: &str) -> Result<Instruction<F>> {
    let map = obj_map(v, base)?;
    let op_path = at(base, "op");
    let op = map
        .get("op")
        .filter(|x| !x.is_null())
        .ok_or_else(|| err(ErrorCode::MissingField, &op_path, "missing member \"op\""))?;
    match str_at(op, &op_path)? {
        "add" => {
            let o = Obj::new(v, base, &["op", "a", "b"])?;
            let a = usize_at(o.req("a")?, &o.path("a"), ErrorCode::BadReference)?;
            let b = usize_at(o.req("b")?, &o.path("b"), ErrorCode::BadReference)?;
            Ok(Instruction::Add { a, b })
        }
        "mul" => {
            let o = Obj::new(v, base, &["op", "k", "a"])?;
            let k = elem_at::<F>(o.req("k")?, &o.path("k"))?;
            let a = usize_at(o.req("a")?, &o.path("a"), ErrorCode::BadReference)?;
            Ok(Instruction::Mul { k, a })
        }
        other => Err(err(
            ErrorCode::BadOp,
            op_path,
            format!("unknown op {other:?} (expected add or mul)"),
        )),
    }
}

// ---------------------------------------------------------------------------
// Primitive readers
// ---------------------------------------------------------------------------

/// An object being read, with its pointer and the members it may contain.
struct Obj<'a> {
    map: &'a Map<String, Value>,
    base: String,
}

impl<'a> Obj<'a> {
    fn new(v: &'a Value, base: &str, allowed: &[&str]) -> Result<Self> {
        let map = obj_map(v, base)?;
        let mut keys: Vec<&String> = map.keys().collect();
        keys.sort();
        if let Some(k) = keys.into_iter().find(|k| !allowed.contains(&k.as_str())) {
            return Err(err(
                ErrorCode::UnknownField,
                at(base, k),
                format!("unknown member {k:?}"),
            ));
        }
        Ok(Obj {
            map,
            base: base.to_owned(),
        })
    }

    fn path(&self, key: &str) -> String {
        at(&self.base, key)
    }

    fn req(&self, key: &str) -> Result<&'a Value> {
        self.opt(key).ok_or_else(|| {
            err(
                ErrorCode::MissingField,
                self.path(key),
                format!("missing member {key:?}"),
            )
        })
    }

    fn opt(&self, key: &str) -> Option<&'a Value> {
        self.map.get(key).filter(|v| !v.is_null())
    }
}

fn type_name(v: &Value) -> &'static str {
    match v {
        Value::Null => "null",
        Value::Bool(_) => "a boolean",
        Value::Number(_) => "a number",
        Value::String(_) => "a string",
        Value::Array(_) => "an array",
        Value::Object(_) => "an object",
    }
}

fn obj_map<'a>(v: &'a Value, path: &str) -> Result<&'a Map<String, Value>> {
    v.as_object().ok_or_else(|| {
        err(
            ErrorCode::BadType,
            path,
            format!("expected an object, got {}", type_name(v)),
        )
    })
}

fn array_at<'a>(v: &'a Value, path: &str) -> Result<&'a Vec<Value>> {
    v.as_array().ok_or_else(|| {
        err(
            ErrorCode::BadType,
            path,
            format!("expected an array, got {}", type_name(v)),
        )
    })
}

fn str_at<'a>(v: &'a Value, path: &str) -> Result<&'a str> {
    v.as_str().ok_or_else(|| {
        err(
            ErrorCode::BadType,
            path,
            format!("expected a string, got {}", type_name(v)),
        )
    })
}

fn bool_at(v: &Value, path: &str) -> Result<bool> {
    v.as_bool().ok_or_else(|| {
        err(
            ErrorCode::BadType,
            path,
            format!("expected a boolean, got {}", type_name(v)),
        )
    })
}

/// A non-negative integer. Integers that are negative or do not fit are
/// reported with `range_code`; non-integers with `bad_type`.
fn u64_at(v: &Value, path: &str, range_code: ErrorCode) -> Result<u64> {
    match v {
        Value::Number(n) => {
            if let Some(x) = n.as_u64() {
                Ok(x)
            } else if let Some(x) = n.as_i64() {
                Err(err(range_code, path, format!("{x} is negative")))
            } else {
                Err(err(
                    ErrorCode::BadType,
                    path,
                    format!("expected an integer, got {n}"),
                ))
            }
        }
        _ => Err(err(
            ErrorCode::BadType,
            path,
            format!("expected an integer, got {}", type_name(v)),
        )),
    }
}

fn usize_at(v: &Value, path: &str, range_code: ErrorCode) -> Result<usize> {
    let x = u64_at(v, path, range_code)?;
    usize::try_from(x).map_err(|_| err(range_code, path, format!("{x} is too large")))
}

fn u32_at(v: &Value, path: &str, range_code: ErrorCode) -> Result<u32> {
    let x = u64_at(v, path, range_code)?;
    u32::try_from(x).map_err(|_| err(range_code, path, format!("{x} is too large")))
}

fn elem_at<F: Field>(v: &Value, path: &str) -> Result<F> {
    let code = match F::KIND {
        FieldKind::Gf256 => ErrorCode::InvalidByte,
        FieldKind::Bn254 => ErrorCode::ValueNotCanonical,
    };
    match v {
        Value::String(s) => F::decode(s).map_err(|e| err(code, path, e.reason)),
        _ => Err(err(
            ErrorCode::BadType,
            path,
            format!(
                "field elements are strings ({}), got {}",
                match F::KIND {
                    FieldKind::Gf256 => "two hex digits",
                    FieldKind::Bn254 => "canonical decimal",
                },
                type_name(v)
            ),
        )),
    }
}

fn vec_at<F: Field>(v: &Value, path: &str) -> Result<Vec<F>> {
    array_at(v, path)?
        .iter()
        .enumerate()
        .map(|(i, x)| elem_at::<F>(x, &at(path, i)))
        .collect()
}

fn matrix_at<F: Field>(v: &Value, path: &str) -> Result<Vec<Vec<F>>> {
    array_at(v, path)?
        .iter()
        .enumerate()
        .map(|(i, row)| vec_at::<F>(row, &at(path, i)))
        .collect()
}
