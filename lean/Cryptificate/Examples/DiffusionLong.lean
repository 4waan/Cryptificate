import Cryptificate

/-!
# Example: thirty-two rounds

The row-scaled matrix of `DiffusionFresh` with the offsets `0 3 2 1`, thirty-two rounds and the
AES S-box: eight four-round blocks, `8 · 25 = 200` active S-boxes.

Instantiated by `scripts/instantiate.py` from the fragments `header`, `const_matrix_gf256`,
`const_offsets`, `const_rounds`, `const_sbox_aes`, `matrix_mds`, `offsets_optimal`,
`activity_bound`, `sbox_bijective_aes` and `footer`.
-/

set_option autoImplicit false
set_option maxRecDepth 16000
set_option maxHeartbeats 2000000

namespace CryptificateJob

open Cryptificate

/-- The candidate's `4 × 4` mixing matrix over `GF(2⁸)`, row-major as submitted. -/
def candMatrix : Matrix (Fin 4) (Fin 4) GF256 :=
  gfMat4 0x04 0x06 0x02 0x02 0x01 0x02 0x03 0x01 0x01 0x01 0x02 0x03 0x03 0x01 0x01 0x02

#eval Audit.echoInput "candMatrix" candMatrix

/-- The candidate's row offsets: `out[r][c] = in[r][(c + candOffsets r) mod 4]`, row `r`
rotated left by `candOffsets r`. -/
def candOffsets : Fin 4 → Fin 4 :=
  offsets4 0 3 2 1

#eval Audit.echoInput "candOffsets" candOffsets

/-- The candidate's number of rounds. -/
def candRounds : ℕ := 32

#eval Audit.echoInput "candRounds" candRounds

/-- The candidate's S-box is the AES S-box of FIPS 197, as WideTrail defines it: inversion in
`GF(2⁸)` followed by the affine map with constant `63`. -/
def candSboxTable : GF256 → GF256 := AES.sbox

#eval echoSboxAes "candSboxTable"

/-- Claim `matrix.mds`: every square submatrix of `candMatrix` is nonsingular, so its branch
number is `5`. The kernel evaluates the `69` canonical minors by explicit formulas
(`minors4Ok`), and `isMDS_of_minors4Ok`, proved once for every matrix, turns that into
WideTrail's `IsMDS`. -/
theorem matrix_mds : IsMDS candMatrix :=
  isMDS_of_minors4Ok candMatrix (by decide +kernel)

/-- Claim `offsets.dispersion`: the offsets are pairwise distinct, so row shifting sends the
four bytes of every column to four different columns (Definition 5 of Daemen and Rijmen,
WideTrail's `DiffusionOptimal`). -/
theorem offsets_optimal : DiffusionOptimal (gridCol 4 4) (shiftRowsPerm 4 4 candOffsets) :=
  diffusionOptimal_of_injective (by decide)

/-- Claim `activity.bound`: take any injective byte S-box, any sequence of round keys and two
distinct 16-byte inputs, and run `candRounds` rounds of add round key, S-box, shift rows by
`candOffsets` and mix columns by `candMatrix` on both. At least
`candRounds / 4 * 25 + (5 if candRounds % 4 ≥ 2)` S-box evaluations receive different inputs
in the two executions. Uses `matrix_mds` and `offsets_optimal` from this file. -/
theorem activity_bound :
    ∀ (sbox : GF256 → GF256), Function.Injective sbox →
      ∀ (keys : ℕ → Fin 16 → GF256) (x y : Fin 16 → GF256), x ≠ y →
        candRounds / 4 * 25 + (if 2 ≤ candRounds % 4 then 5 else 0)
          ≤ activeSboxes candMatrix candOffsets sbox keys x y candRounds :=
  fun _ hs keys _ _ hxy => activeSboxes_bound matrix_mds offsets_optimal hs keys hxy candRounds

/-- Claim `sbox.bijective` for the AES S-box, from WideTrail's explicit inverse
`AES.sboxInv`; no table is evaluated. -/
theorem sbox_bijective : Function.Bijective candSboxTable :=
  aes_sbox_bijective

end CryptificateJob
#cryptificate_audit CryptificateJob.matrix_mds
#cryptificate_audit CryptificateJob.offsets_optimal
#cryptificate_audit CryptificateJob.activity_bound
#cryptificate_audit CryptificateJob.sbox_bijective

-- The bound `activity_bound` states, evaluated at this round count.
example : CryptificateJob.candRounds / 4 * 25
    + (if 2 ≤ CryptificateJob.candRounds % 4 then 5 else 0) = 200 := by decide
