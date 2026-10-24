//! `cryptificate-bench`: builds, checks and times native variants in one
//! process.
//!
//! Reads a native request (see `cryptificate_native::parse_native_request`)
//! on standard input and writes the report on standard output. Exit codes:
//! 0 on success, 2 for invalid input, 1 when the run could not complete; in
//! both error cases standard output holds `{"error": {...}}`.
//!
//! ```text
//! cryptificate-bench [--quick-test] [--work-dir DIR] [--target-dir DIR] [--jobs N] [--offline]
//! ```
//!
//! `--quick-test` shrinks the timing settings for tests and CI (2 ms
//! samples, 1 warmup, 5 rounds, 1,000 resamples); its verdict is never
//! "locally confirmed".

use std::io::Read;
use std::path::PathBuf;
use std::process::ExitCode;

use cryptificate_native::{run_native_json, NativeError, NativeOptions};

const USAGE: &str = "usage: cryptificate-bench [--quick-test] [--work-dir DIR] [--target-dir DIR] [--jobs N] [--offline] < request.json";

fn main() -> ExitCode {
    let mut opts = NativeOptions::from_env();
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        let mut value = |name: &str| {
            args.next().unwrap_or_else(|| {
                eprintln!("{name} needs a value\n{USAGE}");
                std::process::exit(64);
            })
        };
        match arg.as_str() {
            "--quick-test" => opts = opts.quick_test(),
            "--work-dir" => opts.build.work_dir = PathBuf::from(value("--work-dir")),
            "--target-dir" => opts.build.target_dir = PathBuf::from(value("--target-dir")),
            "--jobs" => match value("--jobs").parse() {
                Ok(n) => opts.build.jobs = n,
                Err(_) => {
                    eprintln!("--jobs needs a number\n{USAGE}");
                    return ExitCode::from(64);
                }
            },
            "--offline" => opts.build.offline = true,
            "-h" | "--help" => {
                println!("{USAGE}");
                return ExitCode::SUCCESS;
            }
            other => {
                eprintln!("unknown argument {other:?}\n{USAGE}");
                return ExitCode::from(64);
            }
        }
    }
    let mut text = String::new();
    if let Err(e) = std::io::stdin().read_to_string(&mut text) {
        eprintln!("cannot read standard input: {e}");
        return ExitCode::from(1);
    }
    let result = cryptificate_core::parse_json(&text)
        .map_err(NativeError::Invalid)
        .and_then(|v| run_native_json(&v, &opts));
    match result {
        Ok(report) => {
            println!("{report}");
            ExitCode::SUCCESS
        }
        Err(e) => {
            println!("{}", e.to_envelope());
            ExitCode::from(match e {
                NativeError::Invalid(_) => 2,
                NativeError::Failed(_) => 1,
            })
        }
    }
}
