//! One timing session over correct variants.
//!
//! For every workload (4 KiB, 64 KiB, 1 MiB, rounded down to whole
//! columns): one input and one output buffer, separate and 64-byte aligned;
//! inputs drawn from the session's input seed; each variant's iteration
//! count calibrated so that one sample takes at least the minimum sample
//! time; then warmup rounds and measured rounds, each running every variant
//! once in an order drawn from the session's order seed. The output is
//! cleared before and checksummed after each sample, outside the timed
//! region. Statistics are per column; comparisons pair the samples of the
//! same round.

use std::hint::black_box;
use std::time::Instant;

use cryptificate_core::canonical::sha256_hex;
use rand::seq::SliceRandom;
use rand::SeedableRng;
use rand_chacha::ChaCha20Rng;
use serde::Serialize;

use crate::correctness::{random_column, seed_u64};
use crate::machine::load_average;
use crate::stats::{bootstrap_ci, iqr, median, paired_ratio};
use crate::variant::{AlignedBuf, MixBatch, Variant};
use crate::word::NativeWord;

/// Timing settings. [`TimingSettings::protocol`] is the measurement
/// protocol; [`TimingSettings::quick_test`] shrinks it for tests and CI and
/// never supports a verdict.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimingSettings {
    /// Requested workload sizes in bytes (rounded down to whole columns).
    pub workloads: Vec<usize>,
    /// The workload whose comparisons decide the verdict.
    pub primary_bytes: usize,
    pub min_sample_ns: u64,
    pub warmups: usize,
    pub rounds: usize,
    pub bootstrap_resamples: usize,
    /// A speed-up is confirmed when the lower 95% bound exceeds this in
    /// both confirmation sessions.
    pub threshold: f64,
    pub alignment: usize,
    pub quick_test: bool,
}

impl TimingSettings {
    /// 4 KiB, 64 KiB (primary), 1 MiB; samples of at least 50 ms; 3 warmups;
    /// 15 paired rounds; 10,000 bootstrap resamples; threshold 1.02.
    pub fn protocol() -> Self {
        TimingSettings {
            workloads: vec![4 << 10, 64 << 10, 1 << 20],
            primary_bytes: 64 << 10,
            min_sample_ns: 50_000_000,
            warmups: 3,
            rounds: 15,
            bootstrap_resamples: 10_000,
            threshold: 1.02,
            alignment: crate::variant::ALIGNMENT,
            quick_test: false,
        }
    }

    /// The protocol with 2 ms samples, 1 warmup, 5 rounds and 1,000
    /// resamples.
    pub fn quick_test() -> Self {
        TimingSettings {
            min_sample_ns: 2_000_000,
            warmups: 1,
            rounds: 5,
            bootstrap_resamples: 1_000,
            quick_test: true,
            ..Self::protocol()
        }
    }
}

/// Seeds of one session (16 hex digits each).
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct SessionSeeds {
    pub input: String,
    pub order: String,
    pub bootstrap: String,
}

/// Timings of one variant on one workload.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkloadRecord {
    /// The variant id.
    pub candidate: String,
    pub session: u32,
    pub requested_bytes: usize,
    /// Bytes actually processed per call (whole columns).
    pub bytes: usize,
    pub columns: usize,
    /// Calls per measured sample.
    pub iterations: u64,
    /// The sample that confirmed the calibration.
    pub calibration_ns: u64,
    pub warmup_ns: Vec<u64>,
    /// Raw samples: nanoseconds for `iterations` calls, in round order.
    pub samples: Vec<u64>,
    pub ns_per_column: Vec<f64>,
    pub median_ns_per_column: f64,
    /// Interquartile range of `ns_per_column`.
    pub iqr: f64,
    /// Input MiB per second at the median.
    pub mib_per_sec: f64,
    pub min_sample_ns: u64,
    /// Samples shorter than the protocol's minimum sample time.
    pub samples_below_minimum: usize,
    /// Whether the call count was raised after the warmups.
    pub recalibrated: bool,
    /// `"sha256:<hex>"` of the canonical output of the last sample.
    pub checksum: String,
    /// Whether every sample left the same output.
    pub samples_consistent: bool,
}

/// Paired speed-up of `candidate` over `baseline` on one workload.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComparisonRecord {
    pub candidate: String,
    pub baseline: String,
    pub bytes: usize,
    pub primary: bool,
    pub session: u32,
    /// Median over rounds of baseline time / candidate time (above 1: the
    /// candidate is faster).
    pub ratio: f64,
    /// 95% paired bootstrap interval of `ratio`.
    pub ci95: [f64; 2],
    pub rounds: usize,
}

/// Run order of one workload: warmup rounds then measured rounds.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct WorkloadOrder {
    pub bytes: usize,
    pub warmups: Vec<Vec<String>>,
    pub rounds: Vec<Vec<String>>,
}

