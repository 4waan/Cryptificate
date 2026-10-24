//! GF(2^8) with the AES polynomial x^8 + x^4 + x^3 + x + 1 (0x11B).

/// The reduction polynomial, including the x^8 term.
pub const POLY: u16 = 0x11B;

/// Multiplication by x (the byte `02`): shift left and reduce by 0x1B when the
/// top bit falls off.
#[inline(always)]
pub fn xtime(a: u8) -> u8 {
    (a << 1) ^ (((a >> 7) & 1).wrapping_mul(0x1B))
}

/// Field addition, which is XOR.
#[inline(always)]
pub fn add(a: u8, b: u8) -> u8 {
    a ^ b
}

/// Shift-and-add multiplication without tables or carry-less instructions.
#[inline(always)]
pub fn mul(a: u8, b: u8) -> u8 {
    let mut acc = 0u8;
    let mut x = a;
    let mut y = b;
    let mut i = 0;
    while i < 8 {
        acc ^= x & (0u8.wrapping_sub(y & 1));
        x = xtime(x);
        y >>= 1;
        i += 1;
    }
    acc
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Carry-less product followed by polynomial long division, written
    /// independently of `mul`.
    fn oracle(a: u8, b: u8) -> u8 {
        let mut prod: u16 = 0;
        for i in 0..8 {
            if (b >> i) & 1 == 1 {
                prod ^= (a as u16) << i;
            }
        }
        for bit in (8..16).rev() {
            if (prod >> bit) & 1 == 1 {
                prod ^= POLY << (bit - 8);
            }
        }
        prod as u8
    }

    #[test]
    fn xtime_reduces_high_bit() {
        assert_eq!(xtime(0x80), 0x1B);
        assert_eq!(mul(0x02, 0x80), 0x1B);
    }

    #[test]
    fn all_products_match_long_division() {
        for a in 0..=255u8 {
            for b in 0..=255u8 {
                assert_eq!(mul(a, b), oracle(a, b), "{a:02X} * {b:02X}");
            }
        }
    }
}
