//! Extraction root for the GF(2^8) kernels, the AES-like round and the BN254
//! Montgomery kernel.
//!
//! Charon translates this file as the crate `cryptificate_kernels`. The modules
//! below are the unmodified `crates/kernels/src/gf256.rs`,
//! `crates/kernels/src/aes_like.rs` and `crates/kernels/src/bn254_mont.rs`, so
//! the extracted items keep their real paths
//! (`cryptificate_kernels::gf256::{xtime, add, mul}`,
//! `cryptificate_kernels::aes_like::{round, encrypt, ...}`,
//! `cryptificate_kernels::bn254_mont::{add, sub, mul, ...}`).
//! `crates/kernels/src/lib.rs` also declares the `bn254` module, a re-export of
//! arkworks' `Fr`, which is outside the scope of this extraction.

#![no_std]

#[path = "../../crates/kernels/src/gf256.rs"]
pub mod gf256;

#[path = "../../crates/kernels/src/aes_like.rs"]
pub mod aes_like;

#[path = "../../crates/kernels/src/bn254_mont.rs"]
pub mod bn254_mont;
