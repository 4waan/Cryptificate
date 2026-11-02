//! The BN254 scalar field in Montgomery form, on four 64-bit limbs.
//!
//! The modulus is
//! `p = 21888242871839275222246405745257275088548364400416034343698204186575808495617`
//! (`0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001`, 254 bits).
//! An element `x` is held as the limbs of `x·R mod p` with `R = 2^256`, least significant
//! limb first, which is the representation arkworks uses for `ark_bn254::Fr`.
//!
//! These functions are the input of the Rust-source refinement in `refinement/`: Charon and
//! Aeneas translate this file to Lean, where `Refinement/BN254Mont.lean` proves that, on
//! inputs below `p`, they return results below `p` that represent the sum, difference and
//! product in `ZMod p` (WideTrail's `Poseidon2.BN254.F`). Keep them in the subset those
//! tools handle (plain functions on `u64`, `u128` and `[u64; 4]`, no traits, generics or
//! iterators) and run `refinement/extract.sh --write` after changing them.
//!
//! Multiplication is coarsely integrated operand scanning (CIOS): four rows, each adding
//! `a·b[i]` to the accumulator and then a multiple of `p` that clears its low limb, followed
//! by one conditional subtraction of `p`. Because `p < 2^254`, the accumulator stays below
//! `2p < 2^256` and fits in four limbs between rows. The code branches on the comparison with
//! `p`; it is not written to run in constant time.

/// Limbs of the modulus `p`, least significant first.
pub const P0: u64 = 0x43e1_f593_f000_0001;
pub const P1: u64 = 0x2833_e848_79b9_7091;
pub const P2: u64 = 0xb850_45b6_8181_585d;
pub const P3: u64 = 0x3064_4e72_e131_a029;

/// `-p⁻¹ mod 2^64`.
pub const INV: u64 = 0xc2e1_f593_efff_ffff;

/// Limbs of `R² mod p`, used to enter Montgomery form.
pub const R2_0: u64 = 0x1bb8_e645_ae21_6da7;
pub const R2_1: u64 = 0x53fe_3ab1_e35c_59e3;
pub const R2_2: u64 = 0x8c49_833d_53bb_8085;
pub const R2_3: u64 = 0x0216_d0b1_7f4e_44a5;

/// The modulus as limbs.
pub const MODULUS: [u64; 4] = [P0, P1, P2, P3];

/// `R² mod p` as limbs.
pub const R2: [u64; 4] = [R2_0, R2_1, R2_2, R2_3];

/// `acc + a·b + carry` as a low and a high limb. The sum is below `2^128`, so nothing is
/// lost.
#[inline(always)]
pub fn mac(acc: u64, a: u64, b: u64, carry: u64) -> (u64, u64) {
    let t = (acc as u128) + (a as u128) * (b as u128) + (carry as u128);
    (t as u64, (t >> 64) as u64)
}

/// `a + b + carry` as a low limb and a carry.
#[inline(always)]
pub fn adc(a: u64, b: u64, carry: u64) -> (u64, u64) {
    let t = (a as u128) + (b as u128) + (carry as u128);
    (t as u64, (t >> 64) as u64)
}

/// `a - b - borrow` modulo `2^64` and the outgoing borrow (`0` or `1`), for an incoming
/// borrow of `0` or `1`.
#[inline(always)]
pub fn sbb(a: u64, b: u64, borrow: u64) -> (u64, u64) {
    let t = (a as u128) + 0x1_0000_0000_0000_0000u128 - (b as u128) - (borrow as u128);
    (t as u64, 1 - ((t >> 64) as u64))
}

/// Subtract `p` once if the value is at least `p`. For values below `2p` the result is the
/// value modulo `p`.
#[inline(always)]
pub fn reduce_once(t: [u64; 4]) -> [u64; 4] {
    let (d0, b) = sbb(t[0], P0, 0);
    let (d1, b) = sbb(t[1], P1, b);
    let (d2, b) = sbb(t[2], P2, b);
    let (d3, b) = sbb(t[3], P3, b);
    if b == 0 {
        [d0, d1, d2, d3]
    } else {
        t
    }
}

