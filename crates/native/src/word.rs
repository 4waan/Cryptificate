//! Field elements as column words in native buffers.

use cryptificate_core::{Bn254, Field, Gf256};
use cryptificate_kernels::bn254::{Field as _, Fr, One, PrimeField};
use rand::Rng;

const _: () = assert!(std::mem::size_of::<Fr>() == 32, "Fr must be 32 bytes");

/// A field whose elements travel through `mix_batch` buffers.
pub trait NativeWord: Field {
    /// Bytes per element in a buffer.
    const WORD_BYTES: usize;

    /// Writes `values` into `out` (exactly `values.len() * WORD_BYTES` bytes).
    fn store(values: &[Self], out: &mut [u8]);

    /// Reads `bytes.len() / WORD_BYTES` elements.
    fn load(bytes: &[u8]) -> Vec<Self>;

    /// Appends a representation-independent encoding (for checksums):
    /// GF(2^8) bytes as they are, BN254 elements as 32-byte little-endian
    /// canonical integers.
    fn canonical_bytes(values: &[Self], out: &mut Vec<u8>);

    /// A uniformly random element.
    fn random<R: Rng>(rng: &mut R) -> Self;

    /// Scalars used for vectors with one nonzero word: every nonzero byte
    /// over GF(2^8); edge values plus `random` seeded values over BN254.
    fn unit_scalars<R: Rng>(rng: &mut R, random: usize) -> Vec<Self>;
}

impl NativeWord for Gf256 {
    const WORD_BYTES: usize = 1;

    fn store(values: &[Self], out: &mut [u8]) {
        for (o, v) in out.iter_mut().zip(values) {
            *o = v.0;
        }
    }

    fn load(bytes: &[u8]) -> Vec<Self> {
        bytes.iter().copied().map(Gf256).collect()
    }

    fn canonical_bytes(values: &[Self], out: &mut Vec<u8>) {
        out.extend(values.iter().map(|v| v.0));
    }

    fn random<R: Rng>(rng: &mut R) -> Self {
        Gf256(rng.gen())
    }

    fn unit_scalars<R: Rng>(_rng: &mut R, _random: usize) -> Vec<Self> {
        (1..=255u8).map(Gf256).collect()
    }
}

impl NativeWord for Bn254 {
    const WORD_BYTES: usize = 32;

    fn store(values: &[Self], out: &mut [u8]) {
        assert!(out.len() >= values.len() * 32, "output too short");
        for (i, v) in values.iter().enumerate() {
            // SAFETY: 32 bytes are available at offset 32 i; the write is unaligned.
            unsafe { std::ptr::write_unaligned(out.as_mut_ptr().add(32 * i).cast::<Fr>(), v.0) }
        }
    }

    fn load(bytes: &[u8]) -> Vec<Self> {
        (0..bytes.len() / 32)
            .map(|i| {
                // SAFETY: 32 bytes are available at offset 32 i; every bit
                // pattern is a valid `Fr` value (four u64 limbs).
                Bn254(unsafe { std::ptr::read_unaligned(bytes.as_ptr().add(32 * i).cast::<Fr>()) })
            })
            .collect()
    }

    fn canonical_bytes(values: &[Self], out: &mut Vec<u8>) {
        for v in values {
            for limb in v.0.into_bigint().0 {
                out.extend_from_slice(&limb.to_le_bytes());
            }
        }
    }

    fn random<R: Rng>(rng: &mut R) -> Self {
        let mut bytes = [0u8; 64];
        rng.fill(&mut bytes[..]);
        Bn254(Fr::from_le_bytes_mod_order(&bytes))
    }

    fn unit_scalars<R: Rng>(rng: &mut R, random: usize) -> Vec<Self> {
        let one = Fr::one();
        let two = one + one;
        let half = two.inverse_or_zero();
        let pow2 = |k: u64| Bn254(two.pow([k]));
        let mut s = vec![
            Bn254(one),
            Bn254(two),
            Bn254(-one),
            Bn254(-two),
            Bn254(half),       // (p + 1) / 2
            Bn254(half - one), // (p - 1) / 2
            pow2(64),
            pow2(128),
            pow2(192),
            pow2(253),
            pow2(254),
            Bn254(Fr::from_le_bytes_mod_order(&[0xFF; 32])),
        ];
        s.extend((0..random).map(|_| Self::random(rng)));
        s
    }
}

trait InverseOrZero {
    fn inverse_or_zero(&self) -> Self;
}

impl InverseOrZero for Fr {
    fn inverse_or_zero(&self) -> Self {
        self.inverse().unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::SeedableRng;
    use rand_chacha::ChaCha20Rng;

    #[test]
    fn store_and_load_round_trip() {
        let mut rng = ChaCha20Rng::seed_from_u64(1);
        let v: Vec<Bn254> = (0..5).map(|_| Bn254::random(&mut rng)).collect();
        let mut buf = [0u8; 5 * 32 + 1];
        Bn254::store(&v, &mut buf[1..]);
        assert_eq!(Bn254::load(&buf[1..]), v);
        let g = vec![Gf256(1), Gf256(0xFE)];
        let mut b = [0u8; 2];
        Gf256::store(&g, &mut b);
        assert_eq!(Gf256::load(&b), g);
    }

    #[test]
    fn bn254_edge_scalars() {
        let mut rng = ChaCha20Rng::seed_from_u64(2);
        let s = Bn254::unit_scalars(&mut rng, 3);
        assert_eq!(s.len(), 15);
        assert_eq!(s[2], -Bn254::one());
        assert_eq!(s[4] + s[4], Bn254::one());
        assert_eq!(s[5] + s[5], -Bn254::one());
        let mut canon = Vec::new();
        Bn254::canonical_bytes(&[Bn254::one()], &mut canon);
        assert_eq!(canon[0], 1);
        assert!(canon[1..].iter().all(|&b| b == 0));
        assert_eq!(Gf256::unit_scalars(&mut rng, 0).len(), 255);
    }
}
