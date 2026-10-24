//! Small helpers for reading untrusted JSON input with coded errors.
//!
//! The engine's `search`, `codegen` and `native` subcommands share these
//! helpers, so their error documents look like the ones produced by
//! `cryptificate_core::validate`: a stable [`ErrorCode`] and the JSON pointer
//! of the offending value. Optional members may be absent or `null`.

use cryptificate_core::design::AnyMatrix;
use cryptificate_core::error::pointer_push as at;
use cryptificate_core::limits;
use cryptificate_core::linalg::Matrix;
use cryptificate_core::{
    validate_program, AnyProgram, Bn254, ErrorCode, Field, FieldKind, Gf256, ValidationError,
};
use serde_json::{Map, Value};

/// Result type of the input helpers.
pub type Result<T> = std::result::Result<T, ValidationError>;

fn err(code: ErrorCode, path: impl Into<String>, msg: impl Into<String>) -> ValidationError {
    ValidationError::new(code, path, msg)
}

/// A JSON object whose members are restricted to a known set.
pub struct Obj<'a> {
    map: &'a Map<String, Value>,
    base: String,
}

impl<'a> Obj<'a> {
    /// Checks that `v` is an object with no members outside `allowed`.
    pub fn new(v: &'a Value, base: &str, allowed: &[&str]) -> Result<Self> {
        let map = v.as_object().ok_or_else(|| {
            err(
                ErrorCode::BadType,
                base,
                format!("expected an object, got {}", type_name(v)),
            )
        })?;
        if let Some(k) = map.keys().find(|k| !allowed.contains(&k.as_str())) {
            return Err(err(
                ErrorCode::UnknownField,
                at(base, k),
                format!("unknown member {k:?}"),
            ));
        }
        Ok(Obj {
            map,
            base: base.to_string(),
        })
    }

    /// JSON pointer of member `key`.
    pub fn path(&self, key: &str) -> String {
        at(&self.base, key)
    }

    /// A member that may be absent or `null`.
    pub fn opt(&self, key: &str) -> Option<&'a Value> {
        self.map.get(key).filter(|v| !v.is_null())
    }

    /// A required member.
    pub fn req(&self, key: &str) -> Result<&'a Value> {
        self.opt(key).ok_or_else(|| {
            err(
                ErrorCode::MissingField,
                self.path(key),
                format!("missing member {key:?}"),
            )
        })
    }
}

/// The JSON type name of a value, for error messages.
pub fn type_name(v: &Value) -> &'static str {
    match v {
        Value::Null => "null",
        Value::Bool(_) => "a boolean",
        Value::Number(_) => "a number",
        Value::String(_) => "a string",
        Value::Array(_) => "an array",
        Value::Object(_) => "an object",
    }
}

/// A string value.
pub fn str_at<'a>(v: &'a Value, path: &str) -> Result<&'a str> {
    v.as_str().ok_or_else(|| {
        err(
            ErrorCode::BadType,
            path,
            format!("expected a string, got {}", type_name(v)),
        )
    })
}

/// An array value.
pub fn array_at<'a>(v: &'a Value, path: &str) -> Result<&'a Vec<Value>> {
    v.as_array().ok_or_else(|| {
        err(
            ErrorCode::BadType,
            path,
            format!("expected an array, got {}", type_name(v)),
        )
    })
}

/// A non-negative integer.
pub fn u64_at(v: &Value, path: &str) -> Result<u64> {
    v.as_u64().ok_or_else(|| {
        err(
            ErrorCode::BadType,
            path,
            format!("expected a non-negative integer, got {v}"),
        )
    })
}

/// A boolean value.
pub fn bool_at(v: &Value, path: &str) -> Result<bool> {
    v.as_bool().ok_or_else(|| {
        err(
            ErrorCode::BadType,
            path,
            format!("expected a boolean, got {}", type_name(v)),
        )
    })
}

