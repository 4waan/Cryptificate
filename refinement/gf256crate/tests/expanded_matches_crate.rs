//! The expanded source agrees with the gf256 crate it was expanded from, and
//! with the reference multiplier of `crates/kernels`, on all 65,536 products.

#[path = "../../../crates/kernels/src/gf256.rs"]
#[allow(dead_code)]
mod kernels_gf256;

use gf256_aes_config::gf256_aes as crate_gf;
use gf256_aes_expanded::gf256_aes as expanded_gf;

#[test]
fn all_products_agree() {
    for a in 0..=255u8 {
        for b in 0..=255u8 {
            let from_crate = (crate_gf(a) * crate_gf(b)).0;
            let from_expansion = expanded_gf(a).mul(expanded_gf(b)).0;
            let reference = kernels_gf256::mul(a, b);
            assert_eq!(from_expansion, from_crate, "{a:02X} * {b:02X}");
            assert_eq!(from_crate, reference, "{a:02X} * {b:02X}");
        }
    }
}

#[test]
fn reduction_gate() {
    assert_eq!(expanded_gf(0x02).mul(expanded_gf(0x80)).0, 0x1B);
    assert_eq!((crate_gf(0x02) * crate_gf(0x80)).0, 0x1B);
}
