//! Round constants from the Grain LFSR, as the Poseidon2 reference
//! generates them.
//!
//! This is an independent implementation of `init_generator`,
//! `grain_sr_generator`, `grain_random_bits` and `generate_constants` of
//! `poseidon2_rust_params.sage` in
//! <https://github.com/HorizenLabs/poseidon2> at commit
//! `055bde3f4782731ba5f5ce5888a440a94327eaf3` (the Poseidon version,
//! `code/generate_parameters_grain.sage` in
//! <https://extgit.isec.tugraz.at/krypto/hadeshash> at commit
//! `208b5a164c6a252b137997694d90931b2bb851c5`, shares everything but the
//! constant layout). It follows the scripts clock by clock, with the register
//! as a queue of 80 bits; the Lean transcription
//! (`lean/Cryptificate/Grain/Generator.lean`) computes 16 clocks at a time.
//! Nothing here is trusted: the engine uses it to predict claim
//! `constants.grain`, and Lean evaluates its own transcription.
//!
//! Scope: prime fields (`FIELD = 1`), the power S-box `x^α` with `α > 0`
//! (`SBOX = 0`) and the Poseidon2 layout: `R_F·t + R_P` constants, each
//! partial-round constant followed by `t - 1` zeros, so that row `r` of `t`
//! numbers holds the constants of round `r`. The field size `n` is the bit
//! length of `p`, as in the Poseidon2 script.

use std::collections::VecDeque;

use num_bigint::BigUint;
use num_traits::Zero;

/// Why the procedure is not defined for some parameters.
#[derive(Clone, Debug, PartialEq, Eq, thiserror::Error)]
pub enum GrainError {
    /// `R_F / 2` must be a whole number of rounds.
    #[error("the number of full rounds must be even, got {0}")]
    OddFullRounds(u32),
    /// A seed field would need more bits than the script gives it (it pads
    /// with `zfill`, which never truncates, so the register would differ).
    #[error("{what} = {value} does not fit the {bits} bits the seed gives it")]
    DoesNotFit {
        what: &'static str,
        value: u64,
        bits: u32,
    },
    /// The modulus must be at least 2.
    #[error("the modulus must be at least 2")]
    BadModulus,
}

/// The register of the Grain LFSR: `bit_sequence` of the scripts, oldest
/// bit first.
struct Lfsr {
    bits: VecDeque<u8>,
}

impl Lfsr {
    /// `init_generator` followed by the 160 discarded clocks.
    fn new(n: u64, t: u64, rf: u64, rp: u64) -> Self {
        let mut bits = VecDeque::with_capacity(81);
        let mut push = |value: u64, width: u32| {
            for j in (0..width).rev() {
                bits.push_back(((value >> j) & 1) as u8);
            }
        };
        push(1, 2); // FIELD = 1: GF(p)
        push(0, 4); // SBOX = 0: x^alpha
        push(n, 12);
        push(t, 12);
        push(rf, 10);
        push(rp, 10);
        for _ in 0..30 {
            bits.push_back(1);
        }
        debug_assert_eq!(bits.len(), 80);
        let mut lfsr = Lfsr { bits };
        for _ in 0..160 {
            lfsr.clock();
        }
        lfsr
    }

    /// One clock: `b62 ^ b51 ^ b38 ^ b23 ^ b13 ^ b0`, popped and appended.
    fn clock(&mut self) -> u8 {
        let b = &self.bits;
        let new = b[62] ^ b[51] ^ b[38] ^ b[23] ^ b[13] ^ b[0];
        self.bits.pop_front();
        self.bits.push_back(new);
        new
    }

    /// One output bit of the self-shrinking generator.
    fn next_bit(&mut self) -> u8 {
        loop {
            let a = self.clock();
            let b = self.clock();
            if a == 1 {
                return b;
            }
        }
    }

    /// `grain_random_bits(n)`: `n` output bits, the first most significant.
    fn random_bits(&mut self, n: u64) -> BigUint {
        let mut v = BigUint::zero();
        for _ in 0..n {
            v <<= 1u32;
            if self.next_bit() == 1 {
                v += 1u32;
            }
        }
        v
    }
}

fn fits(what: &'static str, value: u64, bits: u32) -> Result<(), GrainError> {
    if value < (1u64 << bits) {
        Ok(())
    } else {
        Err(GrainError::DoesNotFit { what, value, bits })
    }
}

/// The field size of the seed: the bit length of `p`.
pub fn field_size(p: &BigUint) -> u64 {
    p.bits()
}

/// The Poseidon2 round constants of an instance over `GF(p)` of width `t`
/// with `rf` full and `rp` partial rounds: `(rf + rp) * t` numbers below
/// `p`, round by round, partial rounds `[c, 0, …, 0]`.
pub fn poseidon2_constants(
    p: &BigUint,
    t: usize,
    rf: u32,
    rp: u32,
) -> Result<Vec<BigUint>, GrainError> {
    if p < &BigUint::from(2u32) {
        return Err(GrainError::BadModulus);
    }
    if !rf.is_multiple_of(2) {
        return Err(GrainError::OddFullRounds(rf));
    }
    let n = field_size(p);
    fits("the field size", n, 12)?;
    fits("the width", t as u64, 12)?;
    fits("the number of full rounds", rf.into(), 10)?;
    fits("the number of partial rounds", rp.into(), 10)?;
    let mut lfsr = Lfsr::new(n, t as u64, rf.into(), rp.into());
    let (rf, rp) = (rf as usize, rp as usize);
    let partial = (rf / 2 * t)..(rf / 2 * t + rp);
    let mut out = Vec::with_capacity((rf + rp) * t);
    for i in 0..(rf * t + rp) {
        let mut c = lfsr.random_bits(n);
        while &c >= p {
            c = lfsr.random_bits(n);
        }
        out.push(c);
        if partial.contains(&i) {
            out.extend(std::iter::repeat_n(BigUint::zero(), t - 1));
        }
    }
    Ok(out)
}

