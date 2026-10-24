//! Bounded search for cheaper linear circuits (cryptificate-search).

pub mod baseline;
pub mod expr;
pub mod input;
pub mod request;
pub mod synth;

pub use request::{parse_search_request, Budget, SearchRequest};
