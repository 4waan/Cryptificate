//! Parametric AES-like round on a 16-byte state over GF(2^8).
//!
//! The design is runtime data: the 4x4 mixing matrix, the row offsets, the
//! S-box table and the round keys are arguments, so one implementation (and
//! one refinement proof) covers every submitted AES-like design.
//!
//! Conventions (the candidate format of the analysis service):
//!
//! * the state holds row `r`, column `c` at byte `4 * c + r` (column-major, as
//!   in AES);
//! * `matrix` is row-major: entry `(r, j)` is `matrix[4 * r + j]`, and column
//!   mixing computes `y = M x` for every column `x`;
//! * row shifting is `out[r][c] = in[r][(c + offsets[r]) mod 4]`;
//! * one round is: add the round key, apply the S-box to every byte, shift
//!   rows, mix columns. `encrypt` applies only rounds of this shape;
//! * the final round (`final_round`) is: add the round key, apply the S-box,
//!   shift rows, add a final key, with no column mixing, as the last round of
//!   AES. `encrypt_with_last_round` applies `rounds - 1` full rounds and then
//!   the final round, using `rounds + 1` keys. With the AES matrix, offsets,
//!   S-box and the AES-128 key expansion (computed by the caller; the key
//!   schedule is not part of this module) and `rounds = 10` it is AES-128
//!   encryption.
//!
//! These functions are the input of the Rust-source refinement in
//! `refinement/`: Charon and Aeneas translate this file to Lean, where `round`,
//! `encrypt`, `final_round` and `encrypt_with_last_round` are proved equal to
//! the execution model of the main Lean package over WideTrail's GF(2^8). Keep
//! them in the subset those tools handle (`while` loops, no iterators or
//! closures) and run `refinement/extract.sh --write` after changing them.

use crate::gf256;

/// Add the round key, bytewise.
pub fn add_round_key(state: &mut [u8; 16], round_key: &[u8; 16]) {
    let mut i = 0;
    while i < 16 {
        state[i] = gf256::add(state[i], round_key[i]);
        i += 1;
    }
}

/// Replace every byte `x` by `sbox[x]`.
pub fn sub_bytes(state: &mut [u8; 16], sbox: &[u8; 256]) {
    let mut i = 0;
    while i < 16 {
        state[i] = sbox[state[i] as usize];
        i += 1;
    }
}

/// Shift rows: `out[r][c] = in[r][(c + offsets[r]) mod 4]`.
///
/// The offsets are reduced modulo 4, so every offset value is accepted.
pub fn shift_rows(state: &mut [u8; 16], offsets: &[u8; 4]) {
    let input = *state;
    let mut i = 0;
    while i < 16 {
        let r = i % 4;
        let c = i / 4;
        state[i] = input[4 * ((c + offsets[r] as usize) % 4) + r];
        i += 1;
    }
}

/// Entry `(r, c)` of `M x`, where `x` is column `c` of `input`.
fn mix_byte(matrix: &[u8; 16], input: &[u8; 16], r: usize, c: usize) -> u8 {
    let t0 = gf256::mul(matrix[4 * r], input[4 * c]);
    let t1 = gf256::mul(matrix[4 * r + 1], input[4 * c + 1]);
    let t2 = gf256::mul(matrix[4 * r + 2], input[4 * c + 2]);
    let t3 = gf256::mul(matrix[4 * r + 3], input[4 * c + 3]);
    gf256::add(gf256::add(gf256::add(t0, t1), t2), t3)
}

/// Mix columns: column `c` of the output is `M` times column `c` of the input.
pub fn mix_columns(state: &mut [u8; 16], matrix: &[u8; 16]) {
    let input = *state;
    let mut i = 0;
    while i < 16 {
        state[i] = mix_byte(matrix, &input, i % 4, i / 4);
        i += 1;
    }
}

/// One round: add the round key, substitute bytes, shift rows, mix columns.
pub fn round(
    state: &mut [u8; 16],
    matrix: &[u8; 16],
    offsets: &[u8; 4],
    sbox: &[u8; 256],
    round_key: &[u8; 16],
) {
    add_round_key(state, round_key);
    sub_bytes(state, sbox);
    shift_rows(state, offsets);
    mix_columns(state, matrix);
}

/// Apply `rounds` rounds, round `n` with `round_keys[n]`.
///
/// Panics if `rounds > round_keys.len()`.
pub fn encrypt(
    state: &mut [u8; 16],
    matrix: &[u8; 16],
    offsets: &[u8; 4],
    sbox: &[u8; 256],
    round_keys: &[[u8; 16]],
    rounds: usize,
) {
    let mut n = 0;
    while n < rounds {
        round(state, matrix, offsets, sbox, &round_keys[n]);
        n += 1;
    }
}

