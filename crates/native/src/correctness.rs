//! Correctness of compiled variants before any timing.
//!
//! Every variant is run on a recorded corpus and compared with the matrix
//! product computed independently in Rust (`cryptificate_core::linalg::mat_vec`
//! on the design matrix, not on the program):
//!
//! * `basis`: every vector with at most one nonzero word. Over GF(2^8) that
//!   is the zero vector and all 255 multiples of each unit vector
//!   (1 + 255 w = 1,021 for width 4). Over BN254 it is the zero vector and
//!   each unit vector scaled by edge values (1, 2, -1, -2, 1/2, -1/2, 2^64,
//!   2^128, 2^192, 2^253, 2^254, 2^256 - 1 reduced) and 16 seeded random
//!   values.
//! * `multiword`: 8,192 distinct seeded vectors with at least two nonzero words.
//! * `extra`: the guided wiring witness `[0, 1, 0, ...]` and any cases given
//!   by the caller.
//!
//! The whole corpus is evaluated in one batch call, then the first 1,021
//! cases again in batches of 1, 3 and 7 columns, and once with
//! `column_count = 0`. Writes past the requested columns are detected with
//! guard bytes. A variant passes only if every check passes.

use std::collections::HashSet;

use cryptificate_core::canonical::sha256_hex;
use cryptificate_core::linalg::{encode_vec, mat_vec, Matrix};
use cryptificate_core::report::Witness;
use rand::{Rng, SeedableRng};
use rand_chacha::ChaCha20Rng;
use serde::Serialize;

use crate::variant::{AlignedBuf, Variant};
use crate::word::NativeWord;

/// Number of seeded vectors with several nonzero words.
pub const MULTIWORD_CASES: usize = 8192;
/// Seeded random scalars per unit vector over BN254.
pub const RANDOM_UNIT_SCALARS: usize = 16;
/// Cases rerun in small batches.
const CHUNKED_CASES: usize = 1021;
/// Batch sizes of the rerun.
const CHUNK_SIZES: [usize; 3] = [1, 3, 7];
/// Guard bytes after the output columns.
const GUARD: usize = 64;
const GUARD_BYTE: u8 = 0xA5;

/// Case counts by category.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaseCounts {
    pub basis: usize,
    pub multiword: usize,
    pub extra: usize,
    pub total: usize,
}

/// Inputs and independently computed expected outputs.
pub struct Corpus<F> {
    pub width: usize,
    pub inputs: Vec<Vec<F>>,
    pub expected: Vec<Vec<F>>,
    pub counts: CaseCounts,
}

/// The guided wiring witness: `x_1 = 1`, every other word zero.
pub fn guided_witness<F: NativeWord>(width: usize) -> Vec<F> {
    (0..width)
        .map(|j| if j == 1 { F::one() } else { F::zero() })
        .collect()
}

/// Builds the corpus for `matrix` from `seed`, with `extra` cases appended
/// after the guided witness.
pub fn corpus<F: NativeWord>(matrix: &Matrix<F>, seed: u64, extra: &[Vec<F>]) -> Corpus<F> {
    let w = matrix.len();
    let mut rng = ChaCha20Rng::seed_from_u64(seed);
    let mut inputs: Vec<Vec<F>> = Vec::new();
    let mut seen: HashSet<Vec<F>> = HashSet::new();
    let mut push = |v: Vec<F>, inputs: &mut Vec<Vec<F>>| {
        if seen.insert(v.clone()) {
            inputs.push(v);
        }
    };
    push(vec![F::zero(); w], &mut inputs);
    let scalars = F::unit_scalars(&mut rng, RANDOM_UNIT_SCALARS);
    for j in 0..w {
        for &s in &scalars {
            let mut v = vec![F::zero(); w];
            v[j] = s;
            push(v, &mut inputs);
        }
    }
    let basis = inputs.len();
    while inputs.len() < basis + MULTIWORD_CASES {
        let v: Vec<F> = (0..w).map(|_| F::random(&mut rng)).collect();
        if v.iter().filter(|x| !x.is_zero()).count() >= 2 {
            push(v, &mut inputs);
        }
    }
    let mut all = inputs;
    all.push(guided_witness(w));
    all.extend(extra.iter().cloned());
    let expected = all.iter().map(|x| mat_vec(matrix, x)).collect();
    let counts = CaseCounts {
        basis,
        multiword: MULTIWORD_CASES,
        extra: 1 + extra.len(),
        total: all.len(),
    };
    Corpus {
        width: w,
        inputs: all,
        expected,
        counts,
    }
}

/// The correctness result of one variant.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CorrectnessRecord {
    pub id: String,
    /// Input vectors checked.
    pub cases: u64,
    pub counts: CaseCounts,
    /// Calls to `mix_batch`.
    pub calls: u64,
    pub passed: bool,
    /// Cases with a wrong output in any batch shape.
    pub failures: u64,
    /// `"sha256:<hex>"` of the canonical encoding of all outputs of the
    /// full batch, in case order.
    pub checksum: String,
    /// The first failing case.
    pub witness: Option<Witness>,
    pub detail: Option<String>,
}

