//! Native code generation, correctness checks and timing (cryptificate-native).

pub mod codegen;
pub mod compile;
pub mod variant;
pub mod word;

pub(crate) mod embedded {
    include!(concat!(env!("OUT_DIR"), "/embedded.rs"));
}
