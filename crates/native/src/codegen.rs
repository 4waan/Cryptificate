//! Rust source generation for native variants.
//!
//! Every program becomes a standalone `cdylib` crate that exports
//!
//! ```c
//! void mix_batch(const uint8_t *input, uint8_t *output, size_t column_count);
//! ```
//!
//! and computes `y = M x` for `column_count` columns. One program instruction
//! becomes one call into `cryptificate-kernels` (GF(2^8): `add`, `xtime` for
//! the constant `02`, `mul` otherwise; BN254: the `Fr` operators), so two
//! variants differ only in their circuits.
//!
//! Column layout:
//!
//! * GF(2^8): `width` bytes per column; byte `r` of a column is row `r`.
//! * BN254: `width` field elements per column (96 bytes for width 3), each the
//!   in-memory representation of arkworks' `Fr` (four little-endian `u64`
//!   limbs in Montgomery form, 32 bytes). Both buffers must be aligned for
//!   `Fr` (8 bytes; the harness uses 64). The harness and the variants are
//!   built against the same pinned arkworks version, so they agree on this
//!   representation.
//!
//! `input` and `output` must not overlap.

use cryptificate_core::canonical::sha256_hex;
use cryptificate_core::{AnyProgram, Bn254, Field, FieldKind, Gf256, Instruction, Program};
use cryptificate_kernels::bn254::PrimeField;
use std::fmt::Write as _;

use crate::embedded;

/// Version tag written into every generated source.
pub const CODEGEN_VERSION: &str = "cryptificate-native codegen v1";

/// The exported symbol.
pub const SYMBOL: &str = "mix_batch";

/// The C signature of [`SYMBOL`].
pub const SIGNATURE: &str =
    "void mix_batch(const uint8_t *input, uint8_t *output, size_t column_count)";

/// Bytes of one column word: 1 for GF(2^8), 32 (`Fr`) for BN254.
pub const fn word_bytes(field: FieldKind) -> usize {
    match field {
        FieldKind::Gf256 => 1,
        FieldKind::Bn254 => 32,
    }
}

/// Bytes of one column of the given field and width.
pub const fn column_bytes(field: FieldKind, width: usize) -> usize {
    word_bytes(field) * width
}

/// Human-readable layout description recorded with generated code.
pub fn layout_description(field: FieldKind, width: usize) -> String {
    match field {
        FieldKind::Gf256 => format!(
            "{width} bytes per column in row order (byte r is row r), GF(2^8) with polynomial 0x11B"
        ),
        FieldKind::Bn254 => format!(
            "{width} BN254 Fr values per column ({} bytes), each in arkworks' in-memory form: four little-endian u64 limbs in Montgomery form; buffers aligned to at least 8 bytes",
            column_bytes(field, width)
        ),
    }
}

/// The release profile shared by every variant (written into the build
/// workspace manifest).
pub const PROFILE: &str = "[profile.release]
opt-level = 3
codegen-units = 1
lto = false
panic = \"abort\"
debug = false
debug-assertions = false
overflow-checks = false
incremental = false
";

/// Compiler settings recorded with measurements.
pub fn flags() -> Vec<String> {
    [
        "opt-level=3",
        "codegen-units=1",
        "lto=false",
        "panic=abort",
        "debug=false",
        "overflow-checks=false",
        "incremental=false",
        "target-cpu=default",
        "rustflags=none",
    ]
    .iter()
    .map(|s| s.to_string())
    .collect()
}

/// One generated variant crate.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct VariantSource {
    pub id: String,
    /// Cargo package name, `cfv-<16 hex>` from the source digest.
    pub package: String,
    /// Library name, `cfv_<16 hex>`.
    pub lib_name: String,
    /// `Cargo.toml` of the variant crate.
    pub manifest: String,
    /// `lib.rs` of the variant crate.
    pub source: String,
    /// `"sha256:<hex>"` of `source`.
    pub source_sha256: String,
}

