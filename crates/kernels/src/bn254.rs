//! The BN254 scalar field, through arkworks.
//!
//! The modulus is
//! 21888242871839275222246405745257275088548364400416034343698204186575808495617.
//!
//! The generated native BN254 variants compute with this `Fr`. The module
//! `bn254_mont` holds a Montgomery kernel with the same limb representation
//! that is proved against `ZMod p` in `refinement/`; arkworks' own arithmetic
//! is not covered by those proofs (see `refinement/STATUS.md`, section 4).

pub use ark_bn254::Fr;
pub use ark_ff::{Field, PrimeField, Zero, One};
