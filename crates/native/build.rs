//! Embeds the sources needed to build native variants without the
//! repository: the cryptificate-kernels crate, the workspace's shared
//! package metadata and the lockfile that pins dependency versions.

use std::env;
use std::fs;
use std::path::{Path, PathBuf};

fn collect(root: &Path, dir: &Path, out: &mut Vec<String>) {
    let mut entries: Vec<_> = fs::read_dir(dir)
        .unwrap_or_else(|e| panic!("cannot read {}: {e}", dir.display()))
        .map(|e| e.expect("directory entry").path())
        .collect();
    entries.sort();
    for path in entries {
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if name.starts_with('.') || name == "target" {
            continue;
        }
        if path.is_dir() {
            collect(root, &path, out);
        } else {
            let rel = path.strip_prefix(root).expect("inside root");
            out.push(rel.to_str().expect("UTF-8 path").replace('\\', "/"));
        }
    }
}

fn main() {
    let manifest = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("manifest dir"));
    let kernels = manifest
        .join("../kernels")
        .canonicalize()
        .expect("crates/kernels exists");
    let workspace = manifest
        .join("../..")
        .canonicalize()
        .expect("workspace root");

    let mut files = vec!["Cargo.toml".to_string()];
    for sub in ["src", "build.rs"] {
        let p = kernels.join(sub);
        if p.is_dir() {
            collect(&kernels, &p, &mut files);
        } else if p.is_file() {
            files.push(sub.to_string());
        }
    }

    let mut code = String::from(
        "/// Files of the cryptificate-kernels crate: (path relative to the crate, contents).\n\
         pub const KERNEL_FILES: &[(&str, &str)] = &[\n",
    );
    for rel in &files {
        code.push_str(&format!(
            "    ({rel:?}, include_str!({:?})),\n",
            kernels.join(rel)
        ));
    }
    code.push_str("];\n");
    code.push_str(&format!(
        "/// The repository's workspace manifest.\npub const WORKSPACE_MANIFEST: &str = include_str!({:?});\n",
        workspace.join("Cargo.toml")
    ));
    code.push_str(&format!(
        "/// The repository's lockfile.\npub const WORKSPACE_LOCK: &str = include_str!({:?});\n",
        workspace.join("Cargo.lock")
    ));
    let out = PathBuf::from(env::var("OUT_DIR").expect("out dir")).join("embedded.rs");
    fs::write(out, code).expect("write embedded.rs");

    println!("cargo:rerun-if-changed={}", kernels.display());
    println!(
        "cargo:rerun-if-changed={}",
        workspace.join("Cargo.toml").display()
    );
    println!(
        "cargo:rerun-if-changed={}",
        workspace.join("Cargo.lock").display()
    );
    println!("cargo:rerun-if-changed=build.rs");
}