/// One CIOS row: `(t + a·b + m·p) / 2^64`, where `m = (t + a·b)·(-p⁻¹) mod 2^64` makes the
/// division exact. For `t < 2p` and `a < p` the result is below `2p`.
#[inline(always)]
pub fn mont_row(t: [u64; 4], a: [u64; 4], b: u64) -> [u64; 4] {
    let (r0, c) = mac(t[0], a[0], b, 0);
    let (r1, c) = mac(t[1], a[1], b, c);
    let (r2, c) = mac(t[2], a[2], b, c);
    let (r3, r4) = mac(t[3], a[3], b, c);
    let m = r0.wrapping_mul(INV);
    let (_, c) = mac(r0, m, P0, 0);
    let (s0, c) = mac(r1, m, P1, c);
    let (s1, c) = mac(r2, m, P2, c);
    let (s2, c) = mac(r3, m, P3, c);
    let s3 = r4 + c;
    [s0, s1, s2, s3]
}

/// Montgomery multiplication: `a·b·R⁻¹ mod p`, for `a < p` and any `b < 2^256`.
#[inline(always)]
pub fn mul(a: [u64; 4], b: [u64; 4]) -> [u64; 4] {
    let t = mont_row([0, 0, 0, 0], a, b[0]);
    let t = mont_row(t, a, b[1]);
    let t = mont_row(t, a, b[2]);
    let t = mont_row(t, a, b[3]);
    reduce_once(t)
}

/// Addition modulo `p`, for `a, b < p`.
#[inline(always)]
pub fn add(a: [u64; 4], b: [u64; 4]) -> [u64; 4] {
    let (s0, c) = adc(a[0], b[0], 0);
    let (s1, c) = adc(a[1], b[1], c);
    let (s2, c) = adc(a[2], b[2], c);
    let (s3, _) = adc(a[3], b[3], c);
    reduce_once([s0, s1, s2, s3])
}

/// Subtraction modulo `p`, for `a, b < p`: `a - b`, plus `p` when that borrows.
#[inline(always)]
pub fn sub(a: [u64; 4], b: [u64; 4]) -> [u64; 4] {
    let (d0, br) = sbb(a[0], b[0], 0);
    let (d1, br) = sbb(a[1], b[1], br);
    let (d2, br) = sbb(a[2], b[2], br);
    let (d3, br) = sbb(a[3], b[3], br);
    if br == 0 {
        [d0, d1, d2, d3]
    } else {
        let (s0, c) = adc(d0, P0, 0);
        let (s1, c) = adc(d1, P1, c);
        let (s2, c) = adc(d2, P2, c);
        let (s3, _) = adc(d3, P3, c);
        [s0, s1, s2, s3]
    }
}

/// Montgomery form of an integer: `x·R mod p`, for any `x < 2^256`.
#[inline(always)]
pub fn to_mont(x: [u64; 4]) -> [u64; 4] {
    mul([R2_0, R2_1, R2_2, R2_3], x)
}

/// The integer represented in Montgomery form: `x·R⁻¹ mod p`, for any `x < 2^256`.
#[inline(always)]
pub fn from_mont(x: [u64; 4]) -> [u64; 4] {
    mul([1, 0, 0, 0], x)
}

#[cfg(test)]
mod tests {
    extern crate std;

    use super::*;
    use std::{vec, vec::Vec};
    use ark_bn254::{Fr, FrConfig};
    use ark_ff::{BigInt, Field, MontConfig, One, PrimeField, Zero};

    /// arkworks keeps `Fr` in Montgomery form with the same `R = 2^256`, so its limbs are
    /// directly comparable.
    fn limbs(x: Fr) -> [u64; 4] {
        x.0 .0
    }

    fn fr(m: [u64; 4]) -> Fr {
        Fr::new_unchecked(BigInt(m))
    }

