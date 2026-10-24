//! Native code generation, correctness checks and timing (cryptificate-native).
//!
//! * [`codegen`]: one standalone Rust `cdylib` crate per circuit, exporting
//!   `mix_batch(input, output, column_count)` built from
//!   `cryptificate-kernels` primitives.
//! * [`compile`]: builds every variant separately with the same release
//!   profile, in a workspace with a copy of the kernels crate and the
//!   repository's lockfile, sharing one cargo target directory.
//! * [`correctness`]: every variant against the independently computed
//!   matrix product, before any timing.
//! * [`bench`](mod@bench), [`stats`], [`protocol`]: calibrated, paired, seeded timing
//!   sessions, bootstrap intervals, confirmation sessions and the verdict.
//!
//! Entry points for the engine's subcommands: [`codegen_json`] (`codegen`)
//! and [`run_native_json`] (`native`). The `cryptificate-bench` binary runs
//! [`run_native_json`] on standard input.

pub mod bench;
pub mod codegen;
pub mod compile;
pub mod correctness;
pub mod machine;
pub mod protocol;
pub mod request;
pub mod stats;
pub mod variant;
pub mod word;

pub(crate) mod embedded {
    include!(concat!(env!("OUT_DIR"), "/embedded.rs"));
}

pub use bench::TimingSettings;
pub use compile::BuildOptions;
pub use protocol::{run_native, NativeOptions, NativeReport};
pub use request::{parse_codegen_request, parse_native_request, Mode, NativeRequest};

use cryptificate_core::{ErrorCode, ValidationError};
use serde_json::{json, Value};

/// Why a native run produced no report.
#[derive(Debug)]
pub enum NativeError {
    /// The input is invalid (engine exit code 2).
    Invalid(ValidationError),
    /// The run could not complete (work directory, toolchain).
    Failed(anyhow::Error),
}

impl std::error::Error for NativeError {}

impl std::fmt::Display for NativeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            NativeError::Invalid(e) => write!(f, "{e}"),
            NativeError::Failed(e) => write!(f, "{e:#}"),
        }
    }
}

impl NativeError {
    /// The `{"error": {...}}` document for this error. Failures use the code
    /// `"native_failed"`.
    pub fn to_envelope(&self) -> Value {
        match self {
            NativeError::Invalid(e) => e.to_envelope(),
            NativeError::Failed(e) => json!({
                "error": {"code": "native_failed", "message": format!("{e:#}"), "path": ""}
            }),
        }
    }
}

/// The `codegen` subcommand: validates
/// `{field, width, matrix?, programs: [{id, program, origin?}]}` and returns
/// the generated crates:
///
/// ```json
/// { "kind": "codegen", "version": "cryptificate-native codegen v1",
///   "field": "gf256", "width": 4,
///   "abi": {"symbol": "mix_batch", "signature": "...", "layout": "...",
///           "bytesPerColumn": 4, "alignment": 64},
///   "flags": ["opt-level=3", ...],
///   "workspace": {"manifest": "...", "kernelsSha256": "sha256:...", "lockSha256": "sha256:..."},
///   "variants": [{"id": "c1", "origin": "search", "program": {...},
///                 "package": "cfv-...", "libName": "cfv_...",
///                 "manifest": "...", "source": "...", "sourceSha256": "sha256:..."}] }
/// ```
pub fn codegen_json(input: &Value) -> Result<Value, ValidationError> {
    let req = parse_codegen_request(input)?;
    let variants: Vec<Value> = req
        .variants
        .iter()
        .map(|spec| {
            let v = codegen::generate_variant(&spec.id, &spec.program);
            json!({
                "id": spec.id,
                "origin": spec.origin,
                "program": spec.program,
                "package": v.package,
                "libName": v.lib_name,
                "manifest": v.manifest,
                "source": v.source,
                "sourceSha256": v.source_sha256,
            })
        })
        .collect();
    Ok(json!({
        "kind": "codegen",
        "version": codegen::CODEGEN_VERSION,
        "field": req.field,
        "width": req.width,
        "abi": protocol::Abi::new(req.field, req.width),
        "flags": codegen::flags(),
        "workspace": {
            "manifest": codegen::workspace_manifest(),
            "kernelsSha256": codegen::kernels_sha256(),
            "lockSha256": codegen::lock_sha256(),
        },
        "variants": variants,
    }))
}

/// The `native` subcommand: validates the request (see
/// [`parse_native_request`]), builds, checks and times the variants, and
/// returns the [`NativeReport`] as JSON.
pub fn run_native_json(input: &Value, opts: &NativeOptions) -> Result<Value, NativeError> {
    let req = parse_native_request(input).map_err(NativeError::Invalid)?;
    if let Err(msg) = protocol::generate_all(&req.variants) {
        return Err(NativeError::Invalid(ValidationError::new(
            ErrorCode::BadReference,
            "/codegen/variants",
            msg,
        )));
    }
    let report = run_native(&req, opts).map_err(NativeError::Failed)?;
    Ok(serde_json::to_value(&report).expect("report serializes"))
}
