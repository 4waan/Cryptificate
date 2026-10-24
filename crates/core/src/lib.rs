//! Core definitions for Cryptificate.
//!
//! * [`field`]: GF(2^8) and BN254 scalar field elements behind one [`Field`] trait.
//! * [`error`]: validation errors with stable codes and JSON pointer paths.

pub mod error;
pub mod field;

pub use error::{ErrorCode, ValidationError};
pub use field::{Bn254, Field, FieldKind, Gf256};