/// The final round: add `round_key`, substitute bytes, shift rows, add
/// `final_key`. There is no column mixing, as in the last round of AES.
pub fn final_round(
    state: &mut [u8; 16],
    offsets: &[u8; 4],
    sbox: &[u8; 256],
    round_key: &[u8; 16],
    final_key: &[u8; 16],
) {
    add_round_key(state, round_key);
    sub_bytes(state, sbox);
    shift_rows(state, offsets);
    add_round_key(state, final_key);
}

/// Apply `rounds` rounds of which the last one is a final round: rounds
/// `0, ..., rounds - 2` are full rounds with `round_keys[n]`, then the final
/// round with `round_keys[rounds - 1]` and `round_keys[rounds]`. With
/// `rounds = 0` the state is left unchanged.
///
/// Panics if `rounds > 0` and `rounds >= round_keys.len()` (`rounds + 1` keys
/// are needed).
pub fn encrypt_with_last_round(
    state: &mut [u8; 16],
    matrix: &[u8; 16],
    offsets: &[u8; 4],
    sbox: &[u8; 256],
    round_keys: &[[u8; 16]],
    rounds: usize,
) {
    if rounds > 0 {
        encrypt(state, matrix, offsets, sbox, round_keys, rounds - 1);
        final_round(
            state,
            offsets,
            sbox,
            &round_keys[rounds - 1],
            &round_keys[rounds],
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const AES_MATRIX: [u8; 16] = [
        0x02, 0x03, 0x01, 0x01, //
        0x01, 0x02, 0x03, 0x01, //
        0x01, 0x01, 0x02, 0x03, //
        0x03, 0x01, 0x01, 0x02,
    ];
    const AES_OFFSETS: [u8; 4] = [0, 1, 2, 3];

    /// The AES S-box, derived from the field inverse and the affine map.
    fn aes_sbox() -> [u8; 256] {
        let mut table = [0u8; 256];
        for x in 0..=255u8 {
            let mut inv = 0u8;
            for y in 1..=255u8 {
                if gf256::mul(x, y) == 1 {
                    inv = y;
                }
            }
            let b = inv;
            table[x as usize] =
                b ^ b.rotate_left(1) ^ b.rotate_left(2) ^ b.rotate_left(3) ^ b.rotate_left(4) ^ 0x63;
        }
        table
    }

    fn hex16(s: &str) -> [u8; 16] {
        let mut out = [0u8; 16];
        for (i, b) in out.iter_mut().enumerate() {
            *b = u8::from_str_radix(&s[2 * i..2 * i + 2], 16).unwrap();
        }
        out
    }

    /// Straightforward reference written with explicit (row, column) indices.
    fn reference_round(
        state: [u8; 16],
        matrix: &[u8; 16],
        offsets: &[u8; 4],
        sbox: &[u8; 256],
        key: &[u8; 16],
    ) -> [u8; 16] {
        let mut grid = [[0u8; 4]; 4];
        for r in 0..4 {
            for c in 0..4 {
                grid[r][c] = sbox[(state[4 * c + r] ^ key[4 * c + r]) as usize];
            }
        }
        let mut shifted = [[0u8; 4]; 4];
        for r in 0..4 {
            for c in 0..4 {
                shifted[r][c] = grid[r][(c + offsets[r] as usize) % 4];
            }
        }
        let mut out = [0u8; 16];
        for c in 0..4 {
            for r in 0..4 {
                let mut acc = 0u8;
                for j in 0..4 {
                    acc ^= gf256::mul(matrix[4 * r + j], shifted[j][c]);
                }
                out[4 * c + r] = acc;
            }
        }
        out
    }

    #[test]
    fn sbox_matches_known_entries() {
        let s = aes_sbox();
        assert_eq!(s[0x00], 0x63);
        assert_eq!(s[0x01], 0x7C);
        assert_eq!(s[0x53], 0xED);
        assert_eq!(s[0xFF], 0x16);
    }

    #[test]
    fn mix_columns_gates() {
        let mut state = [0u8; 16];
        state[0] = 0x01;
        mix_columns(&mut state, &AES_MATRIX);
        assert_eq!(&state[0..4], &[0x02, 0x01, 0x01, 0x03]);
        let mut state = [0u8; 16];
        state[4] = 0x80;
        mix_columns(&mut state, &AES_MATRIX);
        assert_eq!(&state[4..8], &[0x1B, 0x80, 0x80, 0x9B]);
    }

    #[test]
    fn shift_rows_moves_row_r_left_by_offset() {
        let mut state = [0u8; 16];
        for (i, b) in state.iter_mut().enumerate() {
            *b = i as u8;
        }
        shift_rows(&mut state, &AES_OFFSETS);
        // AES ShiftRows on bytes 0..15 (column-major).
        assert_eq!(state, [0, 5, 10, 15, 4, 9, 14, 3, 8, 13, 2, 7, 12, 1, 6, 11]);
    }

    /// FIPS-197 Appendix B, round 1: the round output equals the state at the
    /// start of round 2 with the second round key removed.
    #[test]
    fn fips197_first_round() {
        let input = hex16("3243f6a8885a308d313198a2e0370734");
        let k0 = hex16("2b7e151628aed2a6abf7158809cf4f3c");
        let k1 = hex16("a0fafe1788542cb123a339392a6c7605");
        let start2 = hex16("a49c7ff2689f352b6b5bea43026a5049");
        let mut state = input;
        round(&mut state, &AES_MATRIX, &AES_OFFSETS, &aes_sbox(), &k0);
        let mut expected = start2;
        add_round_key(&mut expected, &k1);
        assert_eq!(state, expected);
    }

    #[test]
    fn round_matches_reference_on_parametric_designs() {
        let sbox = aes_sbox();
        let mut seed = 0x9E37_79B9_7F4A_7C15u64;
        let mut next = || {
            seed ^= seed << 13;
            seed ^= seed >> 7;
            seed ^= seed << 17;
            seed
        };
        for _ in 0..500 {
            let mut matrix = [0u8; 16];
            let mut state = [0u8; 16];
            let mut key = [0u8; 16];
            for i in 0..16 {
                matrix[i] = next() as u8;
                state[i] = next() as u8;
                key[i] = next() as u8;
            }
            let offsets = [next() as u8, next() as u8, next() as u8, next() as u8];
            let expected = reference_round(state, &matrix, &offsets, &sbox, &key);
            let mut actual = state;
            round(&mut actual, &matrix, &offsets, &sbox, &key);
            assert_eq!(actual, expected);
        }
    }

    /// The AES-128 key expansion of FIPS-197 section 5.2, as eleven round
    /// keys in state order. Test-only: the kernel takes round keys as data.
    fn aes128_round_keys(key: &[u8; 16]) -> [[u8; 16]; 11] {
        let sbox = aes_sbox();
        let mut w = [[0u8; 4]; 44];
        for i in 0..4 {
            w[i].copy_from_slice(&key[4 * i..4 * i + 4]);
        }
        let mut rcon = 0x01u8;
        for i in 4..44 {
            let mut t = w[i - 1];
            if i % 4 == 0 {
                t = [
                    sbox[t[1] as usize] ^ rcon,
                    sbox[t[2] as usize],
                    sbox[t[3] as usize],
                    sbox[t[0] as usize],
                ];
                rcon = gf256::xtime(rcon);
            }
            for j in 0..4 {
                w[i][j] = w[i - 4][j] ^ t[j];
            }
        }
        let mut keys = [[0u8; 16]; 11];
        for (n, k) in keys.iter_mut().enumerate() {
            for c in 0..4 {
                k[4 * c..4 * c + 4].copy_from_slice(&w[4 * n + c]);
            }
        }
        keys
    }

    fn aes128_encrypt(key: &str, plaintext: &str) -> [u8; 16] {
        let keys = aes128_round_keys(&hex16(key));
        let mut state = hex16(plaintext);
        let sbox = aes_sbox();
        encrypt_with_last_round(&mut state, &AES_MATRIX, &AES_OFFSETS, &sbox, &keys, 10);
        state
    }

    /// FIPS-197 Appendix A.1: the first and the last round key of the
    /// expansion of `2b7e1516 28aed2a6 abf71588 09cf4f3c`.
    #[test]
    fn aes128_key_expansion_matches_fips197() {
        let keys = aes128_round_keys(&hex16("2b7e151628aed2a6abf7158809cf4f3c"));
        assert_eq!(keys[1], hex16("a0fafe1788542cb123a339392a6c7605"));
        assert_eq!(keys[10], hex16("d014f9a8c9ee2589e13f0cc8b6630ca6"));
    }

    /// FIPS-197 Appendix B: the cipher example.
    #[test]
    fn fips197_appendix_b_ciphertext() {
        assert_eq!(
            aes128_encrypt(
                "2b7e151628aed2a6abf7158809cf4f3c",
                "3243f6a8885a308d313198a2e0370734"
            ),
            hex16("3925841d02dc09fbdc118597196a0b32")
        );
    }

    /// FIPS-197 Appendix C.1: the AES-128 known-answer vector.
    #[test]
    fn fips197_appendix_c1_aes128() {
        assert_eq!(
            aes128_encrypt(
                "000102030405060708090a0b0c0d0e0f",
                "00112233445566778899aabbccddeeff"
            ),
            hex16("69c4e0d86a7b0430d8cdb78070b4c55a")
        );
    }

    /// FIPS-197 Appendix B, round 10: from the state at the start of the last
    /// round (after its key addition), SubBytes, ShiftRows and the last key
    /// addition give the ciphertext. FIPS-197 prints states row by row; the
    /// bytes below are in state (column-major) order.
    #[test]
    fn fips197_final_round() {
        let keys = aes128_round_keys(&hex16("2b7e151628aed2a6abf7158809cf4f3c"));
        let start10 = hex16("eb40f21e592e38848ba113e71bc342d2");
        // `final_round` adds `keys[9]` first; remove it from the listed state.
        let mut state = start10;
        add_round_key(&mut state, &keys[9]);
        final_round(&mut state, &AES_OFFSETS, &aes_sbox(), &keys[9], &keys[10]);
        assert_eq!(state, hex16("3925841d02dc09fbdc118597196a0b32"));
    }

    #[test]
    fn encrypt_with_last_round_is_encrypt_then_final_round() {
        let sbox = aes_sbox();
        let mut seed = 0x2545_F491_4F6C_DD1Du64;
        let mut next = || {
            seed ^= seed << 13;
            seed ^= seed >> 7;
            seed ^= seed << 17;
            seed
        };
        for rounds in 1..6 {
            let mut keys = [[0u8; 16]; 6];
            let mut matrix = [0u8; 16];
            let mut start = [0u8; 16];
            for i in 0..16 {
                matrix[i] = next() as u8;
                start[i] = next() as u8;
                for k in keys.iter_mut() {
                    k[i] = next() as u8;
                }
            }
            let offsets = [next() as u8, next() as u8, next() as u8, next() as u8];
            let mut expected = start;
            for k in &keys[..rounds - 1] {
                expected = reference_round(expected, &matrix, &offsets, &sbox, k);
            }
            // The final round is the reference round with the identity matrix,
            // followed by the last key.
            let identity: [u8; 16] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
            expected = reference_round(expected, &identity, &offsets, &sbox, &keys[rounds - 1]);
            for i in 0..16 {
                expected[i] ^= keys[rounds][i];
            }
            let mut actual = start;
            let used = &keys[..rounds + 1];
            encrypt_with_last_round(&mut actual, &matrix, &offsets, &sbox, used, rounds);
            assert_eq!(actual, expected);
        }
    }

    #[test]
    fn encrypt_with_last_round_zero_rounds_is_identity() {
        let start = hex16("00112233445566778899aabbccddeeff");
        let mut state = start;
        encrypt_with_last_round(&mut state, &AES_MATRIX, &AES_OFFSETS, &aes_sbox(), &[], 0);
        assert_eq!(state, start);
    }

    #[test]
    #[should_panic]
    fn encrypt_with_last_round_needs_rounds_plus_one_keys() {
        let keys = [[0u8; 16]; 10];
        let mut state = [0u8; 16];
        let sbox = aes_sbox();
        encrypt_with_last_round(&mut state, &AES_MATRIX, &AES_OFFSETS, &sbox, &keys, 10);
    }

    #[test]
    fn encrypt_iterates_rounds_with_their_keys() {
        let sbox = aes_sbox();
        let keys = [
            hex16("000102030405060708090a0b0c0d0e0f"),
            hex16("101112131415161718191a1b1c1d1e1f"),
            hex16("202122232425262728292a2b2c2d2e2f"),
        ];
        let start = hex16("00112233445566778899aabbccddeeff");
        let mut expected = start;
        for k in &keys {
            expected = reference_round(expected, &AES_MATRIX, &AES_OFFSETS, &sbox, k);
        }
        let mut actual = start;
        encrypt(&mut actual, &AES_MATRIX, &AES_OFFSETS, &sbox, &keys, 3);
        assert_eq!(actual, expected);
        let mut none = start;
        encrypt(&mut none, &AES_MATRIX, &AES_OFFSETS, &sbox, &keys, 0);
        assert_eq!(none, start);
    }
}