    /// xorshift64*: deterministic, no dependency.
    struct Rng(u64);
    impl Rng {
        fn next(&mut self) -> u64 {
            self.0 ^= self.0 >> 12;
            self.0 ^= self.0 << 25;
            self.0 ^= self.0 >> 27;
            self.0.wrapping_mul(0x2545_f491_4f6c_dd1d)
        }
        fn limbs(&mut self) -> [u64; 4] {
            [self.next(), self.next(), self.next(), self.next()]
        }
        /// A uniformly random field element (as arkworks builds it), in Montgomery form.
        fn element(&mut self) -> Fr {
            let mut bytes = [0u8; 64];
            for chunk in bytes.chunks_mut(8) {
                chunk.copy_from_slice(&self.next().to_le_bytes());
            }
            Fr::from_le_bytes_mod_order(&bytes)
        }
    }

    fn lt_p(x: [u64; 4]) -> bool {
        for i in (0..4).rev() {
            if x[i] != MODULUS[i] {
                return x[i] < MODULUS[i];
            }
        }
        false
    }

    /// Field elements chosen to exercise carries and the conditional subtraction.
    fn edge_elements() -> Vec<Fr> {
        let p_minus = |k: u64| -Fr::from(k);
        let mut v = vec![
            Fr::zero(),
            Fr::one(),
            Fr::from(2u64),
            p_minus(1),
            p_minus(2),
            Fr::from(u64::MAX),
            -Fr::from(u64::MAX),
            Fr::from(2u64).inverse().unwrap(),
            // the element whose Montgomery limbs are R mod p, R² mod p, 1, p - 1
            fr(limbs(Fr::one())),
            fr(R2),
            fr([1, 0, 0, 0]),
            fr([P0 - 1, P1, P2, P3]),
        ];
        // elements with Montgomery limbs 2^(64k) and 2^(64k) - 1
        for k in 0..4 {
            let mut m = [0u64; 4];
            m[k] = 1;
            v.push(fr(m));
            let mut m = [u64::MAX; 4];
            for (j, limb) in m.iter_mut().enumerate() {
                if j >= k {
                    *limb = 0;
                }
            }
            v.push(fr(m));
        }
        v
    }

    #[test]
    fn constants_match_arkworks() {
        assert_eq!(MODULUS, <Fr as PrimeField>::MODULUS.0);
        assert_eq!(R2, <FrConfig as MontConfig<4>>::R2.0);
        assert_eq!(INV, <FrConfig as MontConfig<4>>::INV);
        // R mod p is the Montgomery form of 1; R² mod p the Montgomery form of R mod p.
        let r = limbs(Fr::one());
        assert_eq!(to_mont([1, 0, 0, 0]), r);
        assert_eq!(to_mont(r), R2);
        // INV · p ≡ -1 (mod 2^64)
        assert_eq!(INV.wrapping_mul(P0), u64::MAX);
        // p < 2^254, which keeps the CIOS accumulator in four limbs
        assert!(P3 >> 62 == 0);
    }

    #[test]
    fn helpers() {
        let mut rng = Rng(0x0123_4567_89ab_cdef);
        let cases = [0u64, 1, 2, u64::MAX, u64::MAX - 1, 1 << 63];
        let check = |x: u64, y: u64, z: u64, w: u64| {
            let (lo, hi) = mac(x, y, z, w);
            let want = x as u128 + y as u128 * z as u128 + w as u128;
            assert_eq!((hi as u128) << 64 | lo as u128, want);
            let (lo, hi) = adc(x, y, w & 1);
            assert_eq!((hi as u128) << 64 | lo as u128, x as u128 + y as u128 + (w & 1) as u128);
            let (d, b) = sbb(x, y, w & 1);
            let (want, borrow) = (x as u128).overflowing_sub(y as u128 + (w & 1) as u128);
            assert_eq!(d, want as u64);
            assert_eq!(b, borrow as u64);
        };
        for &x in &cases {
            for &y in &cases {
                for &z in &cases {
                    for &w in &cases {
                        check(x, y, z, w);
                    }
                }
            }
        }
        for _ in 0..10_000 {
            let (x, y, z, w) = (rng.next(), rng.next(), rng.next(), rng.next());
            check(x, y, z, w);
        }
    }

