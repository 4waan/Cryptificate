//! A whole native run: code generation, builds, correctness, timing
//! sessions and the verdict.
//!
//! Roles: `search` and `user` variants are contenders; `baseline-direct` and
//! `baseline-known` are references. A contender is compared with every
//! reference, and a search contender also with the user's circuit.
//!
//! In `protocol` mode the run has three sessions. Session 1 (exploration)
//! times every correct variant. The contender with the best worst-case
//! speed-up at the primary workload is then frozen (search contenders take
//! precedence over the user's circuit), and sessions 2 and 3
//! (confirmation) time it against its baselines with fresh input, order and
//! bootstrap seeds. The verdict is
//!
//! * `locally confirmed` when, in both confirmation sessions and against
//!   every baseline, the lower bound of the 95% interval at the primary
//!   workload exceeds the threshold (1.02);
//! * `no improvement` when there is no contender, or when in both
//!   confirmation sessions the frozen contender's ratio is at most 1 against
//!   some baseline;
//! * `inconclusive` otherwise, and always under quick-test settings.
//!
//! Comparisons on the other workloads whose whole interval lies below 1 are
//! listed as regressions whatever the verdict.

use std::path::PathBuf;

use anyhow::Result;
use cryptificate_core::canonical::{digest_of, sha256_hex};
use cryptificate_core::design::AnyMatrix;
use cryptificate_core::linalg::Matrix;
use cryptificate_core::report::{CandidateOrigin, Machine, Verdict};
use cryptificate_core::FieldKind;
use serde::Serialize;
use serde_json::json;

use crate::bench::{
    run_session, ComparisonRecord, SessionReport, SessionSeeds, TimingSettings, WorkloadRecord,
};
use crate::codegen::{self, generate_variant, VariantSource};
use crate::compile::{self, BuildOptions, BuiltVariant};
use crate::correctness::{check, corpus, seed_u64, CorrectnessRecord};
use crate::machine;
use crate::request::{is_reference, ExtraCases, Mode, NativeRequest, VariantSpec};
use crate::variant::{Variant, ALIGNMENT};
use crate::word::NativeWord;

/// Options of a native run.
#[derive(Clone, Debug)]
pub struct NativeOptions {
    pub build: BuildOptions,
    pub timing: TimingSettings,
}

impl NativeOptions {
    /// Protocol timing settings and build options rooted at `work_dir`.
    pub fn new(work_dir: impl Into<PathBuf>) -> Self {
        NativeOptions {
            build: BuildOptions::new(work_dir),
            timing: TimingSettings::protocol(),
        }
    }

    /// Options from the environment: `CRYPTIFICATE_NATIVE_WORK_DIR` (default
    /// `<tmp>/cryptificate-native/work`), `CRYPTIFICATE_NATIVE_TARGET_DIR`
    /// (see [`compile::default_target_dir`]) and `CRYPTIFICATE_NATIVE_JOBS`
    /// (default 2).
    pub fn from_env() -> Self {
        let work = std::env::var_os("CRYPTIFICATE_NATIVE_WORK_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                std::env::temp_dir()
                    .join("cryptificate-native")
                    .join("work")
            });
        let mut o = Self::new(work);
        if let Some(j) = std::env::var("CRYPTIFICATE_NATIVE_JOBS")
            .ok()
            .and_then(|s| s.parse().ok())
        {
            o.build.jobs = j;
        }
        o
    }

    /// Switches to quick-test timing settings.
    pub fn quick_test(mut self) -> Self {
        self.timing = TimingSettings::quick_test();
        self
    }
}

/// The calling convention and layout recorded with every run.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Abi {
    pub symbol: &'static str,
    pub signature: &'static str,
    pub layout: String,
    pub bytes_per_column: usize,
    pub alignment: usize,
}

impl Abi {
    /// The ABI for a field and width.
    pub fn new(field: FieldKind, width: usize) -> Self {
        Abi {
            symbol: codegen::SYMBOL,
            signature: codegen::SIGNATURE,
            layout: codegen::layout_description(field, width),
            bytes_per_column: codegen::column_bytes(field, width),
            alignment: ALIGNMENT,
        }
    }
}

