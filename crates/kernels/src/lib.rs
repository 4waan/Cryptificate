//! Arithmetic primitives shared by every generated native variant.
//!
//! Every variant that the benchmark compares is built from these functions, so a
//! timing difference between two variants comes from the circuit, not from a
//! different field implementation.

#![no_std]

pub mod gf256;
pub mod bn254;