/// Results of one session.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionReport {
    pub session: u32,
    /// `"exploration"`, `"confirmation"` or `"benchmark"`.
    pub purpose: String,
    pub variants: Vec<String>,
    pub seeds: SessionSeeds,
    /// 1-minute load average before and after the session.
    pub load_before: Option<f64>,
    pub load_after: Option<f64>,
    pub orders: Vec<WorkloadOrder>,
    pub workloads: Vec<WorkloadRecord>,
    pub comparisons: Vec<ComparisonRecord>,
    /// Whether all variants produced the same output on every workload.
    pub checksums_agree: bool,
}

fn sixteen_hex(text: &str) -> u64 {
    seed_u64(&sha256_hex(text.as_bytes())[..16])
}

fn time_calls(f: MixBatch, input: *const u8, output: *mut u8, columns: usize, iters: u64) -> u64 {
    let start = Instant::now();
    for _ in 0..iters {
        // SAFETY: the caller checked that both buffers hold `columns` columns.
        unsafe { f(black_box(input), black_box(output), black_box(columns)) };
    }
    u64::try_from(start.elapsed().as_nanos()).unwrap_or(u64::MAX)
}

/// Calibration aims this far above the minimum sample time, so that samples
/// stay above it when the machine gets faster after calibration (other
/// processes finish, caches warm up). Samples that still fall below it are
/// counted in [`WorkloadRecord::samples_below_minimum`].
const CALIBRATION_MARGIN: f64 = 2.0;

/// The call count scaled so that a sample of `t` ns becomes `target` ns.
fn scaled(n: u64, t: u64, target: f64) -> u64 {
    let factor = if t == 0 {
        100.0
    } else {
        (target / t as f64).min(100.0)
    };
    ((n as f64 * factor).ceil() as u64).max(n.saturating_add(1))
}

/// Grows the call count (doubling or extrapolating, at most 100x per step)
/// until one sample takes at least `min_ns`, then confirms with a second
/// sample at [`CALIBRATION_MARGIN`] times that. Returns the count and the
/// confirming sample.
fn calibrate(
    f: MixBatch,
    input: *const u8,
    output: *mut u8,
    columns: usize,
    min_ns: u64,
) -> (u64, u64) {
    let target = min_ns as f64 * CALIBRATION_MARGIN;
    let mut n = 1u64;
    loop {
        let t = time_calls(f, input, output, columns, n);
        if t >= min_ns {
            n = scaled(n, t, target).max(n);
            break;
        }
        n = scaled(n, t, target).max(n.saturating_mul(2));
    }
    loop {
        let t = time_calls(f, input, output, columns, n);
        if t as f64 >= min_ns as f64 * 1.5 {
            return (n, t);
        }
        n = scaled(n, t, target);
    }
}

fn fold(bytes: &[u8]) -> u64 {
    bytes.chunks(8).fold(0xcbf2_9ce4_8422_2325u64, |h, c| {
        let mut w = [0u8; 8];
        w[..c.len()].copy_from_slice(c);
        (h ^ u64::from_le_bytes(w)).wrapping_mul(0x0000_0100_0000_01B3)
    })
}

