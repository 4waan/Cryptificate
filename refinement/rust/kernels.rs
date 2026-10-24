//! Extraction root for the GF(2^8) kernels and the AES-like round.
//!
//! Charon translates this file as the crate `cryptificate_kernels`. The modules
//! below are the unmodified `crates/kernels/src/gf256.rs` and
//! `crates/kernels/src/aes_like.rs`, so the extracted items keep their real
//! paths (`cryptificate_kernels::gf256::{xtime, add, mul}`,
//! `cryptificate_kernels::aes_like::{round, encrypt, ...}`).
//! `crates/kernels/src/lib.rs` also declares the BN254 module, which pulls in
//! arkworks and is outside the scope of this extraction.

#![no_std]

#[path = "../../crates/kernels/src/gf256.rs"]
pub mod gf256;

#[path = "../../crates/kernels/src/aes_like.rs"]
pub mod aes_like;
