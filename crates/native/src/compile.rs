//! Building variant crates with cargo.
//!
//! All variants of a run live in one build workspace (`<work>/Cargo.toml`)
//! next to a copy of `cryptificate-kernels` and a copy of the repository's
//! lockfile, so every variant uses the same kernels and the same pinned
//! dependency versions. Each variant is still compiled on its own
//! (`cargo build -p <variant>`), with the same release profile and no
//! `RUSTFLAGS`. A shared `CARGO_TARGET_DIR` lets dependencies be reused
//! across variants and runs. The built library is copied into
//! `<work>/lib/` and loaded from there.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Instant;

use anyhow::{bail, Context, Result};
use cryptificate_core::canonical::sha256_hex;

use crate::codegen::{workspace_manifest, VariantSource};
use crate::embedded;

/// Where and how variants are built.
#[derive(Clone, Debug)]
pub struct BuildOptions {
    /// Build workspace and copied libraries.
    pub work_dir: PathBuf,
    /// Cargo target directory, shared across runs for dependency reuse.
    pub target_dir: PathBuf,
    /// Parallel jobs for cargo (`-j`).
    pub jobs: usize,
    /// The cargo executable.
    pub cargo: PathBuf,
    /// Pass `--offline` to cargo.
    pub offline: bool,
}

impl BuildOptions {
    /// Options with a work directory and the defaults for the rest: target
    /// directory from `CRYPTIFICATE_NATIVE_TARGET_DIR` or
    /// `<tmp>/cryptificate-native/target`, two jobs, cargo from `CARGO` or
    /// `PATH`.
    pub fn new(work_dir: impl Into<PathBuf>) -> Self {
        BuildOptions {
            work_dir: work_dir.into(),
            target_dir: default_target_dir(),
            jobs: 2,
            cargo: cargo_executable(),
            offline: false,
        }
    }
}

/// The default shared target directory.
pub fn default_target_dir() -> PathBuf {
    std::env::var_os("CRYPTIFICATE_NATIVE_TARGET_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            std::env::temp_dir()
                .join("cryptificate-native")
                .join("target")
        })
}

/// The cargo executable: `$CARGO` (set when running under cargo) or `cargo`.
pub fn cargo_executable() -> PathBuf {
    std::env::var_os("CARGO")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("cargo"))
}

/// A compiled variant.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BuiltVariant {
    pub id: String,
    pub package: String,
    /// The copied library that the harness loads.
    pub lib_path: PathBuf,
    /// `"sha256:<hex>"` of the library.
    pub lib_sha256: String,
    pub source_sha256: String,
    /// Wall-clock build time in milliseconds (includes dependencies on a
    /// cold target directory).
    pub build_ms: u64,
}

/// Writes `contents` to `path` unless it already holds exactly that, so
/// unchanged files keep their timestamps and cargo does not rebuild them.
fn write_if_changed(path: &Path, contents: &str) -> Result<()> {
    if fs::read_to_string(path).ok().as_deref() == Some(contents) {
        return Ok(());
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).with_context(|| format!("creating {}", parent.display()))?;
    }
    fs::write(path, contents).with_context(|| format!("writing {}", path.display()))
}

/// Creates or refreshes the build workspace: manifest, lockfile (only when
/// absent, since cargo trims it), and the kernels crate.
pub fn prepare_workspace(work_dir: &Path) -> Result<()> {
    write_if_changed(&work_dir.join("Cargo.toml"), &workspace_manifest())?;
    let lock = work_dir.join("Cargo.lock");
    if !lock.exists() {
        write_if_changed(&lock, embedded::WORKSPACE_LOCK)?;
    }
    for (rel, text) in embedded::KERNEL_FILES {
        write_if_changed(&work_dir.join("kernels").join(rel), text)?;
    }
    fs::create_dir_all(work_dir.join("variants"))?;
    Ok(())
}

