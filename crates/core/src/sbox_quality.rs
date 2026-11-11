//! Differential uniformity and linearity of a byte S-box.
//!
//! Both are computed here without checking; the certificate states the
//! values with a witness and Lean checks them on the table
//! (`lean/Cryptificate/Sbox/Quality.lean`).
//!
//! * The **differential uniformity** is the largest entry of the difference
//!   distribution table outside row `a = 0`:
//!   `max over a != 0 and b of #{x : S(x ^ a) ^ S(x) = b}`.
//! * The **linearity** is the largest absolute Walsh coefficient over all
//!   input masks `a` and nonzero output masks `b`:
//!   `max |sum over x of (-1)^(a.x ^ b.S(x))|`, where `a.x` is the parity of
//!   `a & x`. The usual nonlinearity is `128 - linearity / 2`.
//!
//! The witness is the first pair attaining the maximum, in order of `a`
//! and then of `b`, so the engine and the AES templates agree on it.

use serde::Serialize;

use crate::field::{Field, Gf256};
use crate::limits;
use crate::report::Witness;

/// The differential uniformity of a table and the first entry attaining it.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DifferentialMax {
    pub uniformity: u32,
    pub input_difference: Gf256,
    pub output_difference: Gf256,
}

impl DifferentialMax {
    pub fn to_witness(&self) -> Witness {
        Witness::SboxDifferential {
            uniformity: self.uniformity,
            input_difference: self.input_difference.encode(),
            output_difference: self.output_difference.encode(),
        }
    }
}

/// The linearity of a table and the first Walsh coefficient attaining it.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearMax {
    pub linearity: u32,
    pub input_mask: Gf256,
    pub output_mask: Gf256,
}

impl LinearMax {
    pub fn to_witness(&self) -> Witness {
        Witness::SboxLinearity {
            linearity: self.linearity,
            input_mask: self.input_mask.encode(),
            output_mask: self.output_mask.encode(),
        }
    }
}

fn entries(table: &[Gf256]) -> [usize; 256] {
    assert_eq!(
        table.len(),
        limits::SBOX_TABLE_LEN,
        "an S-box table has 256 entries"
    );
    let mut s = [0usize; 256];
    for (x, y) in table.iter().enumerate() {
        s[x] = y.0 as usize;
    }
    s
}

/// The differential uniformity of a 256-entry table, with the first
/// `(a, b)`, `a != 0`, attaining it. Panics on any other length.
pub fn differential_uniformity(table: &[Gf256]) -> DifferentialMax {
    let s = entries(table);
    let mut best = DifferentialMax {
        uniformity: 0,
        input_difference: Gf256(1),
        output_difference: Gf256(0),
    };
    for a in 1..256usize {
        let mut row = [0u32; 256];
        for x in 0..256usize {
            row[s[x ^ a] ^ s[x]] += 1;
        }
        for (b, &count) in row.iter().enumerate() {
            if count > best.uniformity {
                best = DifferentialMax {
                    uniformity: count,
                    input_difference: Gf256(a as u8),
                    output_difference: Gf256(b as u8),
                };
            }
        }
    }
    best
}

/// The Walsh coefficients `W(a, b)` for every input mask `a`, at the output
/// mask `b`, by the fast Walsh-Hadamard transform of `(-1)^(b.S(x))`.
fn walsh_column(s: &[usize; 256], b: usize) -> [i32; 256] {
    let mut w = [0i32; 256];
    for (x, v) in w.iter_mut().enumerate() {
        *v = 1 - 2 * ((b & s[x]).count_ones() & 1) as i32;
    }
    let mut half = 1;
    while half < 256 {
        for start in (0..256).step_by(2 * half) {
            for i in start..start + half {
                let (p, q) = (w[i], w[i + half]);
                w[i] = p + q;
                w[i + half] = p - q;
            }
        }
        half *= 2;
    }
    w
}

/// The linearity of a 256-entry table, with the first `(a, b)`, `b != 0`,
/// attaining it. Panics on any other length.
pub fn linearity(table: &[Gf256]) -> LinearMax {
    let s = entries(table);
    // lat[b][a] = |W(a, b)|, scanned below in order of a, then b.
    let mut lat = vec![[0u32; 256]; 256];
    for (b, column) in lat.iter_mut().enumerate().skip(1) {
        for (a, w) in walsh_column(&s, b).iter().enumerate() {
            column[a] = w.unsigned_abs();
        }
    }
    let mut best = LinearMax {
        linearity: 0,
        input_mask: Gf256(0),
        output_mask: Gf256(1),
    };
    for a in 0..256usize {
        for (b, column) in lat.iter().enumerate().skip(1) {
            if column[a] > best.linearity {
                best = LinearMax {
                    linearity: column[a],
                    input_mask: Gf256(a as u8),
                    output_mask: Gf256(b as u8),
                };
            }
        }
    }
    best
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::design::aes_sbox;

    fn aes() -> Vec<Gf256> {
        aes_sbox().iter().copied().map(Gf256).collect()
    }

    fn naive_walsh(s: &[usize; 256], a: usize, b: usize) -> i32 {
        (0..256)
            .map(|x| {
                if ((a & x).count_ones() + (b & s[x]).count_ones()) & 1 == 0 {
                    1
                } else {
                    -1
                }
            })
            .sum()
    }

    /// The values and witnesses the AES templates state
    /// (`aes_sbox_differentialUniformity`, `aes_sbox_linearity`).
    #[test]
    fn aes_values_match_the_lean_library() {
        let t = aes();
        assert_eq!(
            differential_uniformity(&t),
            DifferentialMax {
                uniformity: 4,
                input_difference: Gf256(0x01),
                output_difference: Gf256(0x1F),
            }
        );
        assert_eq!(
            linearity(&t),
            LinearMax {
                linearity: 32,
                input_mask: Gf256(0x01),
                output_mask: Gf256(0x48),
            }
        );
    }

    #[test]
    fn transform_agrees_with_the_definition() {
        let s = entries(&aes());
        for b in [1usize, 0x48, 0xFF] {
            let w = walsh_column(&s, b);
            for a in [0usize, 1, 0x2D, 0x80, 0xFF] {
                assert_eq!(w[a], naive_walsh(&s, a, b), "a = {a}, b = {b}");
            }
        }
    }

    /// An edited AES S-box inherits nothing: swapping two entries raises the
    /// differential uniformity to 6.
    #[test]
    fn edited_aes_table() {
        let mut t = aes();
        t.swap(0, 1);
        assert_eq!(
            differential_uniformity(&t),
            DifferentialMax {
                uniformity: 6,
                input_difference: Gf256(0xBC),
                output_difference: Gf256(0x19),
            }
        );
        assert_eq!(linearity(&t).linearity, 32);
    }

    /// A linear map has the worst values, 256 for both.
    #[test]
    fn rotation_is_linear() {
        let t: Vec<Gf256> = (0..=255u8).map(|x| Gf256(x.rotate_left(1))).collect();
        assert_eq!(differential_uniformity(&t).uniformity, 256);
        assert_eq!(linearity(&t).linearity, 256);
    }

    /// A constant table: every difference goes to 0.
    #[test]
    fn constant_table() {
        let t = vec![Gf256(7); 256];
        let d = differential_uniformity(&t);
        assert_eq!(
            (d.uniformity, d.input_difference, d.output_difference),
            (256, Gf256(1), Gf256(0))
        );
        let l = linearity(&t);
        assert_eq!(
            (l.linearity, l.input_mask, l.output_mask),
            (256, Gf256(0), Gf256(1))
        );
    }
}