/// How one variant was built.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildRecord {
    pub id: String,
    pub origin: CandidateOrigin,
    pub package: String,
    pub source_sha256: String,
    pub lib_sha256: Option<String>,
    pub build_ms: Option<u64>,
}

/// Toolchain and inputs of the builds.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildReport {
    pub codegen: &'static str,
    pub cargo: String,
    pub flags: Vec<String>,
    pub kernels_sha256: String,
    pub lock_sha256: String,
    pub variants: Vec<BuildRecord>,
}

/// Seeds of the run (16 hex digits, derived from `master`).
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeedReport {
    pub master: String,
    /// `"given"` or `"derived"`.
    pub source: &'static str,
    pub correctness: String,
}

/// Correctness of one variant with its origin.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct VariantCorrectness {
    #[serde(flatten)]
    pub record: CorrectnessRecord,
    pub origin: CandidateOrigin,
}

/// A variant left out of timing, and why.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Excluded {
    pub id: String,
    pub reason: String,
}

/// One row of the leaderboard (primary workload, first timed session).
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LeaderEntry {
    pub rank: usize,
    pub id: String,
    pub origin: CandidateOrigin,
    pub session: u32,
    pub bytes: usize,
    pub median_ns_per_column: f64,
    pub iqr: f64,
    pub mib_per_sec: f64,
}

/// The output document of a native run.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeReport {
    /// Always `"native"`.
    pub kind: &'static str,
    pub mode: Mode,
    pub field: FieldKind,
    pub width: usize,
    pub matrix: Vec<Vec<String>>,
    pub abi: Abi,
    pub protocol: TimingSettings,
    pub machine: Machine,
    pub cpus: usize,
    pub build: BuildReport,
    pub seeds: SeedReport,
    pub correctness: Vec<VariantCorrectness>,
    pub excluded: Vec<Excluded>,
    pub sessions: Vec<SessionReport>,
    /// All sessions' workload records.
    pub workloads: Vec<WorkloadRecord>,
    /// All sessions' comparisons.
    pub comparisons: Vec<ComparisonRecord>,
    pub leaderboard: Vec<LeaderEntry>,
    /// The contender timed in the confirmation sessions.
    pub frozen: Option<String>,
    pub regressions: Vec<ComparisonRecord>,
    /// Only in `protocol` mode.
    pub verdict: Option<Verdict>,
    pub verdict_note: String,
}

/// 16 hex digits of `sha256(master ":" label)`.
pub fn derive_seed(master: &str, label: &str) -> String {
    sha256_hex(format!("{master}:{label}").as_bytes())[..16].to_string()
}

fn session_seeds(master: &str, session: u32) -> SessionSeeds {
    SessionSeeds {
        input: derive_seed(master, &format!("session-{session}-input")),
        order: derive_seed(master, &format!("session-{session}-order")),
        bootstrap: derive_seed(master, &format!("session-{session}-bootstrap")),
    }
}

/// The default master seed: 16 hex digits of the digest of the field, the
/// matrix and the variants' ids and circuit identities.
pub fn default_seed(req: &NativeRequest) -> String {
    let variants: Vec<_> = req
        .variants
        .iter()
        .map(|v| json!({"id": v.id, "identity": v.program.identity_hash()}))
        .collect();
    let d = digest_of(&json!({
        "field": req.field,
        "matrix": cryptificate_search::input::encode_matrix(&req.matrix),
        "variants": variants,
    }));
    d["sha256:".len().."sha256:".len() + 16].to_string()
}

/// Generates the sources of every variant, checking recorded digests.
pub fn generate_all(variants: &[VariantSpec]) -> std::result::Result<Vec<VariantSource>, String> {
    variants
        .iter()
        .map(|spec| {
            let v = generate_variant(&spec.id, &spec.program);
            match &spec.source_sha256 {
                Some(d) if *d != v.source_sha256 => Err(format!(
                    "variant {}: recorded source digest {d} differs from the regenerated source {}",
                    spec.id, v.source_sha256
                )),
                _ => Ok(v),
            }
        })
        .collect()
}