/// A field name, `"gf256"` or `"bn254"`.
pub fn field_at(v: &Value, path: &str) -> Result<FieldKind> {
    let s = str_at(v, path)?;
    FieldKind::parse(s).ok_or_else(|| {
        err(
            ErrorCode::FieldMismatch,
            path,
            format!("unknown field {s:?} (expected gf256 or bn254)"),
        )
    })
}

/// A width that the field supports (experimental GF(2^8) widths included).
pub fn width_at(v: &Value, path: &str, field: FieldKind) -> Result<usize> {
    let w = u64_at(v, path)?;
    let w = usize::try_from(w).unwrap_or(usize::MAX);
    if limits::width_status(field, w).is_none() {
        return Err(err(
            ErrorCode::UnsupportedWidth,
            path,
            format!("width {w} is not supported for field {field}"),
        ));
    }
    Ok(w)
}

/// A hex seed of 1 to [`limits::MAX_SEED_HEX_DIGITS`] digits, lowercased.
pub fn seed_at(v: &Value, path: &str) -> Result<String> {
    let s = str_at(v, path)?;
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
    Ok(s.to_ascii_lowercase())
}

fn element_at<F: Field>(v: &Value, path: &str) -> Result<F> {
    let s = str_at(v, path)?;
    F::decode(s).map_err(|e| {
        let code = match F::KIND {
            FieldKind::Gf256 => ErrorCode::InvalidByte,
            FieldKind::Bn254 => ErrorCode::ValueNotCanonical,
        };
        err(code, path, e.reason)
    })
}

/// A vector of exactly `width` field elements.
pub fn vector_at<F: Field>(v: &Value, path: &str, width: usize) -> Result<Vec<F>> {
    let items = array_at(v, path)?;
    if items.len() != width {
        return Err(err(
            ErrorCode::BadDimension,
            path,
            format!("expected {width} entries, got {}", items.len()),
        ));
    }
    items
        .iter()
        .enumerate()
        .map(|(i, x)| element_at::<F>(x, &at(path, i)))
        .collect()
}

fn square_at<F: Field>(v: &Value, path: &str, width: usize) -> Result<Matrix<F>> {
    let rows = array_at(v, path)?;
    if rows.len() != width {
        return Err(err(
            ErrorCode::BadDimension,
            path,
            format!("expected {width} rows, got {}", rows.len()),
        ));
    }
    rows.iter()
        .enumerate()
        .map(|(i, r)| vector_at::<F>(r, &at(path, i), width))
        .collect()
}

/// A `width x width` matrix over `field`, entries in canonical string form.
pub fn matrix_at(v: &Value, path: &str, field: FieldKind, width: usize) -> Result<AnyMatrix> {
    Ok(match field {
        FieldKind::Gf256 => AnyMatrix::Gf256(square_at::<Gf256>(v, path, width)?),
        FieldKind::Bn254 => AnyMatrix::Bn254(square_at::<Bn254>(v, path, width)?),
    })
}

/// A program for the given field and width; error paths are prefixed with `path`.
pub fn program_at(v: &Value, path: &str, field: FieldKind, width: usize) -> Result<AnyProgram> {
    // Report a program written for another field or width as such, before
    // its own checks report a downstream symptom.
    if let Some(f) = v
        .get("field")
        .and_then(Value::as_str)
        .and_then(FieldKind::parse)
    {
        if f != field {
            return Err(err(
                ErrorCode::FieldMismatch,
                at(path, "field"),
                format!("program field {f} differs from field {field}"),
            ));
        }
    }
    if let Some(w) = v.get("width").and_then(Value::as_u64) {
        if w != width as u64 {
            return Err(err(
                ErrorCode::BadDimension,
                at(path, "width"),
                format!("program width {w} differs from width {width}"),
            ));
        }
    }
    let p = validate_program(v).map_err(|mut e| {
        e.path = format!("{path}{}", e.path);
        e
    })?;
    if p.field() != field {
        return Err(err(
            ErrorCode::FieldMismatch,
            at(path, "field"),
            format!("program field {} differs from field {field}", p.field()),
        ));
    }
    if p.width() != width {
        return Err(err(
            ErrorCode::BadDimension,
            at(path, "width"),
            format!("program width {} differs from width {width}", p.width()),
        ));
    }
    Ok(p)
}

