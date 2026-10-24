import Cryptificate

/-!
# The execution model against FIPS 197

`activity_bound` is a statement about `aesLikeExec`, so the claim is only as meaningful as that
definition. These checks run it with the AES parameters on the worked example of FIPS 197,
Appendix B (plaintext `32 43 f6 a8 …`, cipher key `2b 7e 15 16 …`), and compare with the
states the standard prints, so the byte layout `state[4 * c + r]`, the direction of row
shifting and the order of the steps inside a round are tested against the standard rather than
against this project's own reading of it.

A round of `aesLikeExec` is AddRoundKey, SubBytes, ShiftRows, MixColumns, so its first round,
under the cipher key, ends at the state FIPS 197 lists after the first MixColumns, and the
second round, under the first round key, ends at the state after the second MixColumns.

The S-box evaluations use `decide +kernel`: the kernel evaluates them directly, where the
elaborator's evaluator, which `decide` runs first, is much slower on field inversion. The
axioms are the same.
-/

-- Evaluating the S-box inverts in `GF(2⁸)`, which is deeper than the default recursion limit.
set_option maxRecDepth 16000

namespace Cryptificate.Examples.Bridge

open Cryptificate

/-- Sixteen bytes in state order, byte `p` being entry `p` of the list. -/
def state (l : List ℕ) : Fin 16 → GF256 := fun p => gf (l.getD p 0)

def aesMatrix4 : Matrix (Fin 4) (Fin 4) GF256 := gfMat4 2 3 1 1 1 2 3 1 1 1 2 3 3 1 1 2

def aesOffsets : Fin 4 → Fin 4 := offsets4 0 1 2 3

def plaintext : Fin 16 → GF256 :=
  state [0x32, 0x43, 0xf6, 0xa8, 0x88, 0x5a, 0x30, 0x8d, 0x31, 0x31, 0x98, 0xa2, 0xe0, 0x37,
    0x07, 0x34]

/-- The cipher key, which is also the round key added at the start of round one. -/
def roundKey0 : Fin 16 → GF256 :=
  state [0x2b, 0x7e, 0x15, 0x16, 0x28, 0xae, 0xd2, 0xa6, 0xab, 0xf7, 0x15, 0x88, 0x09, 0xcf,
    0x4f, 0x3c]

def roundKey1 : Fin 16 → GF256 :=
  state [0xa0, 0xfa, 0xfe, 0x17, 0x88, 0x54, 0x2c, 0xb1, 0x23, 0xa3, 0x39, 0x39, 0x2a, 0x6c,
    0x76, 0x05]

def keys : ℕ → Fin 16 → GF256 := fun n => if n = 0 then roundKey0 else roundKey1

/-- After SubBytes in round one. -/
def afterSubBytes1 : Fin 16 → GF256 :=
  state [0xd4, 0x27, 0x11, 0xae, 0xe0, 0xbf, 0x98, 0xf1, 0xb8, 0xb4, 0x5d, 0xe5, 0x1e, 0x41,
    0x52, 0x30]

/-- After ShiftRows in round one. -/
def afterShiftRows1 : Fin 16 → GF256 :=
  state [0xd4, 0xbf, 0x5d, 0x30, 0xe0, 0xb4, 0x52, 0xae, 0xb8, 0x41, 0x11, 0xf1, 0x1e, 0x27,
    0x98, 0xe5]

/-- After MixColumns in round one. -/
def afterRound1 : Fin 16 → GF256 :=
  state [0x04, 0x66, 0x81, 0xe5, 0xe0, 0xcb, 0x19, 0x9a, 0x48, 0xf8, 0xd3, 0x7a, 0x28, 0x06,
    0x26, 0x4c]

/-- After MixColumns in round two. -/
def afterRound2 : Fin 16 → GF256 :=
  state [0x58, 0x4d, 0xca, 0xf1, 0x1b, 0x4b, 0x5a, 0xac, 0xdb, 0xe7, 0xca, 0xa8, 0x1b, 0x6b,
    0xb0, 0xe5]

/-- Row shifting with offsets `0, 1, 2, 3` is AES ShiftRows. -/
example : shiftRows aesOffsets afterSubBytes1 = afterShiftRows1 := by decide

/-- The S-box layer after the first key addition. -/
example : subBytes AES.sbox (addRoundKey roundKey0 plaintext) = afterSubBytes1 := by decide +kernel

/-- Column mixing by the AES matrix is AES MixColumns. -/
example : mixColumns aesMatrix4 afterShiftRows1 = afterRound1 := by decide +kernel

/-- One full round. -/
theorem exec_one : aesLikeExec aesMatrix4 aesOffsets AES.sbox keys plaintext 1 = afterRound1 := by
  decide +kernel

/-- The second round on its own, from the state FIPS 197 lists after round one. -/
theorem round_two :
    aesLikeRound aesMatrix4 aesOffsets AES.sbox roundKey1 afterRound1 = afterRound2 := by
  decide +kernel

/-- Two full rounds. Evaluating both at once repeats the first round inside every byte of the
second, so the two checks above are composed instead. -/
example : aesLikeExec aesMatrix4 aesOffsets AES.sbox keys plaintext 2 = afterRound2 := by
  rw [aesLikeExec_succ, exec_one]
  exact round_two

end Cryptificate.Examples.Bridge
