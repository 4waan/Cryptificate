import Cryptificate

/-!
# AES-128 in the execution model, against FIPS 197

`aesLikeCipher` is the execution model with the AES final round (`aesLikeFinalRound`: no
MixColumns, then the last round key). These checks run it with the AES parameters and the
round keys of the FIPS 197 cipher key `2b 7e 15 16 …` on the worked example of FIPS 197,
Appendix B, and compare every intermediate state and the ciphertext
`39 25 84 1d 02 dc 09 fb dc 11 85 97 19 6a 0b 32` with the standard. So the model with
`r = 10` and these eleven keys is AES-128 encryption on this input, checked by the kernel.

The round keys are written out (the key expansion of FIPS 197, Appendix A.1); the model takes
round keys as data and has no key schedule. States are in state order: byte `4 * c + r` is
row `r`, column `c` (FIPS 197 prints them row by row). Our round `n` starts with the addition
of key `n`, so the state listed before round `n` is the FIPS 197 state after MixColumns of
round `n` (round `0` starts from the plaintext), and the final round adds keys `9` and `10`.

Each round is checked on its own with `decide +kernel` and the checks are composed by
rewriting: evaluating several rounds at once repeats earlier rounds inside every byte. The
rounds are evaluated with the FIPS 197 S-box table (`sboxTable`), a lookup the
kernel evaluates quickly, and `aes_sbox_eq_table` turns the result into a statement about
WideTrail's algebraic `AES.sbox` (inversion in `GF(2⁸)`, then the affine map).
-/

namespace Cryptificate.Examples.Cipher

open Cryptificate

/-- Sixteen bytes in state order, byte `p` being entry `p` of the list. -/
def state (l : List ℕ) : Fin 16 → GF256 := fun p => gf (l.getD p 0)

def aesMatrix4 : Matrix (Fin 4) (Fin 4) GF256 := gfMat4 2 3 1 1 1 2 3 1 1 1 2 3 3 1 1 2

def aesOffsets : Fin 4 → Fin 4 := offsets4 0 1 2 3

/-- The FIPS 197 S-box table as a map of `GF(2⁸)`; equal to `AES.sbox` by `aes_sbox_eq_table`. -/
def sboxTable : GF256 → GF256 := tableSbox aesSboxTable

/-- The plaintext of FIPS 197, Appendix B. -/
def plaintext : Fin 16 → GF256 :=
  state [0x32, 0x43, 0xf6, 0xa8, 0x88, 0x5a, 0x30, 0x8d, 0x31, 0x31, 0x98, 0xa2, 0xe0,
    0x37, 0x07, 0x34]

/-- The cipher key, round key `0`. -/
def key0 : Fin 16 → GF256 :=
  state [0x2b, 0x7e, 0x15, 0x16, 0x28, 0xae, 0xd2, 0xa6, 0xab, 0xf7, 0x15, 0x88, 0x09,
    0xcf, 0x4f, 0x3c]

/-- Round key `1` of the AES-128 key expansion of the cipher key. -/
def key1 : Fin 16 → GF256 :=
  state [0xa0, 0xfa, 0xfe, 0x17, 0x88, 0x54, 0x2c, 0xb1, 0x23, 0xa3, 0x39, 0x39, 0x2a,
    0x6c, 0x76, 0x05]

/-- Round key `2` of the AES-128 key expansion of the cipher key. -/
def key2 : Fin 16 → GF256 :=
  state [0xf2, 0xc2, 0x95, 0xf2, 0x7a, 0x96, 0xb9, 0x43, 0x59, 0x35, 0x80, 0x7a, 0x73,
    0x59, 0xf6, 0x7f]

/-- Round key `3` of the AES-128 key expansion of the cipher key. -/
def key3 : Fin 16 → GF256 :=
  state [0x3d, 0x80, 0x47, 0x7d, 0x47, 0x16, 0xfe, 0x3e, 0x1e, 0x23, 0x7e, 0x44, 0x6d,
    0x7a, 0x88, 0x3b]

/-- Round key `4` of the AES-128 key expansion of the cipher key. -/
def key4 : Fin 16 → GF256 :=
  state [0xef, 0x44, 0xa5, 0x41, 0xa8, 0x52, 0x5b, 0x7f, 0xb6, 0x71, 0x25, 0x3b, 0xdb,
    0x0b, 0xad, 0x00]

/-- Round key `5` of the AES-128 key expansion of the cipher key. -/
def key5 : Fin 16 → GF256 :=
  state [0xd4, 0xd1, 0xc6, 0xf8, 0x7c, 0x83, 0x9d, 0x87, 0xca, 0xf2, 0xb8, 0xbc, 0x11,
    0xf9, 0x15, 0xbc]

/-- Round key `6` of the AES-128 key expansion of the cipher key. -/
def key6 : Fin 16 → GF256 :=
  state [0x6d, 0x88, 0xa3, 0x7a, 0x11, 0x0b, 0x3e, 0xfd, 0xdb, 0xf9, 0x86, 0x41, 0xca,
    0x00, 0x93, 0xfd]

