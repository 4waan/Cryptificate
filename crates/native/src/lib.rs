//! Native code generation, correctness checks and timing (cryptificate-native).

pub mod codegen;
pub mod compile;

pub(crate) mod embedded {
    include!(concat!(env!("OUT_DIR"), "/embedded.rs"));
}
