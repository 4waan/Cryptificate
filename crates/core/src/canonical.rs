//! Canonical JSON and digests.
//!
//! Canonical JSON is compact (no insignificant whitespace), with object keys
//! sorted by their UTF-8 bytes at every level. Strings use serde_json's
//! escaping (`"`, `\` and control characters escaped; other characters kept
//! as UTF-8). Numbers are written as serde_json writes them; normalized
//! inputs contain integers only, and field elements are already canonical
//! strings. The output does not depend on serde_json's `preserve_order`
//! feature.

use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};

/// Canonical JSON text of any serializable value.
///
/// Panics only if `value`'s `Serialize` implementation fails, which does not
/// happen for the types in this crate.
pub fn to_canonical_json<T: Serialize + ?Sized>(value: &T) -> String {
    let v = serde_json::to_value(value).expect("value serializes to JSON");
    canonical_string(&v)
}

/// Canonical JSON text of a JSON value.
pub fn canonical_string(v: &Value) -> String {
    let mut out = String::new();
    write_value(v, &mut out);
    out
}

fn write_value(v: &Value, out: &mut String) {
    match v {
        Value::Null => out.push_str("null"),
        Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Value::Number(n) => out.push_str(&n.to_string()),
        Value::String(s) => write_string(s, out),
        Value::Array(items) => {
            out.push('[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_value(item, out);
            }
            out.push(']');
        }
        Value::Object(map) => {
            let mut entries: Vec<(&String, &Value)> = map.iter().collect();
            entries.sort_by(|a, b| a.0.as_bytes().cmp(b.0.as_bytes()));
            out.push('{');
            for (i, (k, val)) in entries.into_iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_string(k, out);
                out.push(':');
                write_value(val, out);
            }
            out.push('}');
        }
    }
}

fn write_string(s: &str, out: &mut String) {
    out.push_str(&serde_json::to_string(s).expect("strings serialize"));
}

/// Lowercase hex SHA-256 of `bytes`.
pub fn sha256_hex(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

/// `"sha256:<hex>"` of the canonical JSON of `value`.
pub fn digest_of<T: Serialize + ?Sized>(value: &T) -> String {
    format!("sha256:{}", sha256_hex(to_canonical_json(value).as_bytes()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn keys_sorted_and_compact() {
        let v = json!({"b": 1, "a": {"z": [1, "x"], "y": null}, "A": true});
        assert_eq!(
            canonical_string(&v),
            r#"{"A":true,"a":{"y":null,"z":[1,"x"]},"b":1}"#
        );
    }

    #[test]
    fn strings_escaped() {
        let v = json!({"k": "a\"b\\c\n\u{1}é"});
        assert_eq!(canonical_string(&v), "{\"k\":\"a\\\"b\\\\c\\n\\u0001é\"}");
    }

    #[test]
    fn digest_format() {
        let d = digest_of(&json!({}));
        assert_eq!(
            d,
            "sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a"
        );
    }
}