/-- Round key `7` of the AES-128 key expansion of the cipher key. -/
def key7 : Fin 16 → GF256 :=
  state [0x4e, 0x54, 0xf7, 0x0e, 0x5f, 0x5f, 0xc9, 0xf3, 0x84, 0xa6, 0x4f, 0xb2, 0x4e,
    0xa6, 0xdc, 0x4f]

/-- Round key `8` of the AES-128 key expansion of the cipher key. -/
def key8 : Fin 16 → GF256 :=
  state [0xea, 0xd2, 0x73, 0x21, 0xb5, 0x8d, 0xba, 0xd2, 0x31, 0x2b, 0xf5, 0x60, 0x7f,
    0x8d, 0x29, 0x2f]

/-- Round key `9` of the AES-128 key expansion of the cipher key. -/
def key9 : Fin 16 → GF256 :=
  state [0xac, 0x77, 0x66, 0xf3, 0x19, 0xfa, 0xdc, 0x21, 0x28, 0xd1, 0x29, 0x41, 0x57,
    0x5c, 0x00, 0x6e]

/-- Round key `10` of the AES-128 key expansion of the cipher key. -/
def key10 : Fin 16 → GF256 :=
  state [0xd0, 0x14, 0xf9, 0xa8, 0xc9, 0xee, 0x25, 0x89, 0xe1, 0x3f, 0x0c, 0xc8, 0xb6,
    0x63, 0x0c, 0xa6]

/-- The round keys `key0, …, key10` (and `key10` after them; the cipher does not use those). -/
def keys : ℕ → Fin 16 → GF256
  | 0 => key0 | 1 => key1 | 2 => key2 | 3 => key3 | 4 => key4 | 5 => key5 | 6 => key6
  | 7 => key7 | 8 => key8 | 9 => key9 | _ => key10

/-- The state before round `1`: FIPS 197, after MixColumns of round `1`. -/
def state1 : Fin 16 → GF256 :=
  state [0x04, 0x66, 0x81, 0xe5, 0xe0, 0xcb, 0x19, 0x9a, 0x48, 0xf8, 0xd3, 0x7a, 0x28,
    0x06, 0x26, 0x4c]

/-- The state before round `2`: FIPS 197, after MixColumns of round `2`. -/
def state2 : Fin 16 → GF256 :=
  state [0x58, 0x4d, 0xca, 0xf1, 0x1b, 0x4b, 0x5a, 0xac, 0xdb, 0xe7, 0xca, 0xa8, 0x1b,
    0x6b, 0xb0, 0xe5]

/-- The state before round `3`: FIPS 197, after MixColumns of round `3`. -/
def state3 : Fin 16 → GF256 :=
  state [0x75, 0xec, 0x09, 0x93, 0x20, 0x0b, 0x63, 0x33, 0x53, 0xc0, 0xcf, 0x7c, 0xbb,
    0x25, 0xd0, 0xdc]

/-- The state before round `4`: FIPS 197, after MixColumns of round `4`. -/
def state4 : Fin 16 → GF256 :=
  state [0x0f, 0xd6, 0xda, 0xa9, 0x60, 0x31, 0x38, 0xbf, 0x6f, 0xc0, 0x10, 0x6b, 0x5e,
    0xb3, 0x13, 0x01]

/-- The state before round `5`: FIPS 197, after MixColumns of round `5`. -/
def state5 : Fin 16 → GF256 :=
  state [0x25, 0xd1, 0xa9, 0xad, 0xbd, 0x11, 0xd1, 0x68, 0xb6, 0x3a, 0x33, 0x8e, 0x4c,
    0x4c, 0xc0, 0xb0]

/-- The state before round `6`: FIPS 197, after MixColumns of round `6`. -/
def state6 : Fin 16 → GF256 :=
  state [0x4b, 0x86, 0x8d, 0x6d, 0x2c, 0x4a, 0x89, 0x80, 0x33, 0x9d, 0xf4, 0xe8, 0x37,
    0xd2, 0x18, 0xd8]

/-- The state before round `7`: FIPS 197, after MixColumns of round `7`. -/
def state7 : Fin 16 → GF256 :=
  state [0x14, 0x15, 0xb5, 0xbf, 0x46, 0x16, 0x15, 0xec, 0x27, 0x46, 0x56, 0xd7, 0x34,
    0x2a, 0xd8, 0x43]

/-- The state before round `8`: FIPS 197, after MixColumns of round `8`. -/
def state8 : Fin 16 → GF256 :=
  state [0x00, 0x51, 0x2f, 0xd1, 0xb1, 0xc8, 0x89, 0xff, 0x54, 0x76, 0x6d, 0xcd, 0xfa,
    0x1b, 0x99, 0xea]

