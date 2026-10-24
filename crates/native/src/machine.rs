//! Description of the measuring machine.

use std::process::Command;

use cryptificate_core::report::Machine;

use crate::codegen::flags;
use crate::compile::rustc_version;

/// CPU model, operating system, RAM, `rustc -V` and the variant flags.
/// Missing information is recorded as `"unknown"` (or 0 MiB).
pub fn describe() -> Machine {
    Machine {
        cpu: cpu_model().unwrap_or_else(|| "unknown".into()),
        os: os_description(),
        ram_mib: ram_mib().unwrap_or(0),
        rustc: rustc_version(),
        flags: flags(),
    }
}

/// The first `model name` of `/proc/cpuinfo`.
pub fn cpu_model() -> Option<String> {
    let text = std::fs::read_to_string("/proc/cpuinfo").ok()?;
    text.lines()
        .find(|l| l.starts_with("model name"))
        .and_then(|l| l.split_once(':'))
        .map(|(_, v)| v.trim().to_string())
}

/// `uname -srm` (kernel name, release, machine; no host name), or the
/// compile-time OS and architecture.
pub fn os_description() -> String {
    Command::new("uname")
        .arg("-srm")
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| format!("{} {}", std::env::consts::OS, std::env::consts::ARCH))
}

/// `MemTotal` of `/proc/meminfo` in MiB.
pub fn ram_mib() -> Option<u64> {
    let text = std::fs::read_to_string("/proc/meminfo").ok()?;
    let kib: u64 = text
        .lines()
        .find(|l| l.starts_with("MemTotal:"))?
        .split_whitespace()
        .nth(1)?
        .parse()
        .ok()?;
    Some(kib / 1024)
}

/// The 1-minute load average from `/proc/loadavg`, recorded with each
/// session because other processes affect timings.
pub fn load_average() -> Option<f64> {
    std::fs::read_to_string("/proc/loadavg")
        .ok()?
        .split_whitespace()
        .next()?
        .parse()
        .ok()
}

/// Logical CPUs available to this process.
pub fn cpus() -> usize {
    std::thread::available_parallelism().map_or(1, |n| n.get())
}