struct Loaded {
    spec: VariantSpec,
    variant: Variant,
}

/// Runs the request. Build and load failures exclude the affected variant;
/// I/O failures of the work directory abort the run.
pub fn run_native(req: &NativeRequest, opts: &NativeOptions) -> Result<NativeReport> {
    let sources = generate_all(&req.variants).map_err(anyhow::Error::msg)?;
    let (master, source) = match &req.seed {
        Some(s) => (s.clone(), "given"),
        None => (default_seed(req), "derived"),
    };
    let correctness_seed = derive_seed(&master, "correctness");

    let packages: Vec<&str> = sources.iter().map(|v| v.package.as_str()).collect();
    compile::prepare_workspace(&opts.build.work_dir, &packages)?;
    let mut excluded = Vec::new();
    let mut builds = Vec::new();
    let mut loaded: Vec<Loaded> = Vec::new();
    for (spec, src) in req.variants.iter().zip(&sources) {
        let built: Result<BuiltVariant> = compile::build_variant(&opts.build, src);
        let mut record = BuildRecord {
            id: spec.id.clone(),
            origin: spec.origin,
            package: src.package.clone(),
            source_sha256: src.source_sha256.clone(),
            lib_sha256: None,
            build_ms: None,
        };
        match built {
            Ok(b) => {
                record.lib_sha256 = Some(b.lib_sha256.clone());
                record.build_ms = Some(b.build_ms);
                match Variant::load(&spec.id, &b.lib_path) {
                    Ok(variant) => loaded.push(Loaded {
                        spec: spec.clone(),
                        variant,
                    }),
                    Err(e) => excluded.push(Excluded {
                        id: spec.id.clone(),
                        reason: format!("could not be loaded: {e:#}"),
                    }),
                }
            }
            Err(e) => excluded.push(Excluded {
                id: spec.id.clone(),
                reason: format!("did not build: {e:#}"),
            }),
        }
        builds.push(record);
    }

    let mut report = NativeReport {
        kind: "native",
        mode: req.mode,
        field: req.field,
        width: req.width,
        matrix: cryptificate_search::input::encode_matrix(&req.matrix),
        abi: Abi::new(req.field, req.width),
        protocol: opts.timing.clone(),
        machine: machine::describe(),
        cpus: machine::cpus(),
        build: BuildReport {
            codegen: codegen::CODEGEN_VERSION,
            cargo: compile::cargo_version(&opts.build),
            flags: codegen::flags(),
            kernels_sha256: codegen::kernels_sha256(),
            lock_sha256: codegen::lock_sha256(),
            variants: builds,
        },
        seeds: SeedReport {
            master: master.clone(),
            source,
            correctness: correctness_seed.clone(),
        },
        correctness: Vec::new(),
        excluded,
        sessions: Vec::new(),
        workloads: Vec::new(),
        comparisons: Vec::new(),
        leaderboard: Vec::new(),
        frozen: None,
        regressions: Vec::new(),
        verdict: None,
        verdict_note: String::new(),
    };

    match (&req.matrix, &req.extra_cases) {
        (AnyMatrix::Gf256(m), ExtraCases::Gf256(extra)) => {
            measure(req, opts, m, extra, &correctness_seed, &loaded, &mut report)
        }
        (AnyMatrix::Bn254(m), ExtraCases::Bn254(extra)) => {
            measure(req, opts, m, extra, &correctness_seed, &loaded, &mut report)
        }
        _ => anyhow::bail!("extra cases and matrix are over different fields"),
    }
    Ok(report)
}

