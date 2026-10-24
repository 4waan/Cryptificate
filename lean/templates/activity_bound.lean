
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
