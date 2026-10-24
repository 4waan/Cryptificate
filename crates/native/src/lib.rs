//! Native code generation, correctness checks and timing (cryptificate-native).


#[allow(dead_code)]
pub(crate) mod embedded {
    include!(concat!(env!("OUT_DIR"), "/embedded.rs"));
}