    fn check_pair(a: Fr, b: Fr) {
        let (ma, mb) = (limbs(a), limbs(b));
        assert_eq!(mul(ma, mb), limbs(a * b), "mul {a} {b}");
        assert_eq!(add(ma, mb), limbs(a + b), "add {a} {b}");
        assert_eq!(sub(ma, mb), limbs(a - b), "sub {a} {b}");
        assert!(lt_p(mul(ma, mb)) && lt_p(add(ma, mb)) && lt_p(sub(ma, mb)));
    }

    #[test]
    fn edge_cases_match_arkworks() {
        let e = edge_elements();
        for &a in &e {
            for &b in &e {
                check_pair(a, b);
            }
        }
    }

    #[test]
    fn random_elements_match_arkworks() {
        let mut rng = Rng(0x9e37_79b9_7f4a_7c15);
        for _ in 0..100_000 {
            let (a, b) = (rng.element(), rng.element());
            check_pair(a, b);
        }
    }

    #[test]
    fn conversions_match_arkworks() {
        let mut rng = Rng(0xdead_beef_cafe_f00d);
        let mut inputs: Vec<[u64; 4]> = vec![
            [0, 0, 0, 0],
            [1, 0, 0, 0],
            MODULUS,
            [P0 - 1, P1, P2, P3],
            [u64::MAX; 4],
            R2,
        ];
        for _ in 0..20_000 {
            inputs.push(rng.limbs());
        }
        for x in inputs {
            // Any 256-bit integer enters Montgomery form reduced modulo p.
            let want = Fr::from_le_bytes_mod_order(
                &x.iter().flat_map(|l| l.to_le_bytes()).collect::<Vec<u8>>(),
            );
            let m = to_mont(x);
            assert_eq!(m, limbs(want), "to_mont {x:?}");
            // from_mont undoes it, giving the canonical integer.
            assert_eq!(from_mont(m), want.into_bigint().0, "from_mont {x:?}");
            // from_mont of arbitrary limbs is x·R⁻¹ mod p, which arkworks computes from the
            // canonical integer x.
            let rinv = Fr::from(2u64).pow([256u64]).inverse().unwrap();
            assert_eq!(from_mont(x), (want * rinv).into_bigint().0, "from_mont raw {x:?}");
            assert!(lt_p(m) && lt_p(from_mont(x)));
        }
    }

    #[test]
    fn mul_accepts_any_second_operand() {
        // mul(a, b) for a < p and any 256-bit b is a·b·R⁻¹ mod p.
        let mut rng = Rng(0x1357_9bdf_2468_ace0);
        let rinv = Fr::from(2u64).pow([256u64]).inverse().unwrap();
        let int = |x: [u64; 4]| {
            Fr::from_le_bytes_mod_order(&x.iter().flat_map(|l| l.to_le_bytes()).collect::<Vec<u8>>())
        };
        for _ in 0..20_000 {
            let a = limbs(rng.element());
            let b = rng.limbs();
            let want = int(a) * int(b) * rinv;
            assert_eq!(mul(a, b), want.into_bigint().0);
        }
        let a = [P0 - 1, P1, P2, P3];
        let b = [u64::MAX; 4];
        assert_eq!(mul(a, b), (int(a) * int(b) * rinv).into_bigint().0);
    }

    #[test]
    fn field_laws_on_samples() {
        let mut rng = Rng(42);
        let one = to_mont([1, 0, 0, 0]);
        for _ in 0..2_000 {
            let (a, b, c) = (limbs(rng.element()), limbs(rng.element()), limbs(rng.element()));
            assert_eq!(mul(a, one), a);
            assert_eq!(mul(a, b), mul(b, a));
            assert_eq!(mul(mul(a, b), c), mul(a, mul(b, c)));
            assert_eq!(mul(a, add(b, c)), add(mul(a, b), mul(a, c)));
            assert_eq!(add(sub(a, b), b), a);
        }
    }
}
