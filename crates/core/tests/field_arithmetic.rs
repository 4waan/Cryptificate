//! Field arithmetic against independent oracles.

use cryptificate_core::field::{bn254_modulus, Bn254, Field, Gf256};
use cryptificate_core::linalg::{aes_mixcolumns, mat_vec};
use num_bigint::BigUint;
use num_traits::{One, Zero};
use rand::{RngCore, SeedableRng};
use rand_chacha::ChaCha20Rng;

/// Carry-less product of two bytes followed by polynomial long division by
/// x^8 + x^4 + x^3 + x + 1, written without reference to the crate's code.
fn gf256_oracle(a: u8, b: u8) -> u8 {
    let mut product: u32 = 0;
    for bit in 0..8 {
        if b & (1 << bit) != 0 {
            product ^= (a as u32) << bit;
        }
    }
    let modulus: u32 = 0b1_0001_1011;
    for degree in (8..=14).rev() {
        if product & (1 << degree) != 0 {
            product ^= modulus << (degree - 8);
        }
    }
    assert!(product < 256);
    product as u8
}

fn bytes(v: &[u8]) -> Vec<Gf256> {
    v.iter().copied().map(Gf256).collect()
}

#[test]
fn gate_02_times_80_is_1b() {
    assert_eq!(Gf256(0x02) * Gf256(0x80), Gf256(0x1B));
    assert_eq!(Gf256(0x80).xtime(), Gf256(0x1B));
}

#[test]
fn gate_aes_mixcolumns_columns() {
    let m = aes_mixcolumns();
    assert_eq!(
        mat_vec(&m, &bytes(&[0x01, 0, 0, 0])),
        bytes(&[0x02, 0x01, 0x01, 0x03])
    );
    assert_eq!(
        mat_vec(&m, &bytes(&[0x80, 0, 0, 0])),
        bytes(&[0x1B, 0x80, 0x80, 0x9B])
    );
}

#[test]
fn all_byte_products_match_oracle() {
    for a in 0..=255u8 {
        for b in 0..=255u8 {
            assert_eq!(
                Gf256(a) * Gf256(b),
                Gf256(gf256_oracle(a, b)),
                "{a:02X} * {b:02X}"
            );
        }
    }
}

#[test]
fn byte_addition_and_inverse() {
    for a in 0..=255u8 {
        for b in 0..=255u8 {
            assert_eq!(Gf256(a) + Gf256(b), Gf256(a ^ b));
            assert_eq!(Gf256(a) - Gf256(b), Gf256(a ^ b));
        }
        match Gf256(a).inverse() {
            None => assert_eq!(a, 0),
            Some(inv) => assert_eq!(gf256_oracle(a, inv.0), 1, "{a:02X}"),
        }
    }
}

fn to_bn(n: &BigUint) -> Bn254 {
    Bn254::decode(&n.to_str_radix(10)).expect("value below p decodes")
}

fn from_bn(x: Bn254) -> BigUint {
    BigUint::parse_bytes(x.encode().as_bytes(), 10).expect("canonical decimal")
}

fn edge_values() -> Vec<BigUint> {
    let p = bn254_modulus();
    let one = BigUint::one();
    vec![
        BigUint::zero(),
        one.clone(),
        BigUint::from(2u32),
        BigUint::from(5u32),
        p - &one,
        p - BigUint::from(2u32),
        (p - &one) >> 1,
        (p + &one) >> 1,
        BigUint::from(u64::MAX),
        BigUint::one() << 253,
    ]
}

fn random_values(count: usize) -> Vec<BigUint> {
    let mut rng = ChaCha20Rng::seed_from_u64(0x5eed_0254);
    let p = bn254_modulus();
    (0..count)
        .map(|_| {
            let mut buf = [0u8; 40];
            rng.fill_bytes(&mut buf);
            BigUint::from_bytes_le(&buf) % p
        })
        .collect()
}

#[test]
fn bn254_matches_bigint_arithmetic() {
    let p = bn254_modulus();
    let mut values = edge_values();
    values.extend(random_values(400));
    for (i, a) in values.iter().enumerate() {
        let fa = to_bn(a);
        assert_eq!(from_bn(fa), *a, "decode/encode round trip");
        assert_eq!(fa.encode(), a.to_str_radix(10));
        assert_eq!(from_bn(-fa), (p - a) % p);
        match fa.inverse() {
            None => assert!(a.is_zero()),
            Some(inv) => {
                let expected = a.modpow(&(p - BigUint::from(2u32)), p);
                assert_eq!(from_bn(inv), expected);
                assert_eq!(fa * inv, Bn254::one());
            }
        }
        // Pair each value with a spread of others to keep the run short.
        for b in values.iter().skip(i % 7).step_by(13) {
            let fb = to_bn(b);
            assert_eq!(from_bn(fa + fb), (a + b) % p, "{a} + {b}");
            assert_eq!(from_bn(fa - fb), (a + p - b) % p, "{a} - {b}");
            assert_eq!(from_bn(fa * fb), (a * b) % p, "{a} * {b}");
        }
    }
}

#[test]
fn bn254_from_u64_and_pow() {
    let p = bn254_modulus();
    for (x, e) in [(3u64, 5u64), (7, 65535), (0, 0), (0, 3), (12345, 1)] {
        let expected = BigUint::from(x).modpow(&BigUint::from(e), p);
        assert_eq!(from_bn(Bn254::from_u64(x).pow(e)), expected);
    }
}
