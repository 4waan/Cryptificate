//! Extraction root for the GF(2^8) kernels.
//!
//! Charon translates this file as the crate `cryptificate_kernels`. The module
//! below is the unmodified `crates/kernels/src/gf256.rs`, so the extracted items
//! keep their real paths (`cryptificate_kernels::gf256::{xtime, add, mul}`).
//! `crates/kernels/src/lib.rs` also declares the BN254 module, which pulls in
//! arkworks and is outside the scope of this extraction.

#![no_std]

#[path = "../../crates/kernels/src/gf256.rs"]
pub mod gf256;