/-- The state before round `9`: FIPS 197, after MixColumns of round `9`. -/
def state9 : Fin 16 → GF256 :=
  state [0x47, 0x37, 0x94, 0xed, 0x40, 0xd4, 0xe4, 0xa5, 0xa3, 0x70, 0x3a, 0xa6, 0x4c,
    0x9f, 0x42, 0xbc]

/-- The ciphertext of FIPS 197, Appendix B. -/
def ciphertext : Fin 16 → GF256 :=
  state [0x39, 0x25, 0x84, 0x1d, 0x02, 0xdc, 0x09, 0xfb, 0xdc, 0x11, 0x85, 0x97, 0x19,
    0x6a, 0x0b, 0x32]

theorem round0 : aesLikeRound aesMatrix4 aesOffsets sboxTable (keys 0) plaintext = state1 := by
  decide +kernel

theorem round1 : aesLikeRound aesMatrix4 aesOffsets sboxTable (keys 1) state1 = state2 := by
  decide +kernel

theorem round2 : aesLikeRound aesMatrix4 aesOffsets sboxTable (keys 2) state2 = state3 := by
  decide +kernel

theorem round3 : aesLikeRound aesMatrix4 aesOffsets sboxTable (keys 3) state3 = state4 := by
  decide +kernel

theorem round4 : aesLikeRound aesMatrix4 aesOffsets sboxTable (keys 4) state4 = state5 := by
  decide +kernel

theorem round5 : aesLikeRound aesMatrix4 aesOffsets sboxTable (keys 5) state5 = state6 := by
  decide +kernel

theorem round6 : aesLikeRound aesMatrix4 aesOffsets sboxTable (keys 6) state6 = state7 := by
  decide +kernel

theorem round7 : aesLikeRound aesMatrix4 aesOffsets sboxTable (keys 7) state7 = state8 := by
  decide +kernel

theorem round8 : aesLikeRound aesMatrix4 aesOffsets sboxTable (keys 8) state8 = state9 := by
  decide +kernel

/-- The final round: no MixColumns, then key `10`. -/
theorem finalRound :
    aesLikeFinalRound aesOffsets sboxTable (keys 9) (keys 10) state9 = ciphertext := by
  decide +kernel

theorem exec1 : aesLikeExec aesMatrix4 aesOffsets sboxTable keys plaintext 1 = state1 := by
  rw [aesLikeExec_succ, aesLikeExec_zero]
  exact round0

theorem exec2 : aesLikeExec aesMatrix4 aesOffsets sboxTable keys plaintext 2 = state2 := by
  rw [aesLikeExec_succ, exec1]
  exact round1

theorem exec3 : aesLikeExec aesMatrix4 aesOffsets sboxTable keys plaintext 3 = state3 := by
  rw [aesLikeExec_succ, exec2]
  exact round2

theorem exec4 : aesLikeExec aesMatrix4 aesOffsets sboxTable keys plaintext 4 = state4 := by
  rw [aesLikeExec_succ, exec3]
  exact round3

theorem exec5 : aesLikeExec aesMatrix4 aesOffsets sboxTable keys plaintext 5 = state5 := by
  rw [aesLikeExec_succ, exec4]
  exact round4

theorem exec6 : aesLikeExec aesMatrix4 aesOffsets sboxTable keys plaintext 6 = state6 := by
  rw [aesLikeExec_succ, exec5]
  exact round5

theorem exec7 : aesLikeExec aesMatrix4 aesOffsets sboxTable keys plaintext 7 = state7 := by
  rw [aesLikeExec_succ, exec6]
  exact round6

theorem exec8 : aesLikeExec aesMatrix4 aesOffsets sboxTable keys plaintext 8 = state8 := by
  rw [aesLikeExec_succ, exec7]
  exact round7

theorem exec9 : aesLikeExec aesMatrix4 aesOffsets sboxTable keys plaintext 9 = state9 := by
  rw [aesLikeExec_succ, exec8]
  exact round8

/-- **AES-128 on the FIPS 197 example**: ten rounds of the model, the last one the final round,
under the eleven round keys, map the plaintext to the ciphertext of the standard. -/
theorem aes128_fips197 :
    aesLikeCipher aesMatrix4 aesOffsets AES.sbox keys plaintext 10 = ciphertext := by
  rw [show AES.sbox = sboxTable from funext aes_sbox_eq_table, aesLikeCipher_succ, exec9]
  exact finalRound

/-- The same output, from the round-by-round execution of the ten-round cipher. -/
example : aesLikeCipherExec aesMatrix4 aesOffsets AES.sbox keys 10 plaintext 10 = ciphertext := by
  rw [aesLikeCipherExec_self]
  exact aes128_fips197

end Cryptificate.Examples.Cipher

/--
info: 'Cryptificate.Examples.Cipher.aes128_fips197' depends on axioms: [propext, Classical.choice, Quot.sound]
-/
#guard_msgs in
#print axioms Cryptificate.Examples.Cipher.aes128_fips197