/// The first position at which `submitted` differs from `expected` (the
/// lists have the same length in every use here; a shorter list differs at
/// its end).
pub fn first_difference(expected: &[BigUint], submitted: &[BigUint]) -> Option<usize> {
    let common = expected.len().min(submitted.len());
    (0..common)
        .find(|&i| expected[i] != submitted[i])
        .or((expected.len() != submitted.len()).then_some(common))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::str::FromStr;

    fn big(s: &str) -> BigUint {
        BigUint::from_str(s).unwrap()
    }

    fn hex(s: &str) -> BigUint {
        BigUint::parse_bytes(s.trim_start_matches("0x").as_bytes(), 16).unwrap()
    }

    const BN254: &str =
        "21888242871839275222246405745257275088548364400416034343698204186575808495617";

    /// HorizenLabs/poseidon2 `poseidon2_instance_bn256.rs` (`RC3`), the first
    /// two rows, the first partial row and the last row.
    #[test]
    fn bn254_width3_matches_horizenlabs() {
        let c = poseidon2_constants(&big(BN254), 3, 8, 56).unwrap();
        assert_eq!(c.len(), 64 * 3);
        assert_eq!(
            c[0],
            hex("0x1d066a255517b7fd8bddd3a93f7804ef7f8fcde48bb4c37a59a09a1a97052816")
        );
        assert_eq!(
            c[5],
            hex("0x1a24913a928b38485a65a84a291da1ff91c20626524b2b87d49f4f2c9018d735")
        );
        assert_eq!(
            c[12],
            hex("0x1a1d063e54b1e764b63e1855bff015b8cedd192f47308731499573f23597d4b5")
        );
        assert!(c[13].is_zero() && c[14].is_zero());
        assert_eq!(
            c[191],
            hex("0x0fc1bbceba0590f5abbdffa6d3b35e3297c021a3a409926d0e2d54dc1c84fda6")
        );
    }

    /// Plonky3 at commit `0d803737b681774186cd283b1fd2d8e493655c82`,
    /// `koala-bear/src/poseidon2.rs`: `KOALABEAR_POSEIDON2_RC_16_*`
    /// (KoalaBear, t = 16, R_F = 8, R_P = 20), split into the first full
    /// rounds, one constant per partial round and the last full rounds.
    #[test]
    fn koalabear_width16_matches_plonky3() {
        let c = poseidon2_constants(&big("2130706433"), 16, 8, 20).unwrap();
        assert_eq!(c.len(), 28 * 16);
        // EXTERNAL_INITIAL[0][0] and [0][15].
        assert_eq!(c[0], hex("0x7ee56a48"));
        assert_eq!(c[15], hex("0x5b2e2660"));
        // INTERNAL[0] and INTERNAL[19], at the head of rows 4 and 23.
        assert_eq!(c[4 * 16], hex("0x54dfeb5d"));
        assert!(c[4 * 16 + 1..5 * 16].iter().all(Zero::is_zero));
        assert_eq!(c[23 * 16], hex("0x1e66cec2"));
        // EXTERNAL_FINAL[3][15].
        assert_eq!(c[28 * 16 - 1], hex("0x3466c7ca"));
    }

    /// HorizenLabs/poseidon2 at commit
    /// `055bde3f4782731ba5f5ce5888a440a94327eaf3`,
    /// `poseidon2_instance_babybear.rs` (`RC16`: BabyBear, t = 16, R_F = 8,
    /// R_P = 13).
    #[test]
    fn babybear_width16_matches_horizenlabs() {
        let c = poseidon2_constants(&big("2013265921"), 16, 8, 13).unwrap();
        assert_eq!(c.len(), 21 * 16);
        assert_eq!(c[0], hex("0x69cbb6af"));
        assert_eq!(c[1], hex("0x46ad93f9"));
        assert_eq!(c[4 * 16], hex("0x5a8053c0"));
        assert_eq!(c[5 * 16], hex("0x693be639"));
    }

    #[test]
    fn parameters_outside_the_seed_are_rejected() {
        let p = big("2013265921");
        assert_eq!(
            poseidon2_constants(&p, 3, 7, 13),
            Err(GrainError::OddFullRounds(7))
        );
        assert!(matches!(
            poseidon2_constants(&p, 3, 8, 1024),
            Err(GrainError::DoesNotFit { .. })
        ));
        assert_eq!(
            poseidon2_constants(&BigUint::from(1u32), 3, 8, 1),
            Err(GrainError::BadModulus)
        );
    }

    #[test]
    fn differences() {
        let a: Vec<BigUint> = [1u32, 2, 3].iter().map(|&x| x.into()).collect();
        let b: Vec<BigUint> = [1u32, 5, 3].iter().map(|&x| x.into()).collect();
        assert_eq!(first_difference(&a, &a), None);
        assert_eq!(first_difference(&a, &b), Some(1));
        assert_eq!(first_difference(&a, &a[..2]), Some(2));
    }
}