/// Runs one session. `pairs` lists the (candidate, baseline) comparisons.
pub fn run_session<F: NativeWord>(
    width: usize,
    variants: &[&Variant],
    pairs: &[(String, String)],
    session: u32,
    purpose: &str,
    seeds: &SessionSeeds,
    settings: &TimingSettings,
) -> SessionReport {
    let load_before = load_average();
    let col = width * F::WORD_BYTES;
    let mut order_rng = ChaCha20Rng::seed_from_u64(seed_u64(&seeds.order));
    let mut orders = Vec::new();
    let mut workloads = Vec::new();
    let mut comparisons = Vec::new();
    let mut checksums_agree = true;

    for &requested in &settings.workloads {
        let columns = (requested / col).max(1);
        let bytes = columns * col;
        let mut input = AlignedBuf::zeroed(bytes);
        let mut rng =
            ChaCha20Rng::seed_from_u64(sixteen_hex(&format!("{}:{requested}", seeds.input)));
        for c in 0..columns {
            let x = random_column::<F, _>(width, &mut rng);
            F::store(&x, &mut input.as_mut_slice()[c * col..(c + 1) * col]);
        }
        let mut output = AlignedBuf::zeroed(bytes);
        assert!(input.len() >= bytes && output.len() >= bytes);
        let (inp, out) = (input.as_ptr(), output.as_mut_ptr());

        let mut calib: Vec<(u64, u64)> = variants
            .iter()
            .map(|v| calibrate(v.raw(), inp, out, columns, settings.min_sample_ns))
            .collect();
        let mut recalibrated = vec![false; variants.len()];
        let k = variants.len();
        let mut warm: Vec<Vec<u64>> = vec![Vec::new(); k];
        let mut samples: Vec<Vec<u64>> = vec![Vec::new(); k];
        let mut folds: Vec<Option<u64>> = vec![None; k];
        let mut consistent = vec![true; k];
        let mut last_output: Vec<Vec<u8>> = vec![Vec::new(); k];
        let mut order = WorkloadOrder {
            bytes,
            warmups: Vec::new(),
            rounds: Vec::new(),
        };
        for round in 0..settings.warmups + settings.rounds {
            let mut idx: Vec<usize> = (0..k).collect();
            idx.shuffle(&mut order_rng);
            let ids = idx.iter().map(|&i| variants[i].id.clone()).collect();
            if round < settings.warmups {
                order.warmups.push(ids);
            } else {
                order.rounds.push(ids);
            }
            if round == settings.warmups {
                // Raise call counts whose warmup samples fell close to the
                // minimum sample time.
                for i in 0..k {
                    let low = warm[i].iter().copied().min().unwrap_or(u64::MAX);
                    if (low as f64) < settings.min_sample_ns as f64 * 1.25 {
                        let target = settings.min_sample_ns as f64 * CALIBRATION_MARGIN;
                        calib[i].0 = scaled(calib[i].0, low, target);
                        recalibrated[i] = true;
                    }
                }
            }
            for &i in &idx {
                output.as_mut_slice().fill(0);
                let ns = time_calls(
                    variants[i].raw(),
                    inp,
                    output.as_mut_ptr(),
                    columns,
                    calib[i].0,
                );
                let h = fold(output.as_slice());
                match folds[i] {
                    None => folds[i] = Some(h),
                    Some(prev) if prev != h => consistent[i] = false,
                    Some(_) => {}
                }
                if round < settings.warmups {
                    warm[i].push(ns);
                } else {
                    samples[i].push(ns);
                    if round + 1 == settings.warmups + settings.rounds {
                        let vals = F::load(output.as_slice());
                        let mut canon = Vec::with_capacity(bytes);
                        F::canonical_bytes(&vals, &mut canon);
                        last_output[i] = canon;
                    }
                }
            }
        }
        orders.push(order);

        let per_col: Vec<Vec<f64>> = (0..k)
            .map(|i| {
                samples[i]
                    .iter()
                    .map(|&ns| ns as f64 / (calib[i].0 as f64 * columns as f64))
                    .collect()
            })
            .collect();
        let checksums: Vec<String> = last_output
            .iter()
            .map(|o| format!("sha256:{}", sha256_hex(o)))
            .collect();
        if checksums.windows(2).any(|w| w[0] != w[1]) {
            checksums_agree = false;
        }
        for i in 0..k {
            let med = median(&per_col[i]);
            workloads.push(WorkloadRecord {
                candidate: variants[i].id.clone(),
                session,
                requested_bytes: requested,
                bytes,
                columns,
                iterations: calib[i].0,
                calibration_ns: calib[i].1,
                warmup_ns: warm[i].clone(),
                samples: samples[i].clone(),
                ns_per_column: per_col[i].clone(),
                median_ns_per_column: med,
                iqr: iqr(&per_col[i]),
                mib_per_sec: (col as f64 / med) * 1e9 / (1024.0 * 1024.0),
                min_sample_ns: samples[i].iter().copied().min().unwrap_or(0),
                samples_below_minimum: samples[i]
                    .iter()
                    .filter(|&&ns| ns < settings.min_sample_ns)
                    .count(),
                recalibrated: recalibrated[i],
                checksum: checksums[i].clone(),
                samples_consistent: consistent[i],
            });
        }
        for (cand, base) in pairs {
            let (Some(c), Some(b)) = (
                variants.iter().position(|v| &v.id == cand),
                variants.iter().position(|v| &v.id == base),
            ) else {
                continue;
            };
            let seed = sixteen_hex(&format!("{}:{cand}:{base}:{bytes}", seeds.bootstrap));
            comparisons.push(ComparisonRecord {
                candidate: cand.clone(),
                baseline: base.clone(),
                bytes,
                primary: requested == settings.primary_bytes,
                session,
                ratio: paired_ratio(&per_col[b], &per_col[c]),
                ci95: bootstrap_ci(&per_col[b], &per_col[c], settings.bootstrap_resamples, seed),
                rounds: settings.rounds,
            });
        }
    }

    SessionReport {
        session,
        purpose: purpose.to_string(),
        variants: variants.iter().map(|v| v.id.clone()).collect(),
        seeds: seeds.clone(),
        load_before,
        load_after: load_average(),
        orders,
        workloads,
        comparisons,
        checksums_agree,
    }
}
