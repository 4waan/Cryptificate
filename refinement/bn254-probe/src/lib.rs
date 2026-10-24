//! The BN254 scalar-field multiplication used by `crates/kernels` (`ark_bn254::Fr`).

#![no_std]

pub use ark_bn254::Fr;

/// One field multiplication: arkworks Montgomery multiplication for the BN254 modulus.
pub fn fr_mul(a: Fr, b: Fr) -> Fr {
    a * b
}
