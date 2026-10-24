//! The AES field GF(2^8) = GF(2)[x]/(x^8 + x^4 + x^3 + x + 1) as a type of the
//! gf256 crate. The generator 0x03 is the one the crate's documentation uses
//! for this polynomial; multiplication does not depend on it.

#![no_std]

use gf256::gf::gf;

#[gf(polynomial = 0x11b, generator = 0x3)]
pub type gf256_aes;