fn measure<F: NativeWord>(
    req: &NativeRequest,
    opts: &NativeOptions,
    matrix: &Matrix<F>,
    extra: &[Vec<F>],
    correctness_seed: &str,
    loaded: &[Loaded],
    report: &mut NativeReport,
) {
    let corpus = corpus(matrix, seed_u64(correctness_seed), extra);
    let mut correct: Vec<&Loaded> = Vec::new();
    for l in loaded {
        let record = check(&l.variant, &corpus);
        if record.passed {
            correct.push(l);
        } else {
            report.excluded.push(Excluded {
                id: l.spec.id.clone(),
                reason: format!(
                    "failed native correctness: {}",
                    record.detail.clone().unwrap_or_default()
                ),
            });
        }
        report.correctness.push(VariantCorrectness {
            record,
            origin: l.spec.origin,
        });
    }
    if req.mode == Mode::Correctness {
        report.verdict_note = "Correctness only; nothing was timed.".into();
        return;
    }
    let width = req.width;
    let settings = &opts.timing;
    let contenders: Vec<&Loaded> = correct
        .iter()
        .copied()
        .filter(|l| !is_reference(l.spec.origin))
        .collect();
    let references: Vec<&Loaded> = correct
        .iter()
        .copied()
        .filter(|l| is_reference(l.spec.origin))
        .collect();
    let user = correct
        .iter()
        .copied()
        .find(|l| l.spec.origin == CandidateOrigin::User);
    let baselines_of = |c: &Loaded| -> Vec<String> {
        let mut b: Vec<String> = references.iter().map(|r| r.spec.id.clone()).collect();
        if c.spec.origin == CandidateOrigin::Search {
            if let Some(u) = user {
                b.push(u.spec.id.clone());
            }
        }
        b
    };
    let pairs_of = |cs: &[&Loaded]| -> Vec<(String, String)> {
        cs.iter()
            .flat_map(|c| {
                baselines_of(c)
                    .into_iter()
                    .map(move |b| (c.spec.id.clone(), b))
            })
            .collect()
    };

    if correct.is_empty() {
        report.verdict_note = "No variant passed native correctness; nothing was timed.".into();
        if req.mode == Mode::Protocol {
            report.verdict = Some(Verdict::Inconclusive);
        }
        return;
    }

    let first_session = if req.mode == Mode::Benchmark {
        req.session
    } else {
        1
    };
    let purpose = if req.mode == Mode::Benchmark {
        "benchmark"
    } else {
        "exploration"
    };
    let all: Vec<&Variant> = correct.iter().map(|l| &l.variant).collect();
    let s1 = run_session::<F>(
        width,
        &all,
        &pairs_of(&contenders),
        first_session,
        purpose,
        &session_seeds(&report.seeds.master, first_session),
        settings,
    );
    report.leaderboard = leaderboard(&s1, &correct, settings.primary_bytes);
    report.sessions.push(s1);

    if req.mode == Mode::Benchmark {
        report.verdict_note =
            "A single benchmark session; a verdict needs the two confirmation sessions of protocol mode."
                .into();
        flatten(report);
        return;
    }

    // Freeze the contender with the best worst-case speed-up at the primary
    // workload, search circuits first.
    let primary_ratio = |id: &str, base: &str| -> Option<f64> {
        report.sessions[0]
            .comparisons
            .iter()
            .find(|c| c.primary && c.candidate == id && c.baseline == base)
            .map(|c| c.ratio)
    };
    let pool: Vec<&Loaded> = {
        let search: Vec<&Loaded> = contenders
            .iter()
            .copied()
            .filter(|l| l.spec.origin == CandidateOrigin::Search)
            .collect();
        if search.is_empty() {
            contenders.clone()
        } else {
            search
        }
    };
    let frozen = pool
        .iter()
        .filter(|c| !baselines_of(c).is_empty())
        .map(|c| {
            let worst = baselines_of(c)
                .iter()
                .filter_map(|b| primary_ratio(&c.spec.id, b))
                .fold(f64::INFINITY, f64::min);
            (*c, worst)
        })
        .max_by(|a, b| {
            a.1.total_cmp(&b.1)
                .then_with(|| b.0.spec.id.cmp(&a.0.spec.id))
        })
        .map(|(c, _)| c);
    let Some(frozen) = frozen else {
        let (verdict, note) = if contenders.is_empty() {
            (
                Verdict::NoImprovement,
                "No correct candidate circuit to compare with the baselines.",
            )
        } else {
            (
                Verdict::Inconclusive,
                "No correct baseline to compare the candidates with.",
            )
        };
        report.verdict = Some(if settings.quick_test {
            Verdict::Inconclusive
        } else {
            verdict
        });
        report.verdict_note = note.into();
        flatten(report);
        return;
    };
    report.frozen = Some(frozen.spec.id.clone());
    let baselines = baselines_of(frozen);
    let mut confirm_variants: Vec<&Variant> = vec![&frozen.variant];
    confirm_variants.extend(
        correct
            .iter()
            .filter(|l| baselines.contains(&l.spec.id))
            .map(|l| &l.variant),
    );
    let pairs: Vec<(String, String)> = baselines
        .iter()
        .map(|b| (frozen.spec.id.clone(), b.clone()))
        .collect();
    for session in [2u32, 3] {
        let s = run_session::<F>(
            width,
            &confirm_variants,
            &pairs,
            session,
            "confirmation",
            &session_seeds(&report.seeds.master, session),
            settings,
        );
        report.sessions.push(s);
    }
    let (verdict, note) = decide(&report.sessions[1..], &frozen.spec.id, &baselines, settings);
    report.verdict = Some(verdict);
    report.verdict_note = note;
    report.regressions = report
        .sessions
        .iter()
        .flat_map(|s| s.comparisons.iter())
        .filter(|c| c.candidate == frozen.spec.id && !c.primary && c.ci95[1] < 1.0)
        .cloned()
        .collect();
    flatten(report);
}

