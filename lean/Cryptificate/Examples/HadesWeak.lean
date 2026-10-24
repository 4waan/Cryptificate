import Cryptificate

/-!
# Example: three refutations over BN254

The external matrix `[[2,1,1],[1,2,1],[1,1,1]]` is invertible (determinant `1`) but not MDS: the
state `[-1, 0, 1]` maps to `[-1, 0, 0]`, three nonzero coordinates in all, one short of the `4`
that an MDS matrix of width three forces. The internal matrix `[[1,2,3],[4,5,6],[7,8,9]]` sends
`[1, -2, 1]` to zero. The exponent `65535 = 3 * 5 * 17 * 257` shares the factor `3` with `p - 1`,
so the cube root of unity `ω` also satisfies `ω ^ 65535 = 1`; square-and-multiply computes this
with about thirty multiplications. No activity bound is stated.

Instantiated by `scripts/instantiate.py` from the fragments `header`, `const_external_bn254`,
`const_internal_bn254`, `const_exponent`, `const_rounds_hades`, `const_witness_external_bn254`,
`const_witness_internal_bn254`, `const_witness_power_bn254`, `external_not_mds`,
`internal_singular`, `power_not_injective` and `footer`.
-/

set_option autoImplicit false
set_option maxRecDepth 16000
set_option maxHeartbeats 2000000

namespace CryptificateJob

open Cryptificate

/-- The candidate's external matrix over the BN254 scalar field, row-major as submitted. HADES
mixes with it in every full round and, as Poseidon2 does, once before the first round. -/
def candExternal : Matrix (Fin 3) (Fin 3) Poseidon2.BN254.F :=
  bnMat3 2 1 1 1 2 1 1 1 1

#eval Audit.echoInput "candExternal" candExternal

/-- The candidate's internal matrix over the BN254 scalar field, row-major as submitted. HADES
mixes with it in every partial round. -/
def candInternal : Matrix (Fin 3) (Fin 3) Poseidon2.BN254.F :=
  bnMat3 1 2 3 4 5 6 7 8 9

#eval Audit.echoInput "candInternal" candInternal

/-- The exponent `e` of the candidate's power S-box `x ↦ x ^ e`. -/
def candExponent : ℕ := 65535

#eval Audit.echoInput "candExponent" candExponent

/-- The candidate's number of full rounds, half of them before the partial rounds and half
after. -/
def candFullRounds : ℕ := 8

#eval Audit.echoInput "candFullRounds" candFullRounds

/-- The candidate's number of partial rounds. -/
def candPartialRounds : ℕ := 56

#eval Audit.echoInput "candPartialRounds" candPartialRounds

/-- The branch-number witness for the external matrix: a nonzero state that, together with its
image under `candExternal`, has fewer than `4` nonzero coordinates. -/
def witnessVector : Fin 3 → Poseidon2.BN254.F :=
  bnVec3 21888242871839275222246405745257275088548364400416034343698204186575808495616 0 1

#eval Audit.echoInput "witnessVector" witnessVector

/-- The singularity witness for the internal matrix: a nonzero state that `candInternal` sends
to zero. -/
def witnessKernel : Fin 3 → Poseidon2.BN254.F :=
  bnVec3 1 21888242871839275222246405745257275088548364400416034343698204186575808495615 1

#eval Audit.echoInput "witnessKernel" witnessKernel

/-- The collision witness for the power S-box: an element other than `1` whose
`candExponent`-th power is `1`, so that it and `1` have the same image. -/
def witnessRoot : Poseidon2.BN254.F :=
  bn 4407920970296243842393367215006156084916469457145843978461

#eval Audit.echoInput "witnessRoot" witnessRoot

/-- Claim `external.mds`, refuted: `witnessVector` is nonzero, and it and its image under
`candExternal` have at most `3` nonzero coordinates between them, while an MDS matrix of width
three forces `4` (`isMDS_branch_bound`). -/
theorem external_not_mds : ¬ IsMDS candExternal :=
  not_isMDS_of_witness witnessVector (by decide) (by decide)

/-- Claim `internal.invertible`, refuted: `witnessKernel` is a nonzero state that
`candInternal` sends to zero, so the determinant of `candInternal` is zero. -/
theorem internal_singular : candInternal.det = 0 :=
  Mat3.det_eq_zero_of_mulVec_eq_zero witnessKernel (by decide) (by decide)

/-- Claim `sbox.bijective`, refuted: `witnessRoot ≠ 1` and `witnessRoot ^ candExponent = 1`,
which the kernel computes by square-and-multiply, so `1` and `witnessRoot` have the same image
under `x ↦ x ^ candExponent`. -/
theorem power_not_injective :
    ¬ Function.Injective (fun x : Poseidon2.BN254.F => x ^ candExponent) :=
  PrimePower.pow_not_injective_of_root candExponent witnessRoot (by decide) (by decide)

end CryptificateJob
#cryptificate_audit CryptificateJob.external_not_mds
#cryptificate_audit CryptificateJob.internal_singular
#cryptificate_audit CryptificateJob.power_not_injective