/// Generates the crate for program `program` under the variant id `id`.
/// The program must pass `check_at`.
pub fn generate_variant(id: &str, program: &AnyProgram) -> VariantSource {
    let source = match program {
        AnyProgram::Gf256(p) => gf256_source(id, p, &program.identity_hash()),
        AnyProgram::Bn254(p) => bn254_source(id, p, &program.identity_hash()),
    };
    let digest = sha256_hex(source.as_bytes());
    let package = format!("cfv-{}", &digest[..16]);
    let lib_name = package.replace('-', "_");
    let manifest = format!(
        "[package]
name = \"{package}\"
version = \"0.0.0\"
edition = \"2021\"
publish = false

[lib]
crate-type = [\"cdylib\"]
path = \"lib.rs\"

[dependencies]
cryptificate-kernels = {{ path = \"../../kernels\" }}
"
    );
    VariantSource {
        id: id.to_string(),
        package,
        lib_name,
        manifest,
        source,
        source_sha256: format!("sha256:{digest}"),
    }
}

fn header<F: Field>(out: &mut String, id: &str, p: &Program<F>, identity: &str) {
    let ops = p.op_counts();
    let field = match F::KIND {
        FieldKind::Gf256 => "GF(2^8)",
        FieldKind::Bn254 => "BN254 Fr",
    };
    let _ = writeln!(out, "//! Native variant `{id}` ({CODEGEN_VERSION}).");
    let _ = writeln!(out, "//!");
    let _ = writeln!(out, "//! Program identity: {identity}");
    let _ = writeln!(
        out,
        "//! Field: {field}, width {}; {} additions, {} multiplications.",
        p.width, ops.add, ops.mul
    );
    let _ = writeln!(out, "//!");
    let _ = writeln!(
        out,
        "//! `{SYMBOL}(input, output, column_count)` computes `y = M x` for each of"
    );
    let _ = writeln!(
        out,
        "//! `column_count` columns: {}.",
        layout_description(F::KIND, p.width)
    );
    let _ = writeln!(out, "//! `input` and `output` must not overlap.");
    out.push('\n');
    out.push_str("#![allow(unused_imports, unused_variables)]\n\n");
}

fn body<F: Field>(
    out: &mut String,
    p: &Program<F>,
    word: &str,
    expr: impl Fn(&Instruction<F>) -> String,
) {
    let w = p.width;
    let _ = writeln!(out, "const WIDTH: usize = {w};\n");
    let _ = writeln!(out, "#[no_mangle]");
    let _ = writeln!(
        out,
        "pub extern \"C\" fn {SYMBOL}(input: *const u8, output: *mut u8, column_count: usize) {{"
    );
    out.push_str(
        "    let Some(len) = column_count.checked_mul(WIDTH) else {
        return;
    };
    if len == 0 || input.is_null() || output.is_null() {
        return;
    }
",
    );
    let _ = writeln!(
        out,
        "    // SAFETY: the caller passes `column_count` columns in each buffer, aligned
    // for `{word}`, and the buffers do not overlap.
    let (src, dst) = unsafe {{
        (
            core::slice::from_raw_parts(input.cast::<{word}>(), len),
            core::slice::from_raw_parts_mut(output.cast::<{word}>(), len),
        )
    }};
    for (x, y) in src.chunks_exact(WIDTH).zip(dst.chunks_exact_mut(WIDTH)) {{"
    );
    for j in 0..w {
        let _ = writeln!(out, "        let r{j} = x[{j}];");
    }
    for (i, ins) in p.instructions.iter().enumerate() {
        let _ = writeln!(out, "        let r{} = {};", w + i, expr(ins));
    }
    for (j, r) in p.outputs.iter().enumerate() {
        let _ = writeln!(out, "        y[{j}] = r{r};");
    }
    out.push_str("    }\n}\n");
}

fn gf256_source(id: &str, p: &Program<Gf256>, identity: &str) -> String {
    let mut out = String::new();
    header(&mut out, id, p, identity);
    out.push_str("use cryptificate_kernels::gf256::{add, mul, xtime};\n\n");
    body(&mut out, p, "u8", |ins| match *ins {
        Instruction::Add { a, b } => format!("add(r{a}, r{b})"),
        Instruction::Mul { k: Gf256(0x02), a } => format!("xtime(r{a})"),
        Instruction::Mul { k, a } => format!("mul(0x{:02X}, r{a})", k.0),
    });
    out
}

fn bn254_source(id: &str, p: &Program<Bn254>, identity: &str) -> String {
    let mut out = String::new();
    header(&mut out, id, p, identity);
    out.push_str("use cryptificate_kernels::bn254::{Fr, PrimeField};\n\n");
    // Distinct constants, in order of first use, as compile-time `Fr` values
    // built from their canonical limbs (`Fr::new` converts to Montgomery form).
    let mut constants: Vec<Bn254> = Vec::new();
    for ins in &p.instructions {
        if let Instruction::Mul { k, .. } = *ins {
            if !constants.contains(&k) {
                constants.push(k);
            }
        }
    }
    for (i, k) in constants.iter().enumerate() {
        let limbs = k.0.into_bigint().0;
        let _ = writeln!(out, "/// {}", k.encode());
        let _ = writeln!(
            out,
            "const K{i}: Fr = Fr::new(<<Fr as PrimeField>::BigInt>::new([0x{:016x}, 0x{:016x}, 0x{:016x}, 0x{:016x}]));",
            limbs[0], limbs[1], limbs[2], limbs[3]
        );
    }
    if !constants.is_empty() {
        out.push('\n');
    }
    body(&mut out, p, "Fr", |ins| match *ins {
        Instruction::Add { a, b } => format!("r{a} + r{b}"),
        Instruction::Mul { k, a } => {
            let i = constants.iter().position(|c| *c == k).expect("collected");
            format!("K{i} * r{a}")
        }
    });
    out
}

/// The build workspace manifest: the kernels crate and the given variant
/// packages (under `variants/`) as members, the repository's shared package
/// metadata, and [`PROFILE`]. Variant crates of earlier runs that are still
/// on disk are not members, so they never affect a build.
pub fn workspace_manifest<S: AsRef<str>>(packages: &[S]) -> String {
    let mut members = String::from("\"kernels\"");
    for p in packages {
        let _ = write!(members, ", \"variants/{}\"", p.as_ref());
    }
    let mut out = format!(
        "# Build workspace for Cryptificate native variants.\n\
         [workspace]\nresolver = \"2\"\nmembers = [{members}]\n\n"
    );
    for section in ["workspace.package", "workspace.dependencies"] {
        if let Some(text) = toml_section(embedded::WORKSPACE_MANIFEST, section) {
            out.push_str(&text);
            out.push('\n');
        }
    }
    out.push_str(PROFILE);
    out
}

/// The text of `[name]` (header included) up to the next table header.
fn toml_section(manifest: &str, name: &str) -> Option<String> {
    let header = format!("[{name}]");
    let mut lines = manifest.lines().skip_while(|l| l.trim() != header);
    let first = lines.next()?;
    let mut out = format!("{first}\n");
    for line in lines {
        if line.trim_start().starts_with('[') {
            break;
        }
        out.push_str(line);
        out.push('\n');
    }
    Some(out.trim_end().to_string() + "\n")
}

/// `"sha256:<hex>"` over the embedded kernels crate (paths and contents).
pub fn kernels_sha256() -> String {
    let mut all = String::new();
    for (path, text) in embedded::KERNEL_FILES {
        let _ = write!(all, "{path}\0{}\0", sha256_hex(text.as_bytes()));
    }
    format!("sha256:{}", sha256_hex(all.as_bytes()))
}

/// `"sha256:<hex>"` of the embedded lockfile that pins dependency versions.
pub fn lock_sha256() -> String {
    format!("sha256:{}", sha256_hex(embedded::WORKSPACE_LOCK.as_bytes()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use cryptificate_search::baseline::{aes_shared_sum, bn254_shared_sum};

    #[test]
    fn gf256_source_maps_instructions_to_kernel_calls() {
        let v = generate_variant("baseline-known", &aes_shared_sum().into());
        assert!(v.source.contains(
            "pub extern \"C\" fn mix_batch(input: *const u8, output: *mut u8, column_count: usize)"
        ));
        assert!(v.source.contains("let r4 = add(r0, r1);"));
        assert!(v.source.contains("let r8 = xtime(r7);"));
        assert!(v.source.contains("y[0] = r10;"));
        assert!(v.source.contains("#[no_mangle]"));
        assert!(v.package.starts_with("cfv-") && v.package.len() == 20);
        assert_eq!(v.lib_name, v.package.replace('-', "_"));
        assert!(v.manifest.contains("crate-type = [\"cdylib\"]"));
        // Same input, same source; the id is part of the source.
        assert_eq!(
            v,
            generate_variant("baseline-known", &aes_shared_sum().into())
        );
        assert_ne!(
            v.source_sha256,
            generate_variant("x", &aes_shared_sum().into()).source_sha256
        );
    }

    #[test]
    fn general_constants_and_bn254_limbs() {
        let mut p = aes_shared_sum();
        p.instructions[4] = Instruction::Mul {
            k: Gf256(0x03),
            a: 7,
        };
        let v = generate_variant("c1", &p.into());
        assert!(v.source.contains("mul(0x03, r7)"));
        let mut q = bn254_shared_sum();
        q.instructions.push(Instruction::Mul {
            k: -Bn254::one(),
            a: 5,
        });
        q.outputs[0] = 8;
        let v = generate_variant("c2", &q.into());
        assert!(v.source.contains("const K0: Fr = Fr::new("));
        assert!(v.source.contains(
            "/// 21888242871839275222246405745257275088548364400416034343698204186575808495616"
        ));
        assert!(v.source.contains("0x43e1f593f0000000"));
        assert!(v.source.contains("let r8 = K0 * r5;"));
        assert!(v.source.contains("let r3 = r0 + r1;"));
    }

    #[test]
    fn workspace_manifest_has_profile_and_package_metadata() {
        let m = workspace_manifest(&["cfv-00", "cfv-01"]);
        assert!(m.contains("members = [\"kernels\", \"variants/cfv-00\", \"variants/cfv-01\"]"));
        assert!(m.contains("[workspace.package]"));
        assert!(m.contains("codegen-units = 1"));
        assert!(m.contains("panic = \"abort\""));
        assert!(embedded::KERNEL_FILES
            .iter()
            .any(|(p, _)| *p == "Cargo.toml"));
        assert!(embedded::KERNEL_FILES
            .iter()
            .any(|(p, _)| *p == "src/lib.rs"));
        assert!(kernels_sha256().starts_with("sha256:"));
        assert_eq!(
            toml_section("[a]\nx = 1\n\n[b]\ny = 2\n", "a").as_deref(),
            Some("[a]\nx = 1\n")
        );
    }
}
