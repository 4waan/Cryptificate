
/-- Claim `activity.outer`: run the candidate permutation over `ZMod candModulus` on two distinct
inputs: the external matrix, then `h = candFullRounds / 2` full rounds, `candPartialRounds`
partial rounds with S-boxes on the positions in `mask`, and `h` full rounds, where each round adds
its constant, applies `x ↦ x ^ candExponent` and multiplies by its matrix. For every mask and
every choice of round constants, at least `(h / 2 + h / 2) * 3 + h % 2 + h % 2` S-box
evaluations in the full rounds receive different inputs in the two executions (`3` is the
branch number of an MDS matrix of width `2`). Partial rounds are not counted. Uses
`external_mds`, `internal_invertible` and `power_bijective` from this file. -/
theorem hades_activity :
    ∀ (mask : Finset (Fin 2)) (constants : ℕ → Fin 2 → ZMod candModulus)
      (x y : Fin 2 → ZMod candModulus), x ≠ y →
        (candFullRounds / 2 / 2 + candFullRounds / 2 / 2) * 3
            + candFullRounds / 2 % 2 + candFullRounds / 2 % 2
          ≤ Hades.Design.outerActivity
              { external := candExternal, internal := candInternal, exponent := candExponent,
                fullRounds := candFullRounds, partialRounds := candPartialRounds }
              mask constants x y :=
  -- The design is passed explicitly: leaving it to unification makes elaboration time out.
  fun mask constants _ _ hxy =>
    Hades.Design.outer_activity
      { external := candExternal, internal := candInternal, exponent := candExponent,
        fullRounds := candFullRounds, partialRounds := candPartialRounds }
      external_mds internal_invertible power_bijective mask constants hxy