fn flatten(report: &mut NativeReport) {
    report.workloads = report
        .sessions
        .iter()
        .flat_map(|s| s.workloads.iter().cloned())
        .collect();
    report.comparisons = report
        .sessions
        .iter()
        .flat_map(|s| s.comparisons.iter().cloned())
        .collect();
}

fn leaderboard(s: &SessionReport, correct: &[&Loaded], primary: usize) -> Vec<LeaderEntry> {
    let mut rows: Vec<&WorkloadRecord> = s
        .workloads
        .iter()
        .filter(|w| w.requested_bytes == primary)
        .collect();
    rows.sort_by(|a, b| {
        a.median_ns_per_column
            .total_cmp(&b.median_ns_per_column)
            .then_with(|| a.candidate.cmp(&b.candidate))
    });
    rows.iter()
        .enumerate()
        .map(|(i, w)| LeaderEntry {
            rank: i + 1,
            id: w.candidate.clone(),
            origin: correct
                .iter()
                .find(|l| l.spec.id == w.candidate)
                .map_or(CandidateOrigin::Search, |l| l.spec.origin),
            session: w.session,
            bytes: w.bytes,
            median_ns_per_column: w.median_ns_per_column,
            iqr: w.iqr,
            mib_per_sec: w.mib_per_sec,
        })
        .collect()
}