/// Runs every check of the module documentation on `variant`.
pub fn check<F: NativeWord>(variant: &Variant, corpus: &Corpus<F>) -> CorrectnessRecord {
    let w = corpus.width;
    let col = w * F::WORD_BYTES;
    let n = corpus.inputs.len();
    let mut input = AlignedBuf::zeroed(n * col);
    for (i, x) in corpus.inputs.iter().enumerate() {
        F::store(x, &mut input.as_mut_slice()[i * col..(i + 1) * col]);
    }
    let mut output = AlignedBuf::zeroed(n * col + GUARD);
    let mut calls = 0u64;
    let mut details: Vec<String> = Vec::new();
    let mut failed: HashSet<usize> = HashSet::new();
    let mut witness = None;

    // Full batch.
    output.as_mut_slice().fill(GUARD_BYTE);
    variant.call(&input, &mut output, col, n);
    calls += 1;
    if output.as_slice()[n * col..]
        .iter()
        .any(|&b| b != GUARD_BYTE)
    {
        details.push("wrote past the end of the output columns".into());
    }
    let mut canonical = Vec::with_capacity(n * col);
    for (i, (x, want)) in corpus.inputs.iter().zip(&corpus.expected).enumerate() {
        let got = F::load(&output.as_slice()[i * col..(i + 1) * col]);
        F::canonical_bytes(&got, &mut canonical);
        if &got != want {
            failed.insert(i);
            if witness.is_none() {
                witness = Some(distinguishing(x, want, &got));
            }
        }
    }
    let checksum = format!("sha256:{}", sha256_hex(&canonical));

    // Empty batch: nothing may be written.
    output.as_mut_slice().fill(GUARD_BYTE);
    variant.call(&input, &mut output, col, 0);
    calls += 1;
    if output.as_slice().iter().any(|&b| b != GUARD_BYTE) {
        details.push("wrote output for column_count = 0".into());
    }

    // Small batches over the first cases.
    let m = n.min(CHUNKED_CASES);
    for size in CHUNK_SIZES {
        output.as_mut_slice().fill(GUARD_BYTE);
        let mut start = 0;
        while start < m {
            let len = size.min(m - start);
            variant.call_at(&input, &mut output, col, start, len);
            calls += 1;
            start += len;
        }
        if output.as_slice()[m * col..]
            .iter()
            .any(|&b| b != GUARD_BYTE)
        {
            details.push(format!(
                "batches of {size} wrote past the requested columns"
            ));
        }
        for i in 0..m {
            let got = F::load(&output.as_slice()[i * col..(i + 1) * col]);
            if got != corpus.expected[i] && failed.insert(i) && witness.is_none() {
                witness = Some(distinguishing(&corpus.inputs[i], &corpus.expected[i], &got));
                details.push(format!("batches of {size} differ from the full batch"));
            }
        }
    }

    if !failed.is_empty() {
        details.insert(
            0,
            format!("{} of {n} cases gave a wrong output", failed.len()),
        );
    }
    let passed = details.is_empty();
    CorrectnessRecord {
        id: variant.id.clone(),
        cases: n as u64,
        counts: corpus.counts,
        calls,
        passed,
        failures: failed.len() as u64,
        checksum,
        witness,
        detail: (!passed).then(|| details.join("; ")),
    }
}

fn distinguishing<F: NativeWord>(x: &[F], want: &[F], got: &[F]) -> Witness {
    Witness::DistinguishingInput {
        input: encode_vec(x),
        expected: encode_vec(want),
        actual: encode_vec(got),
        differing: want
            .iter()
            .zip(got)
            .enumerate()
            .filter(|(_, (a, b))| a != b)
            .map(|(i, _)| i)
            .collect(),
    }
}

/// A seed for the corpus generator from 16 hex digits.
pub fn seed_u64(hex16: &str) -> u64 {
    u64::from_str_radix(&hex16[..hex16.len().min(16)], 16).unwrap_or(0)
}

/// Draws a random column (for tests and workload inputs).
pub fn random_column<F: NativeWord, R: Rng>(width: usize, rng: &mut R) -> Vec<F> {
    (0..width).map(|_| F::random(rng)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use cryptificate_core::linalg::aes_mixcolumns;
    use cryptificate_core::{Bn254, Field, Gf256};
    use cryptificate_search::baseline::poseidon2_external3;

    #[test]
    fn gf256_corpus_has_the_documented_counts() {
        let c = corpus::<Gf256>(&aes_mixcolumns(), 7, &[]);
        assert_eq!(c.counts.basis, 1021);
        assert_eq!(c.counts.multiword, 8192);
        assert_eq!(c.counts.extra, 1);
        assert_eq!(c.counts.total, 9214);
        assert_eq!(c.inputs.len(), 9214);
        let distinct: HashSet<_> = c.inputs[..9213].iter().collect();
        assert_eq!(distinct.len(), 9213);
        // The guided witness and its expected output (story 2).
        assert_eq!(c.inputs[9213], vec![Gf256(0), Gf256(1), Gf256(0), Gf256(0)]);
        assert_eq!(
            c.expected[9213],
            vec![Gf256(3), Gf256(2), Gf256(1), Gf256(1)]
        );
        // Deterministic in the seed.
        assert_eq!(corpus::<Gf256>(&aes_mixcolumns(), 7, &[]).inputs, c.inputs);
        assert_ne!(corpus::<Gf256>(&aes_mixcolumns(), 8, &[]).inputs, c.inputs);
    }

    #[test]
    fn bn254_corpus_counts() {
        let c = corpus::<Bn254>(&poseidon2_external3(), 1, &[vec![Bn254::one(); 3]]);
        assert_eq!(c.counts.basis, 1 + 3 * (12 + RANDOM_UNIT_SCALARS));
        assert_eq!(c.counts.extra, 2);
        assert_eq!(c.counts.total, c.counts.basis + 8192 + 2);
    }
}
