import WideTrail

/-!
# Literal encodings for submitted values

Certificates are generated from structured requests. These helpers turn the numerals that the
generator writes into field elements, so every certificate spells out its inputs the same way.

A byte coefficient such as `02` becomes `GF256.mk (BitVec.ofNat 8 2)`, the field element `x`.
The Lean numeral `(2 : GF256)` would instead mean `1 + 1 = 0` in characteristic two, so the
generator never writes numerals of type `GF256`.
-/

namespace Cryptificate

open GF256

/-- The byte `n mod 256` as an element of `GF(2⁸)`. -/
def gf (n : Nat) : GF256 := ⟨BitVec.ofNat 8 n⟩

/-- A row-major `4 × 4` matrix over `GF(2⁸)` from sixteen byte numerals. -/
def gfMat4 (a00 a01 a02 a03 a10 a11 a12 a13 a20 a21 a22 a23 a30 a31 a32 a33 : Nat) :
    Matrix (Fin 4) (Fin 4) GF256 :=
  !![gf a00, gf a01, gf a02, gf a03;
     gf a10, gf a11, gf a12, gf a13;
     gf a20, gf a21, gf a22, gf a23;
     gf a30, gf a31, gf a32, gf a33]

/-- A column of four bytes, in row order. -/
def gfVec4 (a0 a1 a2 a3 : Nat) : Fin 4 → GF256 := ![gf a0, gf a1, gf a2, gf a3]

/-- An element of the BN254 scalar field from a natural-number numeral (reduced mod `p`). -/
def bn (n : Nat) : Poseidon2.BN254.F := (n : Poseidon2.BN254.F)

/-- A row-major `3 × 3` matrix over the BN254 scalar field. -/
def bnMat3 (a00 a01 a02 a10 a11 a12 a20 a21 a22 : Nat) :
    Matrix (Fin 3) (Fin 3) Poseidon2.BN254.F :=
  !![bn a00, bn a01, bn a02;
     bn a10, bn a11, bn a12;
     bn a20, bn a21, bn a22]

/-- A BN254 state of width three. -/
def bnVec3 (a0 a1 a2 : Nat) : Fin 3 → Poseidon2.BN254.F := ![bn a0, bn a1, bn a2]

/-- Four row offsets, each read modulo four. -/
def offsets4 (o0 o1 o2 o3 : Nat) : Fin 4 → Fin 4 :=
  ![Fin.ofNat 4 o0, Fin.ofNat 4 o1, Fin.ofNat 4 o2, Fin.ofNat 4 o3]

example : gf 0x02 * gf 0x80 = gf 0x1B := by decide

example : (Matrix.mulVec (gfMat4 2 3 1 1 1 2 3 1 1 1 2 3 3 1 1 2) (gfVec4 0x80 0 0 0)) =
    gfVec4 0x1B 0x80 0x80 0x9B := by decide

end Cryptificate