/// The verdict from the confirmation sessions (see the module documentation).
pub fn decide(
    confirmations: &[SessionReport],
    frozen: &str,
    baselines: &[String],
    settings: &TimingSettings,
) -> (Verdict, String) {
    let primary = |s: &SessionReport, b: &str| -> Option<ComparisonRecord> {
        s.comparisons
            .iter()
            .find(|c| c.primary && c.candidate == frozen && c.baseline == b)
            .cloned()
    };
    let kib = settings.primary_bytes / 1024;
    if settings.quick_test {
        return (
            Verdict::Inconclusive,
            "Quick-test settings do not follow the measurement protocol, so no speed-up is claimed."
                .into(),
        );
    }
    let mut lowest = f64::INFINITY;
    let mut confirmed = !confirmations.is_empty();
    let mut slower_everywhere = !confirmations.is_empty();
    for s in confirmations {
        let mut slower_here = false;
        for b in baselines {
            match primary(s, b) {
                Some(c) => {
                    lowest = lowest.min(c.ci95[0]);
                    // A NaN bound never confirms.
                    if c.ci95[0].partial_cmp(&settings.threshold)
                        != Some(std::cmp::Ordering::Greater)
                    {
                        confirmed = false;
                    }
                    if c.ratio <= 1.0 {
                        slower_here = true;
                    }
                }
                None => confirmed = false,
            }
        }
        slower_everywhere &= slower_here;
    }
    if confirmed {
        (
            Verdict::LocallyConfirmed,
            format!(
                "{frozen} was faster than every baseline at {kib} KiB in both confirmation sessions; the lowest lower 95% bound was {lowest:.3} (threshold {}).",
                settings.threshold
            ),
        )
    } else if slower_everywhere {
        (
            Verdict::NoImprovement,
            format!(
                "{frozen} was not faster than every baseline at {kib} KiB in either confirmation session."
            ),
        )
    } else {
        (
            Verdict::Inconclusive,
            format!(
                "The 95% intervals of {frozen} at {kib} KiB did not clear {} against every baseline in both confirmation sessions.",
                settings.threshold
            ),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn session(n: u32, ratios: &[(&str, f64, [f64; 2])]) -> SessionReport {
        SessionReport {
            session: n,
            purpose: "confirmation".into(),
            variants: Vec::new(),
            seeds: session_seeds("00", n),
            load_before: None,
            load_after: None,
            orders: Vec::new(),
            workloads: Vec::new(),
            comparisons: ratios
                .iter()
                .map(|(b, r, ci)| ComparisonRecord {
                    candidate: "c1".into(),
                    baseline: b.to_string(),
                    bytes: 65536,
                    primary: true,
                    session: n,
                    ratio: *r,
                    ci95: *ci,
                    rounds: 15,
                })
                .collect(),
            checksums_agree: true,
        }
    }

    #[test]
    fn verdict_rules() {
        let p = TimingSettings::protocol();
        let b = vec!["baseline-direct".to_string(), "baseline-known".to_string()];
        let good = [
            ("baseline-direct", 1.3, [1.2, 1.4]),
            ("baseline-known", 1.1, [1.05, 1.15]),
        ];
        let (v, _) = decide(&[session(2, &good), session(3, &good)], "c1", &b, &p);
        assert_eq!(v, Verdict::LocallyConfirmed);
        let weak = [
            ("baseline-direct", 1.3, [1.2, 1.4]),
            ("baseline-known", 1.03, [1.01, 1.05]),
        ];
        let (v, _) = decide(&[session(2, &good), session(3, &weak)], "c1", &b, &p);
        assert_eq!(v, Verdict::Inconclusive);
        let slow = [
            ("baseline-direct", 1.3, [1.2, 1.4]),
            ("baseline-known", 0.97, [0.95, 0.99]),
        ];
        let (v, _) = decide(&[session(2, &slow), session(3, &slow)], "c1", &b, &p);
        assert_eq!(v, Verdict::NoImprovement);
        let (v, _) = decide(
            &[session(2, &good), session(3, &good)],
            "c1",
            &b,
            &TimingSettings::quick_test(),
        );
        assert_eq!(v, Verdict::Inconclusive);
        // A missing comparison never confirms.
        let (v, _) = decide(&[session(2, &good[..1]), session(3, &good)], "c1", &b, &p);
        assert_eq!(v, Verdict::Inconclusive);
    }

    #[test]
    fn seeds_are_derived_per_label() {
        let a = session_seeds("c0ffee", 2);
        let b = session_seeds("c0ffee", 3);
        assert_ne!(a.input, b.input);
        assert_ne!(a.input, a.order);
        assert_eq!(a, session_seeds("c0ffee", 2));
        assert_eq!(derive_seed("c0ffee", "correctness").len(), 16);
    }
}
