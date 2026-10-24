//! Finding the Lean package directory that holds the certificate templates.
//!
//! In order of precedence:
//!
//! 1. `--lean-dir DIR`;
//! 2. the `CRYPTIFICATE_LEAN_DIR` environment variable;
//! 3. the first `lean/templates` found walking up from the current directory;
//! 4. the first `lean/templates` found walking up from the executable's directory
//!    (a cargo build in the repository finds the repository's own `lean/`).
//!
//! An explicitly given directory may be the Lean package (containing
//! `templates/`) or the template directory itself.

use std::path::{Path, PathBuf};

/// Environment variable naming the Lean package directory.
pub const LEAN_DIR_ENV: &str = "CRYPTIFICATE_LEAN_DIR";

/// The template directory inside an explicitly given directory.
fn templates_in(dir: &Path) -> Option<PathBuf> {
    let nested = dir.join("templates");
    if nested.is_dir() {
        return Some(nested);
    }
    dir.join("header.lean").is_file().then(|| dir.to_path_buf())
}

/// The first `<ancestor>/lean/templates` above `start` (inclusive).
fn search_upwards(start: &Path) -> Option<PathBuf> {
    start.ancestors().find_map(|a| {
        let candidate = a.join("lean").join("templates");
        candidate.is_dir().then_some(candidate)
    })
}

/// Resolves the template directory, or explains where it looked.
pub fn templates_dir(flag: Option<&Path>) -> Result<PathBuf, String> {
    if let Some(dir) = flag {
        return templates_in(dir)
            .ok_or_else(|| format!("--lean-dir {} has no templates directory", dir.display()));
    }
    if let Some(dir) = std::env::var_os(LEAN_DIR_ENV).filter(|v| !v.is_empty()) {
        let dir = PathBuf::from(dir);
        return templates_in(&dir).ok_or_else(|| {
            format!(
                "{LEAN_DIR_ENV}={} has no templates directory",
                dir.display()
            )
        });
    }
    let from_cwd = std::env::current_dir()
        .ok()
        .and_then(|d| search_upwards(&d));
    let from_exe = || {
        std::env::current_exe()
            .ok()
            .and_then(|e| e.parent().and_then(search_upwards))
    };
    from_cwd.or_else(from_exe).ok_or_else(|| {
        format!(
            "no lean/templates directory found above the current directory or the \
                 executable; pass --lean-dir or set {LEAN_DIR_ENV}"
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn explicit_directory_forms() {
        let base = std::env::temp_dir().join(format!("cryptificate-locate-{}", std::process::id()));
        let templates = base.join("lean").join("templates");
        std::fs::create_dir_all(&templates).unwrap();
        std::fs::write(templates.join("header.lean"), "import Cryptificate\n").unwrap();
        let lean = base.join("lean");
        assert_eq!(templates_in(&lean), Some(templates.clone()));
        assert_eq!(templates_in(&templates), Some(templates.clone()));
        assert_eq!(templates_in(&base), None);
        let deep = base.join("a").join("b");
        std::fs::create_dir_all(&deep).unwrap();
        assert_eq!(search_upwards(&deep), Some(templates.clone()));
        std::fs::remove_dir_all(&base).unwrap();
    }
}
