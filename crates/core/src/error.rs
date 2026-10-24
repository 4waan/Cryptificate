//! Validation errors with stable codes and JSON pointer paths.

use std::fmt;

use serde::{Deserialize, Serialize};

/// A stable, machine-readable error code.
///
/// The JSON spelling (`as_str`) is part of the public interface; clients
/// match on it, so existing spellings never change.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    /// The document is not valid JSON.
    InvalidJson,
    /// A value has the wrong JSON type (e.g. a number where a string is expected).
    BadType,
    /// A required member is absent.
    MissingField,
    /// A member that the schema does not define is present.
    UnknownField,
    /// `model` names no supported design model.
    UnknownModel,
    /// `field` does not match the model, or a program's field differs from the design's.
    FieldMismatch,
    /// A GF(2^8) element is not two hex digits.
    InvalidByte,
    /// A BN254 element is not a canonical decimal string in `[0, p)`.
    ValueNotCanonical,
    /// The width is not supported for this model.
    UnsupportedWidth,
    /// A matrix, vector, table or list has the wrong length.
    BadDimension,
    /// A row offset is not in `0..width`.
    OffsetOutOfRange,
    /// A round count is outside the supported range.
    RoundsOutOfRange,
    /// The HADES full round count is odd.
    FullRoundsOdd,
    /// The power S-box exponent is outside `1..=65535`.
    ExponentOutOfRange,
    /// The S-box kind is unknown or not allowed for this model.
    BadSboxKind,
    /// The partial-round S-box mask selects no position.
    BadPartialMask,
    /// The constants kind is unknown.
    BadConstantsKind,
    /// Explicit round constants do not cover exactly every round.
    ConstantsLengthMismatch,
    /// A program has more than the maximum number of instructions.
    TooManyInstructions,
    /// An instruction operand or output references a register that does not exist yet.
    BadReference,
    /// An instruction's `op` is not `add` or `mul`.
    BadOp,
    /// The analysis target does not exist for this model.
    BadTarget,
    /// The experiment profile is unknown.
    BadProfile,
    /// The seed is not a hex string of acceptable length.
    BadSeed,
    /// The program name is too long or contains control characters.
    BadName,
}

impl ErrorCode {
    /// The stable JSON spelling, e.g. `"invalid_byte"`.
    pub const fn as_str(self) -> &'static str {
        use ErrorCode::*;
        match self {
            InvalidJson => "invalid_json",
            BadType => "bad_type",
            MissingField => "missing_field",
            UnknownField => "unknown_field",
            UnknownModel => "unknown_model",
            FieldMismatch => "field_mismatch",
            InvalidByte => "invalid_byte",
            ValueNotCanonical => "value_not_canonical",
            UnsupportedWidth => "unsupported_width",
            BadDimension => "bad_dimension",
            OffsetOutOfRange => "offset_out_of_range",
            RoundsOutOfRange => "rounds_out_of_range",
            FullRoundsOdd => "full_rounds_odd",
            ExponentOutOfRange => "exponent_out_of_range",
            BadSboxKind => "bad_sbox_kind",
            BadPartialMask => "bad_partial_mask",
            BadConstantsKind => "bad_constants_kind",
            ConstantsLengthMismatch => "constants_length_mismatch",
            TooManyInstructions => "too_many_instructions",
            BadReference => "bad_reference",
            BadOp => "bad_op",
            BadTarget => "bad_target",
            BadProfile => "bad_profile",
            BadSeed => "bad_seed",
            BadName => "bad_name",
        }
    }
}

impl fmt::Display for ErrorCode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// A rejected input: stable code, explanation, and the JSON pointer
/// (RFC 6901) of the offending value (`""` for the whole document).
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, thiserror::Error)]
#[error("{code} at {path:?}: {message}")]
pub struct ValidationError {
    pub code: ErrorCode,
    pub message: String,
    pub path: String,
}

impl ValidationError {
    pub fn new(code: ErrorCode, path: impl Into<String>, message: impl Into<String>) -> Self {
        ValidationError {
            code,
            message: message.into(),
            path: path.into(),
        }
    }

    /// The `{"error": {...}}` document the engine prints on exit code 2.
    pub fn to_envelope(&self) -> serde_json::Value {
        serde_json::json!({ "error": self })
    }
}

/// Appends one reference token to a JSON pointer, escaping `~` and `/`.
pub fn pointer_push(base: &str, token: impl fmt::Display) -> String {
    let token = token.to_string().replace('~', "~0").replace('/', "~1");
    format!("{base}/{token}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pointer_escapes_tokens() {
        assert_eq!(pointer_push("", "matrix"), "/matrix");
        assert_eq!(pointer_push("/matrix", 0), "/matrix/0");
        assert_eq!(pointer_push("", "a/b~c"), "/a~1b~0c");
    }

    #[test]
    fn envelope_shape() {
        let e = ValidationError::new(ErrorCode::InvalidByte, "/matrix/0/1", "bad");
        assert_eq!(
            e.to_envelope(),
            serde_json::json!({"error": {"code": "invalid_byte", "message": "bad", "path": "/matrix/0/1"}})
        );
    }
}
