//! Order statistics and the paired bootstrap.

use rand::{Rng, SeedableRng};
use rand_chacha::ChaCha20Rng;

/// The `q`-quantile (0 to 1) of `xs` with linear interpolation between
/// order statistics (the common "type 7" definition). `NaN` for no data.
pub fn quantile(xs: &[f64], q: f64) -> f64 {
    if xs.is_empty() {
        return f64::NAN;
    }
    let mut v = xs.to_vec();
    v.sort_by(f64::total_cmp);
    let pos = q.clamp(0.0, 1.0) * (v.len() - 1) as f64;
    let lo = pos.floor() as usize;
    let hi = pos.ceil() as usize;
    v[lo] + (v[hi] - v[lo]) * (pos - lo as f64)
}

/// The median.
pub fn median(xs: &[f64]) -> f64 {
    quantile(xs, 0.5)
}

/// The interquartile range `Q3 - Q1`.
pub fn iqr(xs: &[f64]) -> f64 {
    quantile(xs, 0.75) - quantile(xs, 0.25)
}

/// Speed-up of a candidate over a baseline from paired samples (time per
/// column in the same round): the median of the per-round ratios
/// `baseline / candidate`, so values above 1 mean the candidate is faster.
pub fn paired_ratio(baseline: &[f64], candidate: &[f64]) -> f64 {
    median(&ratios(baseline, candidate))
}

fn ratios(baseline: &[f64], candidate: &[f64]) -> Vec<f64> {
    assert_eq!(baseline.len(), candidate.len(), "paired samples");
    baseline.iter().zip(candidate).map(|(b, c)| b / c).collect()
}

/// 95% percentile bootstrap interval of [`paired_ratio`]: rounds are
/// resampled with replacement (keeping each pair together) `resamples`
/// times with a generator seeded by `seed`, and the 2.5% and 97.5%
/// quantiles of the resampled statistic are returned.
pub fn bootstrap_ci(baseline: &[f64], candidate: &[f64], resamples: usize, seed: u64) -> [f64; 2] {
    let r = ratios(baseline, candidate);
    if r.is_empty() || resamples == 0 {
        return [f64::NAN, f64::NAN];
    }
    let mut rng = ChaCha20Rng::seed_from_u64(seed);
    let mut stats = Vec::with_capacity(resamples);
    let mut sample = vec![0.0; r.len()];
    for _ in 0..resamples {
        for s in sample.iter_mut() {
            *s = r[rng.gen_range(0..r.len())];
        }
        stats.push(median(&sample));
    }
    [quantile(&stats, 0.025), quantile(&stats, 0.975)]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quantiles() {
        let xs = [5.0, 1.0, 3.0, 2.0, 4.0];
        assert_eq!(median(&xs), 3.0);
        assert_eq!(quantile(&xs, 0.25), 2.0);
        assert_eq!(iqr(&xs), 2.0);
        assert_eq!(median(&[1.0, 2.0]), 1.5);
        assert!(median(&[]).is_nan());
    }

    #[test]
    fn bootstrap_brackets_a_clear_speedup() {
        let base: Vec<f64> = (0..15).map(|i| 10.0 + (i % 3) as f64 * 0.1).collect();
        let cand: Vec<f64> = (0..15).map(|i| 8.0 + (i % 5) as f64 * 0.05).collect();
        let r = paired_ratio(&base, &cand);
        let [lo, hi] = bootstrap_ci(&base, &cand, 10_000, 42);
        assert!(lo <= r && r <= hi);
        assert!(lo > 1.2, "{lo}");
        // Same seed, same interval.
        assert_eq!(bootstrap_ci(&base, &cand, 10_000, 42), [lo, hi]);
        // No difference: the interval contains 1.
        let [lo, hi] = bootstrap_ci(&base, &base, 1000, 1);
        assert!(lo <= 1.0 && hi >= 1.0);
    }
}
