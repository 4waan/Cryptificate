//! `cryptificate-engine`: the Cryptificate engine as a command-line program.
//!
//! Every subcommand reads one JSON document on standard input and writes one
//! JSON document on standard output.
//!
//! * exit 0: success;
//! * exit 2: the input is invalid; stdout is `{"error":{"code","message","path"}}`
//!   with a stable code and the JSON pointer of the offending value;
//! * exit 1: the engine could not do its work (for example, no certificate
//!   templates were found); stdout carries the same envelope with `path` `""`;
//! * exit 64: the command line itself is wrong (message on stderr).

mod locate;

use std::io::{self, Read, Write};
use std::path::PathBuf;
use std::process::ExitCode;

use cryptificate_core::diagnostics::diagnose;
use cryptificate_core::lean::{emit, TemplateSet};
use cryptificate_core::{
    parse_json, validate_analysis_request, validate_experiment_request, ErrorCode, ValidationError,
};
use serde_json::{json, Value};

/// Largest accepted input document.
const MAX_INPUT_BYTES: usize = 16 * 1024 * 1024;

const USAGE: &str = "\
usage: cryptificate-engine [--lean-dir DIR] [--pretty] <subcommand> < input.json

Reads one JSON document on stdin and writes one JSON document on stdout.
Exit status: 0 success, 2 invalid input ({\"error\":{code,message,path}} on stdout),
1 engine failure, 64 usage error.

subcommands:
  validate    AnalysisRequest or ExperimentRequest -> {kind, request, inputDigest}
  diagnose    AnalysisRequest -> unchecked diagnostics (minors, witnesses, predictions)
  emit-lean   AnalysisRequest -> {source, expect, inputsEcho, fragments, skipped, inputDigest}

options:
  --lean-dir DIR   Lean package (or template) directory for emit-lean;
                   default: $CRYPTIFICATE_LEAN_DIR, else the first lean/templates
                   above the current directory or the executable
  --pretty         indent the output
  -h, --help       print this help
  -V, --version    print the version
";

/// A failed run, mapped to an exit status.
enum Failure {
    /// Exit 2.
    Invalid(ValidationError),
    /// Exit 1.
    Engine { code: &'static str, message: String },
}

impl From<ValidationError> for Failure {
    fn from(e: ValidationError) -> Self {
        Failure::Invalid(e)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Command {
    Validate,
    Diagnose,
    EmitLean,
}

impl Command {
    fn parse(s: &str) -> Option<Self> {
        Some(match s {
            "validate" => Command::Validate,
            "diagnose" => Command::Diagnose,
            "emit-lean" => Command::EmitLean,
            _ => return None,
        })
    }
}

struct Options {
    command: Command,
    lean_dir: Option<PathBuf>,
    pretty: bool,
}

enum Parsed {
    Run(Options),
    Help,
    Version,
}

fn parse_args(args: impl IntoIterator<Item = String>) -> Result<Parsed, String> {
    let mut command = None;
    let mut lean_dir = None;
    let mut pretty = false;
    let mut args = args.into_iter();
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "-h" | "--help" | "help" => return Ok(Parsed::Help),
            "-V" | "--version" => return Ok(Parsed::Version),
            "--pretty" => pretty = true,
            "--lean-dir" => {
                let dir = args.next().ok_or("--lean-dir needs a directory")?;
                lean_dir = Some(PathBuf::from(dir));
            }
            s if s.starts_with("--lean-dir=") => {
                lean_dir = Some(PathBuf::from(&s["--lean-dir=".len()..]));
            }
            s if s.starts_with('-') => return Err(format!("unknown option {s}")),
            s => {
                if command.is_some() {
                    return Err(format!("unexpected argument {s}"));
                }
                command = Some(Command::parse(s).ok_or_else(|| format!("unknown subcommand {s}"))?);
            }
        }
    }
    let command = command.ok_or("missing subcommand")?;
    Ok(Parsed::Run(Options {
        command,
        lean_dir,
        pretty,
    }))
}

fn read_input() -> Result<Value, Failure> {
    let mut buf = Vec::new();
    io::stdin()
        .take(MAX_INPUT_BYTES as u64 + 1)
        .read_to_end(&mut buf)
        .map_err(|e| Failure::Engine {
            code: "io_error",
            message: format!("cannot read standard input: {e}"),
        })?;
    if buf.len() > MAX_INPUT_BYTES {
        return Err(ValidationError::new(
            ErrorCode::InvalidJson,
            "",
            format!("input exceeds {MAX_INPUT_BYTES} bytes"),
        )
        .into());
    }
    let text = String::from_utf8(buf)
        .map_err(|_| ValidationError::new(ErrorCode::InvalidJson, "", "input is not UTF-8"))?;
    Ok(parse_json(&text)?)
}

/// `validate`: an experiment request has a `profile` (or `seed`) member;
/// anything else is read as an analysis request.
fn validate(input: &Value) -> Result<Value, Failure> {
    let is_experiment = input
        .as_object()
        .is_some_and(|o| o.contains_key("profile") || o.contains_key("seed"));
    Ok(if is_experiment {
        let req = validate_experiment_request(input)?;
        json!({"kind": "experiment", "inputDigest": req.input_digest(), "request": req})
    } else {
        let req = validate_analysis_request(input)?;
        json!({"kind": "analysis", "inputDigest": req.input_digest(), "request": req})
    })
}

fn run(opts: &Options, input: &Value) -> Result<Value, Failure> {
    match opts.command {
        Command::Validate => validate(input),
        Command::Diagnose => {
            let req = validate_analysis_request(input)?;
            Ok(serde_json::to_value(diagnose(&req)).expect("diagnostics serialize"))
        }
        Command::EmitLean => {
            let req = validate_analysis_request(input)?;
            let diag = diagnose(&req);
            let dir = locate::templates_dir(opts.lean_dir.as_deref()).map_err(|message| {
                Failure::Engine {
                    code: "templates_unavailable",
                    message,
                }
            })?;
            let set = TemplateSet::load(&dir).map_err(|e| Failure::Engine {
                code: "templates_unavailable",
                message: e.to_string(),
            })?;
            let emission = emit(&req, &diag, &set).map_err(|e| Failure::Engine {
                code: "emit_failed",
                message: e.to_string(),
            })?;
            Ok(serde_json::to_value(emission).expect("emissions serialize"))
        }
    }
}

fn write_json(v: &Value, pretty: bool) {
    let text = if pretty {
        serde_json::to_string_pretty(v)
    } else {
        serde_json::to_string(v)
    }
    .expect("JSON values serialize");
    let mut out = io::stdout().lock();
    // A closed stdout leaves nothing useful to report.
    let _ = writeln!(out, "{text}");
    let _ = out.flush();
}

fn main() -> ExitCode {
    let opts = match parse_args(std::env::args().skip(1)) {
        Ok(Parsed::Run(o)) => o,
        Ok(Parsed::Help) => {
            print!("{USAGE}");
            return ExitCode::SUCCESS;
        }
        Ok(Parsed::Version) => {
            println!("cryptificate-engine {}", env!("CARGO_PKG_VERSION"));
            return ExitCode::SUCCESS;
        }
        Err(message) => {
            eprintln!("cryptificate-engine: {message}\n\n{USAGE}");
            return ExitCode::from(64);
        }
    };
    let result = read_input().and_then(|input| run(&opts, &input));
    match result {
        Ok(v) => {
            write_json(&v, opts.pretty);
            ExitCode::SUCCESS
        }
        Err(Failure::Invalid(e)) => {
            write_json(&e.to_envelope(), opts.pretty);
            ExitCode::from(2)
        }
        Err(Failure::Engine { code, message }) => {
            eprintln!("cryptificate-engine: {message}");
            write_json(
                &json!({"error": {"code": code, "message": message, "path": ""}}),
                opts.pretty,
            );
            ExitCode::from(1)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(s: &str) -> Vec<String> {
        s.split_whitespace().map(String::from).collect()
    }

    #[test]
    fn argument_forms() {
        let Ok(Parsed::Run(o)) = parse_args(args("--lean-dir /x emit-lean --pretty")) else {
            panic!("expected a run")
        };
        assert_eq!(o.command, Command::EmitLean);
        assert_eq!(o.lean_dir, Some(PathBuf::from("/x")));
        assert!(o.pretty);
        let Ok(Parsed::Run(o)) = parse_args(args("diagnose --lean-dir=/y")) else {
            panic!("expected a run")
        };
        assert_eq!(o.lean_dir, Some(PathBuf::from("/y")));
        assert!(matches!(parse_args(args("--help")), Ok(Parsed::Help)));
        assert!(matches!(parse_args(args("-V")), Ok(Parsed::Version)));
        assert!(parse_args(args("")).is_err());
        assert!(parse_args(args("prove")).is_err());
        assert!(parse_args(args("validate diagnose")).is_err());
        assert!(parse_args(args("validate --lean-dir")).is_err());
        assert!(parse_args(args("validate --fast")).is_err());
    }
}
