//! Native code generation, correctness checks and timing (cryptificate-native).

pub mod bench;
pub mod codegen;
pub mod compile;
pub mod correctness;
pub mod machine;
pub mod request;
pub mod stats;
pub mod variant;
pub mod word;

pub(crate) mod embedded {
    include!(concat!(env!("OUT_DIR"), "/embedded.rs"));
}