/// Writes the variant crate into the workspace.
pub fn write_variant(work_dir: &Path, v: &VariantSource) -> Result<PathBuf> {
    let dir = work_dir.join("variants").join(&v.package);
    write_if_changed(&dir.join("Cargo.toml"), &v.manifest)?;
    write_if_changed(&dir.join("lib.rs"), &v.source)?;
    Ok(dir)
}

/// A cargo command with a clean environment: no inherited `RUSTFLAGS`,
/// profile or build overrides, incremental compilation off.
fn cargo_command(opts: &BuildOptions) -> Command {
    let mut cmd = Command::new(&opts.cargo);
    for (key, _) in std::env::vars_os() {
        let Some(k) = key.to_str() else { continue };
        let strip = matches!(
            k,
            "RUSTFLAGS" | "CARGO_ENCODED_RUSTFLAGS" | "RUSTC_WRAPPER" | "RUSTC_WORKSPACE_WRAPPER"
        ) || k.starts_with("CARGO_PROFILE_")
            || k.starts_with("CARGO_BUILD_")
            || (k.starts_with("CARGO_TARGET_") && k != "CARGO_TARGET_DIR");
        if strip {
            cmd.env_remove(k);
        }
    }
    cmd.env("CARGO_TARGET_DIR", &opts.target_dir)
        .env("CARGO_INCREMENTAL", "0");
    cmd
}

/// Compiles one variant (writing it into the workspace first) and copies the
/// library into `<work>/lib/`.
pub fn build_variant(opts: &BuildOptions, v: &VariantSource) -> Result<BuiltVariant> {
    let start = Instant::now();
    write_variant(&opts.work_dir, v)?;
    let mut cmd = cargo_command(opts);
    cmd.arg("build")
        .arg("--release")
        .arg("--quiet")
        .arg("--manifest-path")
        .arg(opts.work_dir.join("Cargo.toml"))
        .arg("-p")
        .arg(&v.package)
        .arg("-j")
        .arg(opts.jobs.max(1).to_string());
    if opts.offline {
        cmd.arg("--offline");
    }
    let out = cmd
        .output()
        .with_context(|| format!("running {}", opts.cargo.display()))?;
    if !out.status.success() {
        bail!(
            "building variant {} failed: {}",
            v.id,
            String::from_utf8_lossy(&out.stderr).trim()
        );
    }
    let file = format!(
        "{}{}{}",
        std::env::consts::DLL_PREFIX,
        v.lib_name,
        std::env::consts::DLL_SUFFIX
    );
    let built = opts.target_dir.join("release").join(&file);
    let lib_dir = opts.work_dir.join("lib");
    fs::create_dir_all(&lib_dir)?;
    let lib_path = lib_dir.join(&file);
    let bytes = fs::read(&built).with_context(|| format!("reading {}", built.display()))?;
    // Replace rather than overwrite, so a library mapped by an earlier run
    // is never modified in place.
    let tmp = lib_dir.join(format!("{file}.tmp"));
    fs::write(&tmp, &bytes)?;
    fs::rename(&tmp, &lib_path)?;
    Ok(BuiltVariant {
        id: v.id.clone(),
        package: v.package.clone(),
        lib_sha256: format!("sha256:{}", sha256_hex(&bytes)),
        source_sha256: v.source_sha256.clone(),
        lib_path,
        build_ms: u64::try_from(start.elapsed().as_millis()).unwrap_or(u64::MAX),
    })
}

/// Output of `<cargo> -V` run with the build environment, or `"unknown"`.
pub fn cargo_version(opts: &BuildOptions) -> String {
    let mut cmd = cargo_command(opts);
    cmd.arg("-V");
    command_line(cmd)
}

/// Output of `rustc -V` (or `$RUSTC -V`), or `"unknown"`.
pub fn rustc_version() -> String {
    let rustc = std::env::var_os("RUSTC").unwrap_or_else(|| "rustc".into());
    let mut cmd = Command::new(rustc);
    cmd.arg("-V");
    command_line(cmd)
}

fn command_line(mut cmd: Command) -> String {
    cmd.output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "unknown".into())
}