/// Canonical string rows of a matrix.
pub fn encode_matrix(m: &AnyMatrix) -> Vec<Vec<String>> {
    fn enc<F: Field>(m: &[Vec<F>]) -> Vec<Vec<String>> {
        m.iter()
            .map(|r| r.iter().map(Field::encode).collect())
            .collect()
    }
    match m {
        AnyMatrix::Gf256(m) => enc(m),
        AnyMatrix::Bn254(m) => enc(m),
    }
}

/// The field of a matrix.
pub fn matrix_field(m: &AnyMatrix) -> FieldKind {
    match m {
        AnyMatrix::Gf256(_) => FieldKind::Gf256,
        AnyMatrix::Bn254(_) => FieldKind::Bn254,
    }
}

/// The number of rows of a matrix.
pub fn matrix_width(m: &AnyMatrix) -> usize {
    match m {
        AnyMatrix::Gf256(m) => m.len(),
        AnyMatrix::Bn254(m) => m.len(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn matrix_errors_carry_pointers() {
        let v = json!([["02", "03"], ["01", "zz"]]);
        let e = matrix_at(&v, "/matrix", FieldKind::Gf256, 2).unwrap_err();
        assert_eq!(e.code, ErrorCode::InvalidByte);
        assert_eq!(e.path, "/matrix/1/1");
        let v = json!([["1", "01"], ["1", "1"]]);
        let e = matrix_at(&v, "/matrix", FieldKind::Bn254, 2).unwrap_err();
        assert_eq!(e.code, ErrorCode::ValueNotCanonical);
        assert_eq!(e.path, "/matrix/0/1");
        let e = matrix_at(&json!([["01"]]), "/m", FieldKind::Gf256, 2).unwrap_err();
        assert_eq!(e.code, ErrorCode::BadDimension);
    }

    #[test]
    fn unknown_members_are_rejected() {
        let v = json!({"a": 1, "b": 2});
        let e = Obj::new(&v, "", &["a"]).err().unwrap();
        assert_eq!(e.code, ErrorCode::UnknownField);
        assert_eq!(e.path, "/b");
        let null_a = json!({"a": null});
        let o = Obj::new(&null_a, "", &["a"]).unwrap();
        assert!(o.opt("a").is_none());
        assert_eq!(o.req("a").unwrap_err().code, ErrorCode::MissingField);
    }

    #[test]
    fn seeds_are_lowercased_and_bounded() {
        assert_eq!(seed_at(&json!("ABcd"), "/seed").unwrap(), "abcd");
        assert_eq!(
            seed_at(&json!(""), "/seed").unwrap_err().code,
            ErrorCode::BadSeed
        );
        assert!(seed_at(&json!("xyz"), "/seed").is_err());
        assert!(seed_at(&json!("a".repeat(65)), "/seed").is_err());
    }

    #[test]
    fn program_paths_are_prefixed() {
        let p = json!({"field": "gf256", "width": 4, "instructions": [{"op": "add", "a": 0, "b": 9}], "outputs": [0, 1, 2, 3]});
        let e = program_at(&p, "/program", FieldKind::Gf256, 4).unwrap_err();
        assert_eq!(e.code, ErrorCode::BadReference);
        assert_eq!(e.path, "/program/instructions/0/b");
        let e = program_at(&p, "/program", FieldKind::Bn254, 3).unwrap_err();
        assert_eq!(e.code, ErrorCode::FieldMismatch);
    }
}
